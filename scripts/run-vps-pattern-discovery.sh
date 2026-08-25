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

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "Supabase credentials are required for Date Scanner history. Check $ROOT_DIR/.env." >&2
  exit 78
fi

# Date Scanner runs must be written directly to Supabase so the live history
# survives VPS restarts and is visible in /ops/dates-scanner.
export SCANNER_STORAGE_MODE="supabase"
export SCANNER_RUN_SOURCE="vps"

UV_BIN="$(command -v uv || true)"
if [[ -z "$UV_BIN" ]]; then
  echo "uv is not installed. Install uv on the VPS before running Dates Scanner." >&2
  exit 127
fi

DISCOVERY_ARGS=()
FORCE_REFRESH=0
if [[ -f "$REQUEST_FILE" ]]; then
  mv "$REQUEST_FILE" "$RUN_REQUEST_FILE"
  mapfile -t REQUEST_VALUES < <(
    python3 - "$RUN_REQUEST_FILE" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as request_file:
    request = json.load(request_file)

route = request.get("route") or {}
print("1" if request.get("forceRefresh") is True else "0")
for key in ("originAirport", "destinationAirport", "maxStops"):
    value = route.get(key)
    if value:
        print(value)
PY
  )

  if [[ "${REQUEST_VALUES[0]:-0}" == "1" ]]; then
    FORCE_REFRESH=1
  fi

  if [[ "${#REQUEST_VALUES[@]}" -eq 4 ]]; then
    DISCOVERY_ARGS+=(
      --origin-airport "${REQUEST_VALUES[1]}"
      --destination-airport "${REQUEST_VALUES[2]}"
      --max-stops "${REQUEST_VALUES[3]}"
    )
  fi
fi

RUN_ARGS=(--discover-patterns --json)
if [[ "$FORCE_REFRESH" -eq 1 ]]; then
  RUN_ARGS+=(--refresh-service-months)
else
  RUN_ARGS+=(--only-missing-service-months)
fi

cd "$SCANNER_DIR"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting VPS route pattern discovery."
if [[ "${#DISCOVERY_ARGS[@]}" -gt 0 ]]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Discovery scope: single route ${REQUEST_VALUES[1]} -> ${REQUEST_VALUES[2]} (${REQUEST_VALUES[3]}), all airlines."
elif [[ "$FORCE_REFRESH" -eq 1 ]]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Discovery scope: full manual refresh, all routes and all airlines."
fi

set +e
"$UV_BIN" run luxflight-scan "${RUN_ARGS[@]}" "${DISCOVERY_ARGS[@]}" 2>&1 | tee "$RUN_LOG"
discovery_status="${PIPESTATUS[0]}"
set -e

if [[ "$discovery_status" -ne 0 ]]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] VPS route pattern discovery failed with status $discovery_status." >&2
  exit "$discovery_status"
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] VPS route pattern discovery finished successfully."
