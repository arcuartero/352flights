#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="352flights-scanner-agent"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
ENV_FILE="/etc/352flights-scanner-agent.env"
SUDOERS_FILE="/etc/sudoers.d/352flights-scanner-agent"
RUN_USER="${SUDO_USER:-ubuntu}"
RUN_GROUP="$(id -gn "$RUN_USER")"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this installer with sudo from the VPS." >&2
  echo "Example: sudo bash scripts/install-vps-scanner-agent-systemd.sh" >&2
  exit 1
fi

if [[ ! -f "$ROOT_DIR/scripts/vps-scanner-agent.py" ]]; then
  echo "Missing $ROOT_DIR/scripts/vps-scanner-agent.py." >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  TOKEN="$(openssl rand -hex 32)"
  cat > "$ENV_FILE" <<ENV
VPS_SCANNER_AGENT_TOKEN=$TOKEN
VPS_SCANNER_AGENT_HOST=127.0.0.1
VPS_SCANNER_AGENT_PORT=8787
SCANNER_ROOT=$ROOT_DIR
SCANNER_SERVICE_NAME=352flights-scanner
VPS_SCANNER_AGENT_LOG_LINES=2500
ENV
  chmod 600 "$ENV_FILE"
  chown root:root "$ENV_FILE"
  echo "Created $ENV_FILE with a new token."
else
  echo "Keeping existing $ENV_FILE."
fi

chmod +x "$ROOT_DIR/scripts/vps-scanner-agent.py"

cat > "$SUDOERS_FILE" <<SUDOERS
$RUN_USER ALL=(root) NOPASSWD: /usr/bin/systemctl start --no-block 352flights-scanner.service
$RUN_USER ALL=(root) NOPASSWD: /usr/bin/systemctl stop 352flights-scanner.service
SUDOERS
chmod 440 "$SUDOERS_FILE"
visudo -cf "$SUDOERS_FILE" >/dev/null

cat > "$SERVICE_FILE" <<SERVICE
[Unit]
Description=352flights VPS scanner control agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$ROOT_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/python3 $ROOT_DIR/scripts/vps-scanner-agent.py
Restart=on-failure
RestartSec=5
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME.service"

echo "Installed $SERVICE_NAME.service."
echo "Token file: $ENV_FILE"
echo "Expose it only through HTTPS, for example Caddy reverse_proxy to 127.0.0.1:8787."
echo "Then set these in Vercel:"
echo "  VPS_SCANNER_AGENT_URL=https://your-scanner-control-host.example.com"
echo "  VPS_SCANNER_AGENT_TOKEN=<value from $ENV_FILE>"
