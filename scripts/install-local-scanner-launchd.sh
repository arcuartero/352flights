#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
PLIST_TARGET="$HOME/Library/LaunchAgents/com.luxcheapflights.scanner.plist"
LABEL="com.luxcheapflights.scanner"
START_NOW=0

if [[ "${1:-}" == "--start-now" ]]; then
  START_NOW=1
fi

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$ROOT_DIR/logs"

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
    <string>$ROOT_DIR/scripts/run-mac-scanner-with-sync.sh</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$ROOT_DIR</string>

  <key>RunAtLoad</key>
  <false/>

  <key>StartCalendarInterval</key>
  <array>
    <dict>
      <key>Hour</key>
      <integer>2</integer>
      <key>Minute</key>
      <integer>15</integer>
    </dict>
  </array>

  <key>StandardOutPath</key>
  <string>$ROOT_DIR/logs/launchd.stdout.log</string>

  <key>StandardErrorPath</key>
  <string>$ROOT_DIR/logs/launchd.stderr.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)" "$PLIST_TARGET" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_TARGET"

if (( START_NOW == 1 )); then
  launchctl kickstart -k "gui/$(id -u)/$LABEL"
fi

echo "Installed $LABEL"
echo "plist: $PLIST_TARGET"
if (( START_NOW == 1 )); then
  echo "Started now."
else
  echo "Next scheduled run: daily at 02:15 local time."
fi
