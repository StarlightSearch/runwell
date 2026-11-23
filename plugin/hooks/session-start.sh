#!/bin/sh
# Starts the Runwell server if it is not running, for sessions where the mod does not load.
# Prints nothing on stdout (it would reach the conversation) and always exits 0.
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
NODE="$(command -v node 2>/dev/null)"
if [ -z "$NODE" ]; then
  echo "Runwell needs Node 20 or newer to run. Install it from https://nodejs.org. Claude Code is not affected." >&2
  exit 0
fi
"$NODE" "$ROOT/dist/launcher.js" >/dev/null 2>&1 &
exit 0
