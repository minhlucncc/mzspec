#!/usr/bin/env bash
# uninstall.sh — task-github extension uninstaller
set -euo pipefail

DEST="$(pwd)"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dest) DEST="${2:?}"; shift 2 ;;
    --help) echo "Usage: uninstall.sh [--dest <path>]"; exit 0 ;;
    *) echo "unknown: $1"; exit 1 ;;
  esac
done

DEST="$(cd "$DEST" && pwd)"
removed=0

rm_f() {
  if [ -e "$1" ]; then
    rm -rf "$1"
    echo "removed: $1"
    removed=$((removed + 1))
  fi
}

# Remove workflow
rm_f "$DEST/.claude/workflows/propose-gh.js"

# Remove commands
for cmd in propose-gh task-log task-assign; do
  rm_f "$DEST/.claude/commands/opsx/$cmd.md"
done

# Remove lib files (leave core-owned discover.js + run-hook.js in place)
for f in github.js github.test.js github-link.js github-link.test.js lifecycle.js lifecycle.test.js exec.js; do
  rm_f "$DEST/.claude/workflows/lib/$f"
done

echo "task-github: $removed item(s) removed"
