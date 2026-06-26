#!/usr/bin/env bash
# uninstall.sh — tasks extension uninstaller
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
rm_f "$DEST/.claude/workflows/task.js"

# Remove commands
for cmd in task-create task-list task-log task-pull task-push; do
  rm_f "$DEST/.claude/commands/opsx/$cmd.md"
done

# Remove lib files
rm_f "$DEST/.claude/workflows/lib/lifecycle.js"
rm_f "$DEST/.claude/workflows/lib/lifecycle.test.js"
rm_f "$DEST/.claude/workflows/lib/task-link.js"
rm_f "$DEST/.claude/workflows/lib/task-link.test.js"
rm_f "$DEST/.claude/workflows/lib/task-sources"

# Remove contract
rm_f "$DEST/.claude/task-sources"

echo "tasks: $removed item(s) removed"
