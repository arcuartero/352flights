#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="352flights-fare-renewal"
if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo on the VPS after applying the renewal migration." >&2
  exit 1
fi
RUN_USER="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"
RUN_GROUP="$(id -gn "$RUN_USER")"
test -f "$ROOT_DIR/.env"

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<SERVICE
[Unit]
Description=Recheck public fares before expiry
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$ROOT_DIR
Environment=PUBLIC_FARE_REVALIDATION_ENABLED=true
ExecStart=/usr/bin/bash "$ROOT_DIR/scripts/run-vps-scanner-with-sync.sh" --revalidate-public-fares
# The regular scanner holds the shared lock and services renewals between patterns.
SuccessExitStatus=75
Nice=10
SERVICE

cat > "/etc/systemd/system/${SERVICE_NAME}.timer" <<TIMER
[Unit]
Description=Check expiring fares every hour

[Timer]
OnCalendar=*-*-* *:10:00
Persistent=true
RandomizedDelaySec=60
Unit=${SERVICE_NAME}.service

[Install]
WantedBy=timers.target
TIMER

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}.timer"
echo "Installed ${SERVICE_NAME}.timer. Enable PUBLIC_FARE_REVALIDATION_ENABLED=true for the regular scanner too."
