#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
RUNTIME_ROOT="$HOME/Library/Application Support/352flights-scanner"
PLIST_TARGET="$HOME/Library/LaunchAgents/com.luxcheapflights.pattern-discovery.plist"
LABEL="com.luxcheapflights.pattern-discovery"

if [[ ! -x "$RUNTIME_ROOT/scanner/.venv/bin/python" || ! -f "$RUNTIME_ROOT/.env" ]]; then
  echo "Install and configure the Mac price scanner before pattern discovery." >&2
  exit 1
fi
mkdir -p "$HOME/Library/LaunchAgents" "$RUNTIME_ROOT/logs" "$RUNTIME_ROOT/scripts"
/usr/bin/ditto "$ROOT_DIR/scripts/run-local-pattern-discovery.sh" "$RUNTIME_ROOT/scripts/run-local-pattern-discovery.sh"
/usr/bin/ditto "$ROOT_DIR/scripts/local-scanner-lock.zsh" "$RUNTIME_ROOT/scripts/local-scanner-lock.zsh"
chmod 700 "$RUNTIME_ROOT/scripts/run-local-pattern-discovery.sh"

cat > "$PLIST_TARGET" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>$RUNTIME_ROOT/scripts/run-local-pattern-discovery.sh</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$RUNTIME_ROOT</string>

  <key>RunAtLoad</key>
  <false/>

  <key>StartCalendarInterval</key>
  <!-- Retry later if the nightly price scan still owns the shared lock.
       The runner's 20-day guard prevents a second completed monthly run. -->
  <array>
    <dict><key>Day</key><integer>1</integer><key>Hour</key><integer>3</integer><key>Minute</key><integer>30</integer></dict>
    <dict><key>Day</key><integer>1</integer><key>Hour</key><integer>9</integer><key>Minute</key><integer>30</integer></dict>
    <dict><key>Day</key><integer>1</integer><key>Hour</key><integer>15</integer><key>Minute</key><integer>30</integer></dict>
    <dict><key>Day</key><integer>1</integer><key>Hour</key><integer>21</integer><key>Minute</key><integer>30</integer></dict>
  </array>

  <key>StandardOutPath</key>
  <string>$RUNTIME_ROOT/logs/pattern-discovery.launchd.stdout.log</string>

  <key>StandardErrorPath</key>
  <string>$RUNTIME_ROOT/logs/pattern-discovery.launchd.stderr.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)" "$PLIST_TARGET" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_TARGET"
if [[ "${1:-}" == "--start-now" ]]; then
  launchctl kickstart "gui/$(id -u)/$LABEL"
fi

echo "Installed $LABEL (monthly on day 1 at 03:30, with later retries if busy)"
echo "plist: $PLIST_TARGET"
