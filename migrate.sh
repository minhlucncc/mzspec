#!/usr/bin/env bash
# mzspec migrate — prune stale artifacts from an existing mzspec install.
#
# install.sh only ever *vendors* (copies) files; it never deletes. So when mzspec
# removes or renames a feature, a project that re-runs the installer keeps the old,
# now-orphaned files. This script applies the pruning migrations that bring an
# existing .claude/ tree in line with the current mzspec.
#
# Every migration is idempotent (remove-if-present), so it is always safe to re-run.
#
# Usage:
#   bash migrate.sh [--dest <dir>] [--dry-run]
#   curl -fsSL https://raw.githubusercontent.com/minhlucncc/mzspec/main/migrate.sh | bash -s -- [--dest <dir>]
#
# Options:
#   --dest <dir>   Target project root (default: current directory)
#   --dry-run      Show what would be removed without touching anything
#   -h, --help     Show this help
set -euo pipefail

DEST="$(pwd)"
DRY=0

log()  { printf '\033[1;35mmzspec\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mmzspec\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mmzspec\033[0m %s\n' "$*" >&2; exit 1; }
usage() { sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dest)    DEST="${2:?}"; shift 2 ;;
    --dest=*)  DEST="${1#*=}"; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage ;;
    *)         die "unknown option: $1 (try --help)" ;;
  esac
done

DEST="$(cd "$DEST" && pwd)" || die "--dest does not exist: $DEST"
[ -d "$DEST/.claude" ] || die "no .claude/ under $DEST — not a mzspec install (run install.sh first)."
DRYLBL=""; [ "$DRY" -eq 1 ] && DRYLBL=" (dry-run)"
log "migrating install at: $DEST$DRYLBL"

pruned=0

# rm_path <relpath> — remove a file/dir under DEST if it exists; count + log it.
rm_path() {
  local p="$DEST/$1"
  [ -e "$p" ] || return 0
  if [ "$DRY" -eq 1 ]; then log "  would remove $1"; else rm -rf "$p"; log "  removed $1"; fi
  pruned=$((pruned + 1))
}

# drop_gitignore_line <verbatim-line> — remove an exact line from $DEST/.gitignore if present.
drop_gitignore_line() {
  local line="$1" gi="$DEST/.gitignore"
  [ -f "$gi" ] && grep -qxF "$line" "$gi" || return 0
  if [ "$DRY" -eq 1 ]; then
    log "  would drop .gitignore entry: $line"
  else
    grep -vxF "$line" "$gi" > "$gi.mzspec.tmp" && mv "$gi.mzspec.tmp" "$gi"
    log "  dropped .gitignore entry: $line"
  fi
  pruned=$((pruned + 1))
}

# ---- migrations ----------------------------------------------------------------
# Each migration removes the artifacts of a feature that mzspec no longer ships.
# Add new ones below over time; they all stay idempotent.

# 0001 — remove the experimental ship-all batch pipeline (replaced by the per-change
#        spec-pr -> ship flow). See mzspec commit "remove experimental ship-all".
migrate_0001_remove_ship_all() {
  rm_path ".claude/workflows/ship-all.js"
  rm_path ".claude/commands/opsx/ship-all.md"
  rm_path ".claude/skills/openspec-ship-all"
  rm_path "openspec/changes/.ship-all-progress.json"
  drop_gitignore_line "openspec/changes/.ship-all-progress.json"
}

log "0001 — remove experimental ship-all batch pipeline"
migrate_0001_remove_ship_all

# ---- summary -------------------------------------------------------------------
if [ "$pruned" -eq 0 ]; then
  log "done — nothing to prune (already up to date)."
elif [ "$DRY" -eq 1 ]; then
  log "done — ${pruned} stale path(s) would be pruned."
else
  log "done — ${pruned} stale path(s) pruned."
fi
