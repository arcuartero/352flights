#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
SCANNER_DIR="$ROOT_DIR/scanner"
LOG_DIR="$ROOT_DIR/logs"
LOCK_DIR="/tmp/luxcheapflights-pattern-discovery.lock"
LAST_RUN_FILE="$ROOT_DIR/scanner/state/local-pattern-discovery-last-run.txt"
PID_FILE="$ROOT_DIR/scanner/state/local-pattern-discovery.pid"
CHILD_PID_FILE="$ROOT_DIR/scanner/state/local-pattern-discovery.child.pid"
MIN_RUN_GAP_SECONDS=1728000
FORCE_RUN=0
TARGET_ORIGIN=""
TARGET_DESTINATION=""
TARGET_MAX_STOPS=""

while (( $# > 0 )); do
  case "${1:-}" in
    --force)
      FORCE_RUN=1
      shift
      ;;
    --origin-airport)
      TARGET_ORIGIN="${2:-}"
      shift 2
      ;;
    --destination-airport)
      TARGET_DESTINATION="${2:-}"
      shift 2
      ;;
    --max-stops)
      TARGET_MAX_STOPS="${2:-}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [[ "${LUX_PATTERN_DISCOVERY_FORCE:-0}" == "1" ]]; then
  FORCE_RUN=1
fi

export PATH="/Users/albertorodriguez/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

mkdir -p "$LOG_DIR"
mkdir -p "$(dirname "$LAST_RUN_FILE")"
mkdir -p "$(dirname "$PID_FILE")"

TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"
STDOUT_LOG="$LOG_DIR/local-pattern-discovery.stdout.log"
STDERR_LOG="$LOG_DIR/local-pattern-discovery.stderr.log"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[$TIMESTAMP] Pattern discovery already running, skipping duplicate launch." >> "$STDOUT_LOG"
  exit 0
fi

cleanup() {
  rm -f "$PID_FILE" "$CHILD_PID_FILE" 2>/dev/null || true
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

terminate() {
  if [[ -n "${UV_CHILD_PID:-}" ]] && kill -0 "$UV_CHILD_PID" 2>/dev/null; then
    kill -TERM "$UV_CHILD_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT
trap terminate TERM INT HUP

if (( FORCE_RUN == 0 )) && [[ -f "$LAST_RUN_FILE" ]]; then
  LAST_RUN="$(cat "$LAST_RUN_FILE" 2>/dev/null || true)"
  if [[ -n "$LAST_RUN" && "$LAST_RUN" == <-> ]]; then
    NOW="$(date +%s)"
    ELAPSED="$((NOW - LAST_RUN))"
    if (( ELAPSED < MIN_RUN_GAP_SECONDS )); then
      echo "[$TIMESTAMP] Pattern discovery ran ${ELAPSED}s ago, skipping duplicate launch." >> "$STDOUT_LOG"
      exit 0
    fi
  fi
fi

UV_BIN="$(command -v uv || true)"
if [[ -z "$UV_BIN" && -x "/Users/albertorodriguez/.local/bin/uv" ]]; then
  UV_BIN="/Users/albertorodriguez/.local/bin/uv"
fi
if [[ -z "$UV_BIN" && -x "/opt/homebrew/bin/uv" ]]; then
  UV_BIN="/opt/homebrew/bin/uv"
fi
if [[ -z "$UV_BIN" && -x "/usr/local/bin/uv" ]]; then
  UV_BIN="/usr/local/bin/uv"
fi

if [[ -z "$UV_BIN" ]]; then
  echo "[$TIMESTAMP] Could not find 'uv' on PATH." >> "$STDERR_LOG"
  exit 1
fi

if [[ -f "$ROOT_DIR/.env" ]]; then
  while IFS='=' read -r key value; do
    case "$key" in
      SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SCANNER_CURRENCY|SCANNER_HISTORY_WINDOW|SCANNER_REVIEW_RATIO|SCANNER_FLASH_RATIO|SCANNER_WEEKEND_PATTERN_DISCOVERY_END_DAYS|SCANNER_LONG_HAUL_PATTERN_DISCOVERY_END_DAYS|SCANNER_PATTERN_OVERRIDE_VALID_DAYS|SCANNER_PATTERN_DISCOVERY_STORAGE_MODE)
        export "$key=$value"
        ;;
    esac
  done < <(grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SCANNER_CURRENCY|SCANNER_HISTORY_WINDOW|SCANNER_REVIEW_RATIO|SCANNER_FLASH_RATIO|SCANNER_WEEKEND_PATTERN_DISCOVERY_END_DAYS|SCANNER_LONG_HAUL_PATTERN_DISCOVERY_END_DAYS|SCANNER_PATTERN_OVERRIDE_VALID_DAYS|SCANNER_PATTERN_DISCOVERY_STORAGE_MODE)=' "$ROOT_DIR/.env")
fi

if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  export SCANNER_STORAGE_MODE="${SCANNER_PATTERN_DISCOVERY_STORAGE_MODE:-auto}"
fi

export UV_CACHE_DIR="/tmp/uv-cache"

if (( FORCE_RUN == 1 )); then
  echo "[$TIMESTAMP] Force-run requested, bypassing monthly duplicate-run guard." >> "$STDOUT_LOG"
fi

DISCOVERY_ARGS=(run luxflight-scan --discover-patterns --json)
if [[ -n "$TARGET_ORIGIN" ]]; then
  DISCOVERY_ARGS+=(--origin-airport "$TARGET_ORIGIN")
fi
if [[ -n "$TARGET_DESTINATION" ]]; then
  DISCOVERY_ARGS+=(--destination-airport "$TARGET_DESTINATION")
fi
if [[ -n "$TARGET_MAX_STOPS" ]]; then
  DISCOVERY_ARGS+=(--max-stops "$TARGET_MAX_STOPS")
fi

if [[ -n "$TARGET_ORIGIN" || -n "$TARGET_DESTINATION" || -n "$TARGET_MAX_STOPS" ]]; then
  echo "[$TIMESTAMP] Discovery scope: single route ${TARGET_ORIGIN:-*} -> ${TARGET_DESTINATION:-*} (${TARGET_MAX_STOPS:-*})." >> "$STDOUT_LOG"
fi

echo "[$TIMESTAMP] Starting local route pattern discovery." >> "$STDOUT_LOG"
echo "$$" > "$PID_FILE"
cd "$SCANNER_DIR"

"$UV_BIN" "${DISCOVERY_ARGS[@]}" >> "$STDOUT_LOG" 2>> "$STDERR_LOG" &
UV_CHILD_PID=$!
echo "$UV_CHILD_PID" > "$CHILD_PID_FILE"

set +e
wait "$UV_CHILD_PID"
EXIT_CODE=$?
set -e

if (( EXIT_CODE == 0 )); then
  date +%s > "$LAST_RUN_FILE"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Local route pattern discovery finished successfully." >> "$STDOUT_LOG"
elif (( EXIT_CODE == 130 || EXIT_CODE == 143 || EXIT_CODE == 137 )); then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Local route pattern discovery stopped from ops UI." >> "$STDOUT_LOG"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Local route pattern discovery failed." >> "$STDERR_LOG"
  exit 1
fi
