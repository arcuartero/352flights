#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
PLIST_TARGET="$HOME/Library/LaunchAgents/com.luxcheapflights.scanner.plist"
CONTROL_PLIST_TARGET="$HOME/Library/LaunchAgents/com.luxcheapflights.scanner-control.plist"
RUNTIME_ROOT="$HOME/Library/Application Support/352flights-scanner"
RUNTIME_SCANNER_DIR="$RUNTIME_ROOT/scanner"
RUNTIME_SCRIPT_DIR="$RUNTIME_ROOT/scripts"
RUNTIME_LOG_DIR="$RUNTIME_ROOT/logs"
LABEL="com.luxcheapflights.scanner"
CONTROL_LABEL="com.luxcheapflights.scanner-control"
START_NOW=0
INSTALL_LOCK_OWNER="scanner_installer"
LOCAL_LOCK_DIR="/tmp/luxcheapflights-scanner.lock"
LOCAL_LOCK_OWNER_FILE="$LOCAL_LOCK_DIR/owner"
LOCAL_LOCK_PID_FILE="$LOCAL_LOCK_DIR/pid"

if [[ "${1:-}" == "--start-now" ]]; then
  START_NOW=1
fi

release_install_lock() {
  local recorded_owner=""
  local recorded_pid=""

  recorded_owner="$(cat "$LOCAL_LOCK_OWNER_FILE" 2>/dev/null || true)"
  recorded_pid="$(cat "$LOCAL_LOCK_PID_FILE" 2>/dev/null || true)"
  if [[ "$recorded_owner" == "$INSTALL_LOCK_OWNER" && "$recorded_pid" == "$$" ]]; then
    rm -f "$LOCAL_LOCK_OWNER_FILE" "$LOCAL_LOCK_PID_FILE"
    rmdir "$LOCAL_LOCK_DIR" 2>/dev/null || true
  fi
}

if ! mkdir "$LOCAL_LOCK_DIR" 2>/dev/null; then
  existing_pid="$(cat "$LOCAL_LOCK_PID_FILE" 2>/dev/null || true)"
  existing_owner="$(cat "$LOCAL_LOCK_OWNER_FILE" 2>/dev/null || true)"
  if [[ "$existing_pid" =~ ^[0-9]+$ ]] && kill -0 "$existing_pid" 2>/dev/null; then
    echo "Cannot update the Mac scanner while ${existing_owner:-another scanner} is active." >&2
    exit 75
  fi

  rm -f "$LOCAL_LOCK_OWNER_FILE" "$LOCAL_LOCK_PID_FILE"
  rmdir "$LOCAL_LOCK_DIR" 2>/dev/null || true
  if ! mkdir "$LOCAL_LOCK_DIR" 2>/dev/null; then
    echo "Could not acquire the shared Mac scanner lock." >&2
    exit 75
  fi
fi
printf '%s\n' "$INSTALL_LOCK_OWNER" > "$LOCAL_LOCK_OWNER_FILE"
printf '%s\n' "$$" > "$LOCAL_LOCK_PID_FILE"
trap release_install_lock EXIT

UV_BIN="$(command -v uv || true)"
if [[ -z "$UV_BIN" && -x "$HOME/.local/bin/uv" ]]; then
  UV_BIN="$HOME/.local/bin/uv"
fi
if [[ -z "$UV_BIN" && -x "/opt/homebrew/bin/uv" ]]; then
  UV_BIN="/opt/homebrew/bin/uv"
fi
if [[ -z "$UV_BIN" ]]; then
  echo "Could not find 'uv'. Install it before configuring the Mac scanner." >&2
  exit 1
fi

# Background LaunchAgents can be denied access to ~/Documents by macOS even
# when the same command works in Terminal. Stage a self-contained runtime under
# ~/Library so the scheduled scanner never depends on protected folders.
mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$RUNTIME_SCANNER_DIR" "$RUNTIME_SCRIPT_DIR" "$RUNTIME_LOG_DIR"
mkdir -p "$RUNTIME_ROOT/data"

/usr/bin/ditto "$ROOT_DIR/scanner/luxflight_scanner" "$RUNTIME_SCANNER_DIR/luxflight_scanner"
/usr/bin/ditto "$ROOT_DIR/scanner/pyproject.toml" "$RUNTIME_SCANNER_DIR/pyproject.toml"
/usr/bin/ditto "$ROOT_DIR/scanner/uv.lock" "$RUNTIME_SCANNER_DIR/uv.lock"
/usr/bin/ditto "$ROOT_DIR/data/lux-routes.json" "$RUNTIME_ROOT/data/lux-routes.json"
/usr/bin/ditto "$ROOT_DIR/scripts/local-scanner-lock.zsh" "$RUNTIME_SCRIPT_DIR/local-scanner-lock.zsh"
/usr/bin/ditto "$ROOT_DIR/scripts/run-mac-scanner-with-sync.sh" "$RUNTIME_SCRIPT_DIR/run-mac-scanner-with-sync.sh"
/usr/bin/ditto "$ROOT_DIR/scripts/run-mac-scanner-control.sh" "$RUNTIME_SCRIPT_DIR/run-mac-scanner-control.sh"
chmod 700 "$RUNTIME_SCRIPT_DIR/run-mac-scanner-with-sync.sh"
chmod 700 "$RUNTIME_SCRIPT_DIR/run-mac-scanner-control.sh"

if [[ -f "$ROOT_DIR/.env" ]]; then
  /usr/bin/ditto "$ROOT_DIR/.env" "$RUNTIME_ROOT/.env"
  chmod 600 "$RUNTIME_ROOT/.env"
fi

if [[ ! -f "$RUNTIME_SCANNER_DIR/state.json" && -f "$ROOT_DIR/scanner/state.json" ]]; then
  /usr/bin/ditto "$ROOT_DIR/scanner/state.json" "$RUNTIME_SCANNER_DIR/state.json"
fi

UV_CACHE_DIR="/tmp/uv-cache" "$UV_BIN" sync \
  --directory "$RUNTIME_SCANNER_DIR" \
  --frozen

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
    <string>$RUNTIME_SCRIPT_DIR/run-mac-scanner-with-sync.sh</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$RUNTIME_ROOT</string>

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
  <string>$RUNTIME_LOG_DIR/launchd.stdout.log</string>

  <key>StandardErrorPath</key>
  <string>$RUNTIME_LOG_DIR/launchd.stderr.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)" "$PLIST_TARGET" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_TARGET"

cat > "$CONTROL_PLIST_TARGET" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$CONTROL_LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>$RUNTIME_SCRIPT_DIR/run-mac-scanner-control.sh</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$RUNTIME_ROOT</string>

  <key>RunAtLoad</key>
  <true/>

  <key>StartInterval</key>
  <integer>10</integer>

  <key>StandardOutPath</key>
  <string>$RUNTIME_LOG_DIR/control.stdout.log</string>

  <key>StandardErrorPath</key>
  <string>$RUNTIME_LOG_DIR/control.stderr.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)" "$CONTROL_PLIST_TARGET" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$CONTROL_PLIST_TARGET"

if (( START_NOW == 1 )); then
  launchctl kickstart -k "gui/$(id -u)/$LABEL"
fi

echo "Installed $LABEL"
echo "plist: $PLIST_TARGET"
echo "runtime: $RUNTIME_ROOT"
echo "control: $CONTROL_LABEL (checks Supabase every 10 seconds)"
if (( START_NOW == 1 )); then
  echo "Started now."
else
  echo "Next scheduled run: daily at 02:15 local time."
fi
