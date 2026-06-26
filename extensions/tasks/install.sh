#!/usr/bin/env bash
# install.sh — tasks extension installer
# Installs: Workflows/task.js -> .claude/workflows/
#          Commands/opsx/task-*.md -> .claude/commands/opsx/
#          lib/* -> .claude/workflows/lib/
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
mkdir -p "$DEST/.claude/workflows" "$DEST/.claude/commands/opsx" "$DEST/.claude/workflows/lib"

copied=0; skipped=0
vendor() {
  local s="$1" d="$2"
  mkdir -p "$(dirname "$d")"
  if [ -e "$d" ] && [ "$FORCE" -eq 0 ]; then
    skipped=$((skipped + 1)); return 0
  fi
  cp -R "$s" "$d"
  copied=$((copied + 1))
}
vendor_dir() {
  local s="$1" d="$2"
  [ -d "$s" ] || return 0
  while IFS= read -r f; do
    vendor "$f" "$d/${f#"$s"/}"
  done < <(find "$s" -type f)
}

echo "installing tasks workflow -> .claude/workflows/"
vendor "$SRC/Workflows/task.js" "$DEST/.claude/workflows/task.js"

echo "installing tasks commands -> .claude/commands/opsx/"
for f in "$SRC"/Commands/opsx/task-*.md; do
  vendor "$f" "$DEST/.claude/commands/opsx/$(basename "$f")"
done

echo "installing tasks lib -> .claude/workflows/lib/"
vendor_dir "$SRC/lib" "$DEST/.claude/workflows/lib"

echo "installing tasks contract -> .claude/"
vendor "$SRC/task-sources/CONTRACT.md" "$DEST/.claude/task-sources/CONTRACT.md"

echo "tasks: $copied file(s) installed, $skipped left in place"
