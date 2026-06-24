#!/usr/bin/env bash
# mzspec updater — re-vendor the latest mzspec into a project and run any pending
# migrations, tracking the installed release in .claude/.mzspec-version.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/minhlucncc/mzspec/main/update.sh | bash -s -- [options]
#   bash update.sh [options]                  # when run from a clone
#
# Options:
#   --dest <dir>     Target project root (default: current directory)
#   --ref <tag>      mzspec git ref to update to (default: main)
#   --force-skills   Also overwrite vendored skills (default: machinery only; skills preserved)
#   --dry-run        Show the plan (old→new + migrations) without changing anything
#   -h, --help       Show this help
set -euo pipefail

REPO_URL="${MZSPEC_REPO_URL:-https://github.com/minhlucncc/mzspec.git}"
DEST="$(pwd)"
REF="main"
FORCE_SKILLS=0
DRY_RUN=0

log()  { printf '\033[1;35mmzspec\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mmzspec\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mmzspec\033[0m %s\n' "$*" >&2; exit 1; }
usage() { sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dest)         DEST="${2:?}"; shift 2 ;;
    --dest=*)       DEST="${1#*=}"; shift ;;
    --ref)          REF="${2:?}"; shift 2 ;;
    --ref=*)        REF="${1#*=}"; shift ;;
    --force-skills) FORCE_SKILLS=1; shift ;;
    --dry-run)      DRY_RUN=1; shift ;;
    -h|--help)      usage ;;
    *)              die "unknown option: $1 (try --help)" ;;
  esac
done

command -v git  >/dev/null 2>&1 || die "git is required."
command -v node >/dev/null 2>&1 || die "node is required."
DEST="$(cd "$DEST" && pwd)" || die "--dest does not exist: $DEST"

# ---- resolve a mzspec source (self checkout or pinned clone) --------------------

SRC=""; CLEANUP=""
SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SELF_DIR/VERSION" ] && [ -d "$SELF_DIR/core/workflows" ]; then
  SRC="$SELF_DIR"
else
  TMP="$(mktemp -d)"; CLEANUP="$TMP"
  log "fetching mzspec@$REF ..."
  git clone --depth 1 --branch "$REF" "$REPO_URL" "$TMP/mzspec" >/dev/null 2>&1 \
    || die "could not clone $REPO_URL @ $REF"
  SRC="$TMP/mzspec"
fi
trap '[ -n "$CLEANUP" ] && rm -rf "$CLEANUP"' EXIT

# ---- versions ------------------------------------------------------------------

STAMP="$DEST/.claude/.mzspec-version"
NEW="$(cat "$SRC/VERSION" 2>/dev/null || echo 0.0.0)"
OLD="0.0.0"
[ -f "$STAMP" ] && OLD="$(head -1 "$STAMP" | tr -d '[:space:]')"
[ -z "$OLD" ] && OLD="0.0.0"

# version_gt A B  → true when A > B (semver-ish, via sort -V)
version_gt() { [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -1)" = "$1" ]; }

log "updating $DEST"
log "  installed: $OLD   →   available: $NEW"

# Collect pending migrations: installed < target <= available, ascending.
PENDING=()
if [ -d "$SRC/migrations" ]; then
  while IFS= read -r m; do
    [ -e "$m" ] || continue
    base="$(basename "$m")"; target="${base%%-*}"
    if version_gt "$target" "$OLD" && ! version_gt "$target" "$NEW"; then
      PENDING+=("$m")
    fi
  done < <(ls "$SRC/migrations"/*.sh 2>/dev/null | sort -V)
fi

if [ "${#PENDING[@]}" -gt 0 ]; then
  log "pending migrations:"; for m in "${PENDING[@]}"; do log "  - $(basename "$m")"; done
else
  log "no migrations pending"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  log "dry-run — no changes made. Re-run without --dry-run to apply."
  exit 0
fi

if [ "$OLD" = "$NEW" ] && [ "${#PENDING[@]}" -eq 0 ]; then
  log "already up to date ($NEW). Nothing to do."
  exit 0
fi

# ---- re-vendor -----------------------------------------------------------------

# Machinery (workflows, lib, opsx commands, tasks, templates, gate docs) is always
# refreshed. Skills are project-owned extensions — preserved unless --force-skills.
log "re-vendoring machinery (core, tasks, templates, gates) ..."
bash "$SRC/install.sh" --dest "$DEST" --with core,tasks,templates,gates --force --no-openspec

if [ "$FORCE_SKILLS" -eq 1 ]; then
  log "re-vendoring skills (--force-skills: overwriting local edits) ..."
  bash "$SRC/install.sh" --dest "$DEST" --with skills --force --no-openspec
else
  log "installing any missing skills (existing ones preserved; use --force-skills to overwrite) ..."
  bash "$SRC/install.sh" --dest "$DEST" --with skills --no-openspec
fi

# install.sh re-stamps the version to NEW; migrations run against the OLD→NEW gap.

# ---- migrate -------------------------------------------------------------------

applied=0
for m in "${PENDING[@]}"; do
  log "migrate → $(basename "$m")"
  bash "$m" "$DEST" "$SRC"
  applied=$((applied + 1))
done

log "done — $OLD → $NEW, $applied migration(s) applied."
log "review the changes (git diff / git status) before committing."
