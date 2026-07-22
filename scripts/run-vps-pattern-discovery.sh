#!/usr/bin/env bash

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCANNER_DIR="$ROOT_DIR/scanner"
LOG_DIR="$ROOT_DIR/logs"
STATE_DIR="$SCANNER_DIR/state"
LOCK_DIR="$ROOT_DIR/.scanner-vps.lock"
LOCK_PID_FILE="$LOCK_DIR/pid"
REQUEST_FILE="${PATTERN_DISCOVERY_REQUEST_FILE:-$STATE_DIR/vps-pattern-discovery-request.json}"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_LOG="$LOG_DIR/vps-pattern-discovery-$RUN_ID.log"
RUN_REQUEST_FILE="$STATE_DIR/vps-pattern-discovery-request-$RUN_ID.json"

mkdir -p "$LOG_DIR" "$STATE_DIR"

acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    printf '%s\n' "$$" > "$LOCK_PID_FILE"
    return 0
  fi

  if [[ -f "$LOCK_PID_FILE" ]]; then
    local lock_pid
    lock_pid="$(cat "$LOCK_PID_FILE" 2>/dev/null || true)"
    if [[ -n "$lock_pid" ]] && kill -0 "$lock_pid" 2>/dev/null; then
      echo "Another VPS scanner run is already active (pid $lock_pid)." >&2
      exit 75
    fi
  fi

  echo "Removing stale VPS scanner lock." >&2
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR"
  printf '%s\n' "$$" > "$LOCK_PID_FILE"
}

cleanup() {
  rm -f "$LOCK_PID_FILE" "$RUN_REQUEST_FILE" 2>/dev/null || true
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

acquire_lock
trap cleanup EXIT HUP INT TERM

if [[ -f "$ROOT_DIR/.env" ]]; then
  while IFS='=' read -r key value; do
    case "$key" in
      SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SCANNER_*)
        export "$key=$value"
        ;;
    esac
  done < <(grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SCANNER_[A-Z0-9_]+)=' "$ROOT_DIR/.env")
fi

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/uv-cache}"
export SCANNER_STORAGE_MODE="${SCANNER_PATTERN_DISCOVERY_STORAGE_MODE:-auto}"

UV_BIN="$(command -v uv || true)"
if [[ -z "$UV_BIN" ]]; then
  echo "uv is not installed. Install uv on the VPS before running Dates Scanner." >&2
  exit 127
fi

DISCOVERY_ARGS=()
if [[ -f "$REQUEST_FILE" ]]; then
  mv "$REQUEST_FILE" "$RUN_REQUEST_FILE"
  mapfile -t REQUEST_VALUES < <(
    python3 - "$RUN_REQUEST_FILE" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as request_file:
    request = json.load(request_file)

route = request.get("route") or {}
for key in ("originAirport", "destinationAirport", "maxStops"):
    value = route.get(key)
    if value:
        print(value)
PY
  )

  if [[ "${#REQUEST_VALUES[@]}" -eq 3 ]]; then
    DISCOVERY_ARGS+=(
      --origin-airport "${REQUEST_VALUES[0]}"
      --destination-airport "${REQUEST_VALUES[1]}"
      --max-stops "${REQUEST_VALUES[2]}"
    )
  fi
fi

cd "$SCANNER_DIR"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting VPS route pattern discovery."
if [[ "${#DISCOVERY_ARGS[@]}" -gt 0 ]]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Discovery scope: ${REQUEST_VALUES[0]} -> ${REQUEST_VALUES[1]} (${REQUEST_VALUES[2]})."
fi

set +e
"$UV_BIN" run luxflight-scan --discover-patterns --json "${DISCOVERY_ARGS[@]}" 2>&1 | tee "$RUN_LOG"
discovery_status="${PIPESTATUS[0]}"
set -e

if [[ "$discovery_status" -ne 0 ]]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] VPS route pattern discovery failed with status $discovery_status." >&2
  exit "$discovery_status"
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] VPS route pattern discovery finished successfully."
