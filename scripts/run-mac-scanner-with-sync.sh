#!/usr/bin/env zsh

set -u

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
SCANNER_DIR="$ROOT_DIR/scanner"
LOG_DIR="$ROOT_DIR/logs"
LOCK_DIR="/tmp/352flights-mac-scanner.lock"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$LOG_DIR"
mkdir -p "$SCANNER_DIR/state"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Another Mac scanner run is already active." >&2
  exit 75
fi

cleanup() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT

load_env_value() {
  local key="$1"
  local value

  value="$(grep -E "^${key}=" "$ROOT_DIR/.env" 2>/dev/null | tail -n 1 | sed "s/^${key}=//")"
  if [[ -n "$value" ]]; then
    export "$key=$value"
  fi
}

if [[ -f "$ROOT_DIR/.env" ]]; then
  load_env_value "SUPABASE_URL"
  load_env_value "SUPABASE_SERVICE_ROLE_KEY"
  load_env_value "SCANNER_CURRENCY"
  load_env_value "SCANNER_HISTORY_WINDOW"
  load_env_value "SCANNER_REVIEW_RATIO"
  load_env_value "SCANNER_FLASH_RATIO"
fi

export PATH="/Users/albertorodriguez/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export UV_CACHE_DIR="/tmp/uv-cache"
export SCANNER_STORAGE_MODE="local"
export SCANNER_STATE_FILE="${SCANNER_STATE_FILE:-$SCANNER_DIR/state.json}"

cd "$SCANNER_DIR"

if [[ -x "$SCANNER_DIR/.venv/bin/python" ]]; then
  SCANNER_CMD=("$SCANNER_DIR/.venv/bin/python" -m luxflight_scanner.main)
elif command -v uv >/dev/null 2>&1; then
  SCANNER_CMD=(uv run luxflight-scan)
else
  echo "Neither scanner/.venv/bin/python nor uv is available." >&2
  exit 127
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting Mac scanner."
"${SCANNER_CMD[@]}" "$@" --json > "$LOG_DIR/mac-scanner-$RUN_ID.json"
scan_status=$?

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Scanner finished with status $scan_status. Starting Supabase sync."
"${SCANNER_CMD[@]}" --sync-local-to-supabase --json > "$LOG_DIR/mac-sync-$RUN_ID.json"
sync_status=$?

if [[ "$sync_status" -ne 0 ]]; then
  echo "Sync failed with status $sync_status. Local data remains in $SCANNER_STATE_FILE." >&2
  exit "$sync_status"
fi

if [[ "$scan_status" -ne 0 ]]; then
  echo "Scanner finished with status $scan_status after sync. Check $LOG_DIR/mac-scanner-$RUN_ID.json." >&2
  exit "$scan_status"
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Mac scanner and sync finished."
