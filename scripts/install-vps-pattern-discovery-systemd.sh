#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="352flights-pattern-discovery"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
TIMER_FILE="/etc/systemd/system/${SERVICE_NAME}.timer"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this installer with sudo from the VPS." >&2
  echo "Example: sudo bash scripts/install-vps-pattern-discovery-systemd.sh" >&2
  exit 1
fi

RUN_USER="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"
RUN_GROUP="$(id -gn "$RUN_USER")"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "Missing $ROOT_DIR/.env. Create it before installing the service." >&2
  exit 1
fi

if [[ ! -f "$ROOT_DIR/scripts/run-vps-pattern-discovery.sh" ]]; then
  echo "Missing $ROOT_DIR/scripts/run-vps-pattern-discovery.sh." >&2
  exit 1
fi

chmod +x "$ROOT_DIR/scripts/run-vps-pattern-discovery.sh"
mkdir -p "$ROOT_DIR/logs" "$ROOT_DIR/scanner/state"
chown -R "$RUN_USER:$RUN_GROUP" "$ROOT_DIR/logs" "$ROOT_DIR/scanner/state"

cat > "$SERVICE_FILE" <<SERVICE
[Unit]
Description=352flights monthly route pattern discovery
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$ROOT_DIR
ExecStart=$ROOT_DIR/scripts/run-vps-pattern-discovery.sh
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
TimeoutStartSec=18h

[Install]
WantedBy=multi-user.target
SERVICE

cat > "$TIMER_FILE" <<TIMER
[Unit]
Description=Run 352flights route pattern discovery monthly

[Timer]
OnCalendar=*-*-01 04:30:00
Persistent=true
RandomizedDelaySec=30m
Unit=${SERVICE_NAME}.service

[Install]
WantedBy=timers.target
TIMER

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}.timer"

echo "Installed ${SERVICE_NAME}.service and ${SERVICE_NAME}.timer."
echo "Run now with: sudo systemctl start ${SERVICE_NAME}.service"
