#!/bin/zsh

# Price Scanner and Dates Scanner share one Mac-wide lock. The owner and PID
# files let /ops identify the active runner without confusing the two scanners.
LOCAL_SCANNER_LOCK_DIR="/tmp/luxcheapflights-scanner.lock"
LOCAL_SCANNER_LOCK_OWNER_FILE="$LOCAL_SCANNER_LOCK_DIR/owner"
LOCAL_SCANNER_LOCK_PID_FILE="$LOCAL_SCANNER_LOCK_DIR/pid"
LOCAL_SCANNER_ACTIVE_OWNER=""

local_scanner_acquire_lock() {
  local requested_owner="$1"
  local existing_pid=""

  if ! mkdir "$LOCAL_SCANNER_LOCK_DIR" 2>/dev/null; then
    existing_pid="$(cat "$LOCAL_SCANNER_LOCK_PID_FILE" 2>/dev/null || true)"
    LOCAL_SCANNER_ACTIVE_OWNER="$(cat "$LOCAL_SCANNER_LOCK_OWNER_FILE" 2>/dev/null || true)"

    if [[ -n "$existing_pid" && "$existing_pid" == <-> ]] && kill -0 "$existing_pid" 2>/dev/null; then
      return 1
    fi

    # The process recorded by the lock no longer exists. Remove only these
    # known lock metadata files, then reclaim the now-stale directory.
    rm -f "$LOCAL_SCANNER_LOCK_OWNER_FILE" "$LOCAL_SCANNER_LOCK_PID_FILE" 2>/dev/null || true
    if ! rmdir "$LOCAL_SCANNER_LOCK_DIR" 2>/dev/null; then
      return 1
    fi
    if ! mkdir "$LOCAL_SCANNER_LOCK_DIR" 2>/dev/null; then
      return 1
    fi
  fi

  printf '%s\n' "$requested_owner" > "$LOCAL_SCANNER_LOCK_OWNER_FILE"
  printf '%s\n' "$$" > "$LOCAL_SCANNER_LOCK_PID_FILE"
  LOCAL_SCANNER_ACTIVE_OWNER="$requested_owner"
  return 0
}

local_scanner_release_lock() {
  local requested_owner="$1"
  local recorded_owner=""
  local recorded_pid=""

  recorded_owner="$(cat "$LOCAL_SCANNER_LOCK_OWNER_FILE" 2>/dev/null || true)"
  recorded_pid="$(cat "$LOCAL_SCANNER_LOCK_PID_FILE" 2>/dev/null || true)"
  if [[ "$recorded_owner" != "$requested_owner" || "$recorded_pid" != "$$" ]]; then
    return 0
  fi

  rm -f "$LOCAL_SCANNER_LOCK_OWNER_FILE" "$LOCAL_SCANNER_LOCK_PID_FILE" 2>/dev/null || true
  rmdir "$LOCAL_SCANNER_LOCK_DIR" 2>/dev/null || true
}
