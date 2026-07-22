#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import subprocess
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


SERVICE_NAME = os.getenv("SCANNER_SERVICE_NAME", "352flights-scanner")
TIMER_NAME = os.getenv("SCANNER_TIMER_NAME", f"{SERVICE_NAME}.timer")
PATTERN_SERVICE_NAME = os.getenv(
    "PATTERN_DISCOVERY_SERVICE_NAME", "352flights-pattern-discovery"
)
PATTERN_TIMER_NAME = os.getenv(
    "PATTERN_DISCOVERY_TIMER_NAME", f"{PATTERN_SERVICE_NAME}.timer"
)
ROOT_DIR = Path(os.getenv("SCANNER_ROOT", "/opt/352flights/app"))
PATTERN_REQUEST_FILE = ROOT_DIR / "scanner" / "state" / "vps-pattern-discovery-request.json"
HOST = os.getenv("VPS_SCANNER_AGENT_HOST", "0.0.0.0")
PORT = int(os.getenv("VPS_SCANNER_AGENT_PORT", "8787"))
TOKEN = os.getenv("VPS_SCANNER_AGENT_TOKEN", "")
LOG_LINES = int(os.getenv("VPS_SCANNER_AGENT_LOG_LINES", "2500"))
ACTION_LOCK = threading.Lock()
AIRPORT_CODE_PATTERN = re.compile(r"^[A-Z0-9]{3}$")
ROUTING_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]{1,31}$")


