#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
RUNTIME_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
SCANNER_DIR="$RUNTIME_ROOT/scanner"

export PATH="/Users/albertorodriguez/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

exec "$SCANNER_DIR/.venv/bin/python" -m luxflight_scanner.control_agent
