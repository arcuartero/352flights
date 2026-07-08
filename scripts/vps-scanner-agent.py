#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


SERVICE_NAME = os.getenv("SCANNER_SERVICE_NAME", "352flights-scanner")
TIMER_NAME = os.getenv("SCANNER_TIMER_NAME", f"{SERVICE_NAME}.timer")
ROOT_DIR = Path(os.getenv("SCANNER_ROOT", "/opt/352flights/app"))
HOST = os.getenv("VPS_SCANNER_AGENT_HOST", "0.0.0.0")
PORT = int(os.getenv("VPS_SCANNER_AGENT_PORT", "8787"))
TOKEN = os.getenv("VPS_SCANNER_AGENT_TOKEN", "")
LOG_LINES = int(os.getenv("VPS_SCANNER_AGENT_LOG_LINES", "2500"))


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


def journal_tail() -> list[str]:
    code, stdout, stderr = run_command(
        ["journalctl", "-u", f"{SERVICE_NAME}.service", "-n", str(LOG_LINES), "--no-pager"],
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


def build_status() -> dict[str, Any]:
    service = systemctl_show(f"{SERVICE_NAME}.service")
    timer = systemctl_show(TIMER_NAME)
    active_state = service.get("ActiveState") or "unknown"
    sub_state = service.get("SubState") or "unknown"

    return {
        "ok": True,
        "serviceName": SERVICE_NAME,
        "timerName": TIMER_NAME,
        "root": str(ROOT_DIR),
        "running": active_state in {"activating", "active"} and sub_state != "exited",
        "service": service,
        "timer": timer,
        "journal": journal_tail(),
        "latestScannerLog": newest_log("vps-scanner-*.json"),
        "latestSyncLog": newest_log("vps-sync-*.json"),
    }


def start_service() -> dict[str, Any]:
    service = systemctl_show(f"{SERVICE_NAME}.service")
    if service.get("ActiveState") in {"activating", "active"} and service.get("SubState") != "exited":
        return {"ok": False, "reason": "already_running", "status": build_status()}

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


class Handler(BaseHTTPRequestHandler):
    server_version = "352flights-scanner-agent/1.0"

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
        self.write_json({"ok": False, "reason": "not_found"}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if not self.require_auth():
            return
        if path == "/start":
            payload = start_service()
            self.write_json(payload, HTTPStatus.OK if payload["ok"] else HTTPStatus.CONFLICT)
            return
        if path == "/stop":
            payload = stop_service()
            self.write_json(payload, HTTPStatus.OK if payload["ok"] else HTTPStatus.INTERNAL_SERVER_ERROR)
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
