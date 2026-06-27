#!/usr/bin/env bash
# uninstall.sh — tasks-local extension
set -euo pipefail
DEST="$(pwd)"
while [ "$#" -gt 0 ]; do
  case "$1" in --dest) DEST="${2:?}"; shift 2 ;; *) echo "unknown"; exit 1 ;; esac
done
DEST="$(cd "$DEST" && pwd)"
rm -rf "$DEST/.claude/tasks-local"
echo "tasks-local: removed"
