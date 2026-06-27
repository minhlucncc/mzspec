#!/usr/bin/env bash
# install.sh — tasks-local extension
# Installs: task CLI -> .claude/tasks-local/task
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$(pwd)"
FORCE=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dest) DEST="${2:?}"; shift 2 ;;
    --force) FORCE=1; shift ;;
    --help) echo "Usage: install.sh [--dest <path>] [--force]"; exit 0 ;;
    *) echo "unknown: $1"; exit 1 ;;
  esac
done

DEST="$(cd "$DEST" && pwd)"
mkdir -p "$DEST/.claude/tasks-local"

install_file() {
  if [ -e "$2" ] && [ "$FORCE" -eq 0 ]; then echo "skip $2"; return; fi
  cp "$1" "$2"
  chmod +x "$2"
  echo "installed: $2"
}

install_file "$SRC/task" "$DEST/.claude/tasks-local/task"
echo "tasks-local: done"
