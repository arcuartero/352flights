from __future__ import annotations

import os
import signal
import subprocess
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
