#!/usr/bin/env bash
# install.sh — agent-skills extension installer
# Installs: skills -> .claude/skills/, hooks -> openspec/hooks/, templates -> openspec/templates/
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
mkdir -p "$DEST/.claude/skills" "$DEST/openspec/hooks" "$DEST/openspec/templates"

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

echo "installing agent-skills skills -> .claude/skills/"
vendor_dir "$SRC/skills" "$DEST/.claude/skills"

echo "installing agent-skills hooks -> openspec/hooks/"
vendor_dir "$SRC/hooks" "$DEST/openspec/hooks"

echo "installing agent-skills templates -> openspec/templates/"
vendor_dir "$SRC/templates" "$DEST/openspec/templates"

echo "agent-skills: $copied file(s) installed, $skipped left in place"
