#!/usr/bin/env zsh
set -u

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCANNER_DIR="$ROOT_DIR/scanner"
LOG_DIR="$ROOT_DIR/logs"
LOCK_DIR="$ROOT_DIR/.scanner-vps.lock"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$LOG_DIR"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Another VPS scanner run is already active." >&2
  exit 75
fi
trap 'rmdir "$LOCK_DIR"' EXIT

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is not installed. Install uv on the VPS before running the scanner." >&2
  exit 127
fi

cd "$SCANNER_DIR"

export SCANNER_STORAGE_MODE=local
export SCANNER_STATE_FILE="${SCANNER_STATE_FILE:-$SCANNER_DIR/state.json}"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting local scanner."
uv run luxflight-scan --json > "$LOG_DIR/vps-scanner-$RUN_ID.json"
scan_status=$?

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Scanner finished with status $scan_status. Starting sync."
uv run luxflight-scan --sync-local-to-supabase --json > "$LOG_DIR/vps-sync-$RUN_ID.json"
sync_status=$?

if [ "$sync_status" -ne 0 ]; then
  echo "Sync failed with status $sync_status. Local data remains in $SCANNER_STATE_FILE." >&2
  exit "$sync_status"
fi

if [ "$scan_status" -ne 0 ]; then
  echo "Scanner finished with status $scan_status after sync. Check $LOG_DIR/vps-scanner-$RUN_ID.json." >&2
  exit "$scan_status"
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Scanner and sync finished."
