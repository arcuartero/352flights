from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from luxflight_scanner.config import ScannerConfig

AGENT_ID = "mac"
PRICE_SCANNER_LABEL = "com.luxcheapflights.scanner"
LOCK_DIR = Path("/tmp/luxcheapflights-scanner.lock")
LIVE_EVENT_LIMIT = 18
LOG_TAIL_BYTES = 384 * 1024


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def process_exists(pid: int | None) -> bool:
    if pid is None:
        return False
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError):
        return False


def read_lock_state() -> tuple[str | None, int | None, bool]:
    try:
        owner = (LOCK_DIR / "owner").read_text(encoding="utf-8").strip() or None
    except OSError:
        owner = None
    try:
        raw_pid = (LOCK_DIR / "pid").read_text(encoding="utf-8").strip()
        pid = int(raw_pid) if raw_pid.isdigit() else None
    except OSError:
        pid = None
    return owner, pid, process_exists(pid)


@dataclass(frozen=True)
class ControlCommand:
    id: str
    scanner_type: str
    action: str
    payload: dict[str, Any]


class MacScannerControlAgent:
    def __init__(self, config: ScannerConfig):
        if not config.has_supabase_credentials:
            raise RuntimeError("The Mac control agent requires Supabase credentials.")
        self.client = httpx.Client(
            base_url=f"{config.supabase_url.rstrip('/')}/rest/v1",
            headers={
                "apikey": config.supabase_service_role_key or "",
                "Authorization": f"Bearer {config.supabase_service_role_key or ''}",
                "Content-Type": "application/json",
            },
            timeout=15,
        )
        self.gui_domain = f"gui/{os.getuid()}"
        self.state_path = config.state_path
        self.live_progress_path = config.state_path.with_name("live-progress.json")
        self.log_path = Path(
            os.getenv(
                "SCANNER_LOG_FILE",
                str(config.state_path.parent.parent / "logs" / "launchd.stderr.log"),
            )
        )

    def close(self) -> None:
        self.client.close()

    def heartbeat(self) -> None:
        owner, pid, active = read_lock_state()
        payload = {
            "id": AGENT_ID,
            "last_seen_at": utcnow_iso(),
            "price_scanner_running": active and owner == "price_scanner",
            "dates_scanner_running": active and owner == "dates_scanner",
            "active_owner": owner if active and owner in {"price_scanner", "dates_scanner"} else None,
            "active_pid": pid if active else None,
            "metadata": {
                "hostname": os.uname().nodename,
                "controller": "launchd",
            },
            "updated_at": utcnow_iso(),
        }
        response = self.client.post(
            "/scanner_control_agents",
            params={"on_conflict": "id"},
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            json=payload,
        )
        response.raise_for_status()
        try:
            self.publish_live_progress()
        except Exception as error:
            # Scanner control must keep working even if optional live telemetry fails.
            print(f"[{utcnow_iso()}] Live telemetry update failed: {error}", file=sys.stderr)

    @staticmethod
    def _as_record(value: object) -> dict[str, Any]:
        return dict(value) if isinstance(value, dict) else {}

    def _latest_running_mac_scan(self) -> dict[str, Any] | None:
        response = self.client.get(
            "/price_scan_runs",
            params={
                "select": "id,run_key,started_at,sync_summary",
                "status": "eq.running",
                "scanner_source": "eq.mac",
                "order": "started_at.desc",
                "limit": "1",
            },
        )
        response.raise_for_status()
        rows = response.json() or []
        return self._as_record(rows[0]) if rows else None

    def _read_local_progress(self, run_key: str) -> dict[str, Any] | None:
        for candidate in (self.live_progress_path, self.state_path):
            try:
                payload = json.loads(candidate.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue

            if candidate == self.live_progress_path:
                if str(payload.get("run_key")) == run_key:
                    return self._as_record(payload)
                continue

            runs = payload.get("price_scan_runs") if isinstance(payload, dict) else None
            if not isinstance(runs, list):
                continue
            for run in reversed(runs):
                if isinstance(run, dict) and str(run.get("run_key")) == run_key:
                    return dict(run)
        return None

    def _tail_log_lines(self) -> list[str]:
        try:
            with self.log_path.open("rb") as file:
                file.seek(0, os.SEEK_END)
                size = file.tell()
                file.seek(max(0, size - LOG_TAIL_BYTES))
                raw = file.read().decode("utf-8", errors="replace")
        except OSError:
            return []
        lines = raw.splitlines()
        return lines[1:] if size > LOG_TAIL_BYTES and lines else lines

    @staticmethod
    def _display_text(value: str) -> str:
        text = value.split(" ||meta|| ", 1)[0].strip()
        text = re.sub(
            r"\bpatterns\b",
            lambda match: "Rules" if match.group(0)[0].isupper() else "rules",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(
            r"\bpattern\b",
            lambda match: "Rule" if match.group(0)[0].isupper() else "rule",
            text,
            flags=re.IGNORECASE,
        )
        return text[:700]

    def _live_log_state(
        self,
        *,
        started_at: str | None,
    ) -> tuple[str | None, str | None, list[dict[str, Any]]]:
        started = None
        if started_at:
            try:
                started = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
            except ValueError:
                started = None

        current_route: str | None = None
        current_rule: str | None = None
        events: list[dict[str, Any]] = []
        line_pattern = re.compile(
            r"^\[(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})Z\]\s*(.*)$"
        )

        for raw_line in self._tail_log_lines():
            match = line_pattern.match(raw_line)
            if not match:
                continue
            timestamp = datetime.fromisoformat(f"{match.group(1)}T{match.group(2)}+00:00")
            if started is not None and timestamp < started:
                continue
            message = self._display_text(match.group(3))
            iso_timestamp = timestamp.isoformat().replace("+00:00", "Z")

            route_match = re.match(
                r"Route start:\s*\d+/\d+\s*[·-]\s*([A-Z]{3}\s*->\s*[A-Z]{3})",
                message,
            )
            rule_match = re.match(
                r"Rule start:\s*\d+/\d+\s*[·-]\s*([A-Z]{3}\s*->\s*[A-Z]{3})\s+(.+)$",
                message,
            )
            if route_match:
                current_route = route_match.group(1)
                current_rule = None
            if rule_match:
                current_route = rule_match.group(1)
                current_rule = rule_match.group(2)

            label: str | None = None
            detail = message
            tone = "progress"
            prefixes = (
                ("Route start: ", "Route", "progress"),
                ("Rule start: ", "Rule", "progress"),
                ("Calendar combinations saved: ", "Calendar", "success"),
                ("Rule done: ", "Verified", "success"),
                ("Rule no results: ", "No results", "muted"),
                ("Fare live sync: ", "Price", "success"),
                ("Deal candidate: ", "Offer", "success"),
                ("Deal skipped: ", "Checked", "muted"),
                ("Rule retry: ", "Retry", "error"),
                ("Temporary provider response failure: ", "Retry", "error"),
                ("Fare live sync failed: ", "Sync", "error"),
                ("Deal live sync failed: ", "Sync", "error"),
            )
            for prefix, event_label, event_tone in prefixes:
                if message.startswith(prefix):
                    label = event_label
                    detail = message[len(prefix):]
                    tone = event_tone
                    break
            if label is None:
                continue
            events.append(
                {
                    "id": f"{iso_timestamp}:{label}:{detail[:120]}",
                    "timestamp": iso_timestamp,
                    "label": label,
                    "detail": detail,
                    "tone": tone,
                }
            )

        return current_route, current_rule, events[-LIVE_EVENT_LIMIT:]

    def publish_live_progress(self) -> bool:
        remote = self._latest_running_mac_scan()
        if remote is None:
            return False
        run_key = str(remote.get("run_key") or "")
        if not run_key:
            return False
        progress = self._read_local_progress(run_key)
        if progress is None or str(progress.get("status")) != "running":
            return False

        sync_summary = self._as_record(remote.get("sync_summary"))
        existing = self._as_record(sync_summary.get("live_telemetry"))
        source_updated_at = str(
            progress.get("updated_at")
            or progress.get("heartbeat_at")
            or progress.get("written_at")
            or ""
        )
        current_route, current_rule, events = self._live_log_state(
            started_at=str(remote.get("started_at") or progress.get("started_at") or "") or None,
        )
        if current_route is None:
            for route in reversed(list(progress.get("routes") or [])):
                if (
                    isinstance(route, dict)
                    and route.get("started") is True
                    and route.get("completed") is not True
                ):
                    current_route = str(route.get("route_label") or "") or None
                    break
        latest_event_id = str(events[-1].get("id") or "") if events else ""
        if (
            source_updated_at
            and existing.get("source_updated_at") == source_updated_at
            and existing.get("latest_event_id") == latest_event_id
        ):
            return False

        routes_started = int(progress.get("routes_started") or 0)
        routes_completed = int(progress.get("routes_completed") or 0)
        telemetry = {
            "published_at": utcnow_iso(),
            "source_updated_at": source_updated_at,
            "detail_routes_started": routes_started,
            "detail_routes_completed": routes_completed,
            "current_route_label": current_route,
            "current_rule_label": current_rule,
            "latest_event_id": latest_event_id,
            "recent_events": events,
        }
        sync_summary["live_telemetry"] = telemetry
        payload: dict[str, Any] = {
            "sync_summary": sync_summary,
            "patterns": list(progress.get("recent_rules") or progress.get("patterns") or [])[-16:],
        }
        detail_changed = (
            int(existing.get("detail_routes_started") or -1) != routes_started
            or int(existing.get("detail_routes_completed") or -1) != routes_completed
        )
        if detail_changed:
            payload["routes"] = list(progress.get("routes") or [])
            payload["destinations"] = list(progress.get("destinations") or [])

        response = self.client.patch(
            "/price_scan_runs",
            params={"id": f"eq.{remote['id']}"},
            headers={"Prefer": "return=minimal"},
            json=payload,
        )
        response.raise_for_status()
        return True

    def claim_command(self) -> ControlCommand | None:
        response = self.client.post(
            "/rpc/claim_next_scanner_control_command",
            json={"p_agent_id": AGENT_ID},
        )
        response.raise_for_status()
        rows = response.json() or []
        if not rows:
            return None
        row = rows[0]
        return ControlCommand(
            id=str(row["id"]),
            scanner_type=str(row["scanner_type"]),
            action=str(row["action"]),
            payload=dict(row.get("payload") or {}),
        )

    def finish_command(
        self,
        command: ControlCommand,
        *,
        status: str,
        result: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> None:
        response = self.client.patch(
            "/scanner_control_commands",
            params={"id": f"eq.{command.id}"},
            headers={"Prefer": "return=minimal"},
            json={
                "status": status,
                "completed_at": utcnow_iso(),
                "updated_at": utcnow_iso(),
                "result": result or {},
                "error": error,
            },
        )
        response.raise_for_status()

    def start_price_scanner(self) -> dict[str, Any]:
        owner, pid, active = read_lock_state()
        if active and owner == "price_scanner":
            return {"reason": "already_running", "pid": pid}
        if active:
            raise RuntimeError(f"The {owner or 'other'} Mac scanner is already running.")

        completed = subprocess.run(
            ["launchctl", "kickstart", f"{self.gui_domain}/{PRICE_SCANNER_LABEL}"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        if completed.returncode != 0:
            detail = completed.stderr.strip() or completed.stdout.strip() or "unknown launchctl error"
            raise RuntimeError(f"Could not start the Mac Price Scanner: {detail}")
        return {"reason": "started", "launchd_label": PRICE_SCANNER_LABEL}

    @staticmethod
    def stop_price_scanner() -> dict[str, Any]:
        owner, pid, active = read_lock_state()
        if not active or owner != "price_scanner" or pid is None:
            return {"reason": "already_stopped"}

        try:
            process_group = os.getpgid(pid)
            os.killpg(process_group, signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                return {"reason": "already_stopped"}

        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if not process_exists(pid):
                return {"reason": "stopped"}
            time.sleep(0.25)

        try:
            os.killpg(os.getpgid(pid), signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        return {"reason": "stopped_forcibly"}

    def execute(self, command: ControlCommand) -> dict[str, Any]:
        if command.scanner_type != "price_scanner":
            raise RuntimeError(f"Unsupported Mac scanner type: {command.scanner_type}")
        if command.action == "start":
            return self.start_price_scanner()
        if command.action == "stop":
            return self.stop_price_scanner()
        raise RuntimeError(f"Unsupported Mac scanner action: {command.action}")

    def run_once(self, *, claim_commands: bool = True) -> ControlCommand | None:
        self.heartbeat()
        if not claim_commands:
            return None
        command = self.claim_command()
        if command is None:
            return None
        try:
            result = self.execute(command)
            self.finish_command(command, status="completed", result=result)
            print(
                f"[{utcnow_iso()}] Completed {command.scanner_type} "
                f"{command.action} command {command.id}: {result.get('reason', 'completed')}"
            )
        except Exception as error:
            self.finish_command(command, status="failed", error=str(error))
            print(
                f"[{utcnow_iso()}] Failed {command.scanner_type} "
                f"{command.action} command {command.id}: {error}"
            )
        finally:
            time.sleep(0.5)
            self.heartbeat()
        return command


def main() -> int:
    agent = MacScannerControlAgent(ScannerConfig())
    try:
        agent.run_once(claim_commands=os.getenv("SCANNER_CONTROL_HEARTBEAT_ONLY") != "1")
        return 0
    finally:
        agent.close()


if __name__ == "__main__":
    raise SystemExit(main())
