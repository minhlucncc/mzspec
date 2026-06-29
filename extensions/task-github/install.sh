#!/usr/bin/env bash
# install.sh — task-github extension installer
# Installs: Workflows/propose-gh.js     -> .claude/workflows/
#          Commands/opsx/*.md           -> .claude/commands/opsx/
#          lib/* (github.js, github-link.js, lifecycle.js, exec.js + tests)
#                                        -> .claude/workflows/lib/
#
# lifecycle.js lands at exactly the path the core workflows already call
# (.claude/workflows/lib/lifecycle.js), so installing this extension wires the
# spec→ship pipeline to GitHub. It reuses the core-vendored discover.js +
# run-hook.js (installed alongside in .claude/workflows/lib/).
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

echo "installing task-github workflow -> .claude/workflows/"
vendor "$SRC/Workflows/propose-gh.js" "$DEST/.claude/workflows/propose-gh.js"

echo "installing task-github commands -> .claude/commands/opsx/"
for f in "$SRC"/Commands/opsx/*.md; do
  vendor "$f" "$DEST/.claude/commands/opsx/$(basename "$f")"
done

echo "installing task-github lib -> .claude/workflows/lib/"
vendor_dir "$SRC/lib" "$DEST/.claude/workflows/lib"

echo "task-github: $copied file(s) installed, $skipped left in place"
echo "note: requires the core install (discover.js + run-hook.js) and an authenticated gh CLI."