def run_command(args: list[str], timeout: int = 15) -> tuple[int, str, str]:
    try:
        completed = subprocess.run(
            args,
            check=False,
            text=True,
            capture_output=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as error:
        return 124, error.stdout or "", error.stderr or "Command timed out."
    except OSError as error:
        return 127, "", str(error)

    return completed.returncode, completed.stdout, completed.stderr


def parse_systemctl_show(output: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in output.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key] = value
    return result


def systemctl_show(unit: str) -> dict[str, str]:
    code, stdout, stderr = run_command(
        [
            "systemctl",
            "show",
            unit,
            "--property=ActiveState,SubState,Result,ExecMainStatus,"
            "ExecMainStartTimestamp,ExecMainExitTimestamp,LoadState,"
            "NextElapseUSecRealtime,LastTriggerUSec",
        ],
    )
    if code != 0:
        return {"LoadState": "error", "Error": stderr.strip() or stdout.strip()}
    return parse_systemctl_show(stdout)


def journal_tail(service_name: str = SERVICE_NAME) -> list[str]:
    code, stdout, stderr = run_command(
        ["journalctl", "-u", f"{service_name}.service", "-n", str(LOG_LINES), "--no-pager"],
        timeout=20,
    )
    if code != 0:
        return [stderr.strip() or stdout.strip() or "Could not read journal logs."]
    return stdout.splitlines()


def newest_log(pattern: str) -> dict[str, Any] | None:
    log_dir = ROOT_DIR / "logs"
    try:
        matches = sorted(log_dir.glob(pattern), key=lambda item: item.stat().st_mtime, reverse=True)
    except OSError:
        return None
    if not matches:
        return None

    latest = matches[0]
    try:
        contents = latest.read_text(encoding="utf-8", errors="replace")
    except OSError as error:
        return {"path": str(latest), "error": str(error), "tail": []}

    return {
        "path": str(latest),
        "tail": contents.splitlines()[-LOG_LINES:],
    }


def service_is_running(service_name: str) -> bool:
    service = systemctl_show(f"{service_name}.service")
    active_state = service.get("ActiveState") or "unknown"
    sub_state = service.get("SubState") or "unknown"
    return active_state in {"activating", "active"} and sub_state != "exited"


def build_status(
    service_name: str = SERVICE_NAME,
    timer_name: str = TIMER_NAME,
    scanner_log_pattern: str = "vps-scanner-*.json",
    sync_log_pattern: str | None = "vps-sync-*.json",
) -> dict[str, Any]:
    service = systemctl_show(f"{service_name}.service")
    timer = systemctl_show(timer_name)
    active_state = service.get("ActiveState") or "unknown"
    sub_state = service.get("SubState") or "unknown"

    return {
        "ok": True,
        "serviceName": service_name,
        "timerName": timer_name,
        "root": str(ROOT_DIR),
        "running": active_state in {"activating", "active"} and sub_state != "exited",
        "service": service,
        "timer": timer,
        "journal": journal_tail(service_name),
        "latestScannerLog": newest_log(scanner_log_pattern),
        "latestSyncLog": newest_log(sync_log_pattern) if sync_log_pattern else None,
    }


def build_pattern_status() -> dict[str, Any]:
    return build_status(
        PATTERN_SERVICE_NAME,
        PATTERN_TIMER_NAME,
        "vps-pattern-discovery-*.log",
        None,
    )


def action_status(payload: dict[str, Any]) -> HTTPStatus:
    if payload["ok"]:
        return HTTPStatus.OK
    if payload["reason"] in {"already_running", "scanner_busy"}:
        return HTTPStatus.CONFLICT
    return HTTPStatus.INTERNAL_SERVER_ERROR


def start_service() -> dict[str, Any]:
    with ACTION_LOCK:
        if service_is_running(SERVICE_NAME):
            return {"ok": False, "reason": "already_running", "status": build_status()}
        if service_is_running(PATTERN_SERVICE_NAME):
            return {"ok": False, "reason": "scanner_busy", "status": build_pattern_status()}

        code, stdout, stderr = run_command(
            ["sudo", "-n", "systemctl", "start", "--no-block", f"{SERVICE_NAME}.service"],
        )
        return {
            "ok": code == 0,
            "reason": "started" if code == 0 else "start_failed",
            "stdout": stdout.strip(),
            "stderr": stderr.strip(),
            "status": build_status(),
        }


def stop_service() -> dict[str, Any]:
    code, stdout, stderr = run_command(
        ["sudo", "-n", "systemctl", "stop", "--no-block", f"{SERVICE_NAME}.service"],
    )
    return {
        "ok": code == 0,
        "reason": "stop_requested" if code == 0 else "stop_failed",
        "stdout": stdout.strip(),
        "stderr": stderr.strip(),
        "status": build_status(),
    }


def normalize_route_scope(payload: Any) -> dict[str, str] | None:
    if payload is None:
        return None
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")

    route = payload.get("route")
    if route is None:
        return None
    if not isinstance(route, dict):
        raise ValueError("route must be a JSON object.")

    origin = str(route.get("originAirport") or "").upper()
    destination = str(route.get("destinationAirport") or "").upper()
    max_stops = str(route.get("maxStops") or "").upper()
    if not all((origin, destination, max_stops)):
        raise ValueError("route requires originAirport, destinationAirport, and maxStops.")
    if not AIRPORT_CODE_PATTERN.fullmatch(origin):
        raise ValueError("originAirport must be a three-character airport code.")
    if not AIRPORT_CODE_PATTERN.fullmatch(destination):
        raise ValueError("destinationAirport must be a three-character airport code.")
    if not ROUTING_PATTERN.fullmatch(max_stops):
        raise ValueError("maxStops has an invalid format.")

    return {
        "originAirport": origin,
        "destinationAirport": destination,
        "maxStops": max_stops,
    }


def save_pattern_request(route_scope: dict[str, str] | None) -> None:
    PATTERN_REQUEST_FILE.parent.mkdir(parents=True, exist_ok=True)
    if route_scope is None:
        PATTERN_REQUEST_FILE.unlink(missing_ok=True)
        return

    temporary_path = PATTERN_REQUEST_FILE.with_name(
        f"{PATTERN_REQUEST_FILE.name}.{os.getpid()}.{threading.get_ident()}.tmp"
    )
    temporary_path.write_text(
        json.dumps({"route": route_scope}, ensure_ascii=True),
        encoding="utf-8",
    )
    temporary_path.chmod(0o600)
    os.replace(temporary_path, PATTERN_REQUEST_FILE)


def start_pattern_service(route_scope: dict[str, str] | None) -> dict[str, Any]:
    with ACTION_LOCK:
        if service_is_running(PATTERN_SERVICE_NAME):
            return {
                "ok": False,
                "reason": "already_running",
                "status": build_pattern_status(),
            }
        if service_is_running(SERVICE_NAME):
            return {"ok": False, "reason": "scanner_busy", "status": build_status()}

        try:
            save_pattern_request(route_scope)
        except OSError as error:
            return {
                "ok": False,
                "reason": "request_write_failed",
                "stderr": str(error),
                "status": build_pattern_status(),
            }

        code, stdout, stderr = run_command(
            [
                "sudo",
                "-n",
                "systemctl",
                "start",
                "--no-block",
                f"{PATTERN_SERVICE_NAME}.service",
            ],
        )
        if code != 0:
            PATTERN_REQUEST_FILE.unlink(missing_ok=True)
        return {
            "ok": code == 0,
            "reason": "started" if code == 0 else "start_failed",
            "stdout": stdout.strip(),
            "stderr": stderr.strip(),
            "routeScope": route_scope,
            "status": build_pattern_status(),
        }


def stop_pattern_service() -> dict[str, Any]:
    code, stdout, stderr = run_command(
        [
            "sudo",
            "-n",
            "systemctl",
            "stop",
            "--no-block",
            f"{PATTERN_SERVICE_NAME}.service",
        ],
    )
    if code == 0:
        PATTERN_REQUEST_FILE.unlink(missing_ok=True)
    return {
        "ok": code == 0,
        "reason": "stop_requested" if code == 0 else "stop_failed",
        "stdout": stdout.strip(),
        "stderr": stderr.strip(),
        "status": build_pattern_status(),
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "352flights-scanner-agent/1.1"

    def log_message(self, format: str, *args: object) -> None:
        return

    def write_json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        encoded = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def authorized(self) -> bool:
        if not TOKEN:
            return False
        authorization = self.headers.get("Authorization", "")
        header_token = self.headers.get("X-Scanner-Agent-Token", "")
        return authorization == f"Bearer {TOKEN}" or header_token == TOKEN

    def require_auth(self) -> bool:
        if self.authorized():
            return True
        self.write_json({"ok": False, "reason": "unauthorized"}, HTTPStatus.UNAUTHORIZED)
        return False

    def read_json_body(self) -> Any:
        content_length = int(self.headers.get("Content-Length", "0") or "0")
        if content_length <= 0:
            return None
        if content_length > 16_384:
            raise ValueError("Request body is too large.")
        raw_body = self.rfile.read(content_length)
        return json.loads(raw_body.decode("utf-8"))

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            self.write_json({"ok": True, "serviceName": SERVICE_NAME})
            return
        if path == "/status":
            if not self.require_auth():
                return
            self.write_json(build_status())
            return
        if path == "/pattern-discovery/status":
            if not self.require_auth():
                return
            self.write_json(build_pattern_status())
            return
        self.write_json({"ok": False, "reason": "not_found"}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if not self.require_auth():
            return
        if path == "/start":
            payload = start_service()
            self.write_json(payload, action_status(payload))
            return
        if path == "/stop":
            payload = stop_service()
            self.write_json(payload, action_status(payload))
            return
        if path == "/pattern-discovery/start":
            try:
                route_scope = normalize_route_scope(self.read_json_body())
            except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
                self.write_json(
                    {"ok": False, "reason": "invalid_request", "detail": str(error)},
                    HTTPStatus.BAD_REQUEST,
                )
                return
            payload = start_pattern_service(route_scope)
            self.write_json(payload, action_status(payload))
            return
        if path == "/pattern-discovery/stop":
            payload = stop_pattern_service()
            self.write_json(payload, action_status(payload))
            return
        self.write_json({"ok": False, "reason": "not_found"}, HTTPStatus.NOT_FOUND)


def main() -> None:
    if not TOKEN:
        raise SystemExit("VPS_SCANNER_AGENT_TOKEN is required.")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Scanner agent listening on {HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
