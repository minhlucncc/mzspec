#!/usr/bin/env bash
# mzspec installer — vendor the OpenSpec ship pipeline + quality-gate engine into a
# project's .claude/ tree. mzspec uses the openspec/
# folder for artifacts, so OpenSpec must be present (or initialized) first.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/minhlucncc/mzspec/main/scripts/install.sh | bash -s -- [options]
#   bash scripts/install.sh [options]            # when run from a clone
#
# Options:
#   --ref <tag>      mzspec git ref to install (default: main)
#   --dest <dir>     Target project root (default: current directory)
#   --force          Overwrite already-vendored files (default: skip existing)
#   --upgrade        Update an existing install: refresh mzspec-owned files to the
#                    current version (implies --force) AND run migrate.sh to prune
#                    artifacts of removed features.
#   --no-openspec    Do not scaffold openspec/ directory if missing
#   -h, --help       Show this help
set -euo pipefail

REPO_URL="${MZSPEC_REPO_URL:-https://github.com/minhlucncc/mzspec.git}"
RAW_BASE="${MZSPEC_RAW_BASE:-https://raw.githubusercontent.com/minhlucncc/mzspec}"
REF="main"
DEST="$(pwd)"
FORCE=0
UPGRADE=0
DO_OPENSPEC=1

log()  { printf '\033[1;35mmzspec\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mmzspec\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mmzspec\033[0m %s\n' "$*" >&2; exit 1; }

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --with)        shift 2 ;;
    --with=*)      shift ;;
    --ref)         REF="${2:?}"; shift 2 ;;
    --ref=*)       REF="${1#*=}"; shift ;;
    --dest)        DEST="${2:?}"; shift 2 ;;
    --dest=*)      DEST="${1#*=}"; shift ;;
    --force)       FORCE=1; shift ;;
    --upgrade)     UPGRADE=1; FORCE=1; shift ;;
    --no-openspec) DO_OPENSPEC=0; shift ;;
    -h|--help)     usage ;;
    *)             die "unknown option: $1 (try --help)" ;;
  esac
done

# ---- prerequisites -------------------------------------------------------------

command -v node >/dev/null 2>&1 || die "node is required (the workflows + gate-resolver run on Node)."
command -v git  >/dev/null 2>&1 || die "git is required."

DEST="$(cd "$DEST" && pwd)" || die "--dest does not exist: $DEST"
if [ "$UPGRADE" -eq 1 ]; then log "upgrading install at: $DEST (refresh + migrate)"; else log "installing into: $DEST"; fi

if [ ! -d "$DEST/openspec" ]; then
  if [ "$DO_OPENSPEC" -eq 1 ]; then
    warn "no openspec/ folder found — scaffolding it now (native mzspec)"
    node "$SRC/lib/openspec.js" init || warn "openspec init did not complete; continuing"
  else
    warn "no openspec/ folder found. mzspec uses openspec/ for artifacts."
    warn "    run: node path/to/mzspec/lib/openspec.js init"
fi
fi

# ---- fetch a pinned copy of mzspec --------------------------------------------

SRC=""
CLEANUP=""
SELF_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$SELF_DIR/scripts/install.sh" ] && [ -d "$SELF_DIR/core/workflows" ]; then
  SRC="$SELF_DIR"
  log "using local mzspec checkout: $SRC"
else
  TMP="$(mktemp -d)"
  CLEANUP="$TMP"
  log "fetching mzspec@$REF ..."
  git clone --depth 1 --branch "$REF" "$REPO_URL" "$TMP/mzspec" >/dev/null 2>&1 \
    || die "could not clone $REPO_URL @ $REF"
  SRC="$TMP/mzspec"
fi
trap '[ -n "$CLEANUP" ] && rm -rf "$CLEANUP"' EXIT

# ---- vendor helpers ------------------------------------------------------------

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
  local s="$1" d="$2" excl="${3:-}" f rel
  [ -d "$s" ] || return 0
  while IFS= read -r f; do
    rel="${f#"$s"/}"
    if [ -n "$excl" ] && printf '%s' "$rel" | grep -Eq "$excl"; then continue; fi
    vendor "$f" "$d/$rel"
  done < <(find "$s" -type f)
}

# ---- install components --------------------------------------------------------

TEST_EXCL='(^|/)[^/]*\.test\.js$'
CORE_EXCL="$TEST_EXCL"

log "installing core (workflows + opsx commands + gate engine + hook engine)"
vendor_dir "$SRC/core/workflows" "$DEST/.claude/workflows"      "$CORE_EXCL"
vendor_dir "$SRC/lib"            "$DEST/.claude/workflows/lib"   "$CORE_EXCL"
vendor_dir "$SRC/core/commands"  "$DEST/.claude/commands"        "$CORE_EXCL"
vendor_dir "$SRC/core/skills"    "$DEST/.claude/skills"
vendor      "$SRC/core/workflows/lib/hook-engine.js" "$DEST/.claude/workflows/lib/hook-engine.js"
vendor      "$SRC/scripts/mzspec"              "$DEST/mzspec"
# SDD_GUIDE.md — orient humans + agents to the spec->ship workflow.
if [ ! -e "$DEST/SDD_GUIDE.md" ]; then
  cp "$SRC/templates/SDD_GUIDE.md" "$DEST/SDD_GUIDE.md"
  log "wrote SDD_GUIDE.md (the workflow guide)"
elif [ "$UPGRADE" -eq 1 ]; then
  cp "$SRC/templates/SDD_GUIDE.md" "$DEST/SDD_GUIDE.md"
  log "refreshed SDD_GUIDE.md (--upgrade)"
else
  log "SDD_GUIDE.md already present — left untouched"
fi

# ---- migrations (upgrade only) -------------------------------------------------
if [ "$UPGRADE" -eq 1 ]; then
  if [ -f "$SRC/scripts/migrate.sh" ]; then
    log "running migrations (prune removed features) ..."
    bash "$SRC/scripts/migrate.sh" --dest "$DEST"
  else
    warn "migrate.sh not found in mzspec source — skipping prune step."
  fi
fi

# Stamp the installed mzspec version
if [ -f "$SRC/VERSION" ]; then
  mkdir -p "$DEST/.claude"
  cp "$SRC/VERSION" "$DEST/.claude/.mzspec-version"
  log "mzspec version: $(cat "$SRC/VERSION")"
fi

# ---- summary -------------------------------------------------------------------

log "done — $copied file(s) installed, $skipped left in place (use --force to overwrite)."
log "next:"
log "  0. read SDD_GUIDE.md — the spec->ship workflow in 2 minutes"
log "  1. gates are ZERO-CONFIG — auto-discovered from your manifests"
log "  2. install extensions: ./mzspec install agent-skills"
log "  3. run the pipeline:  /opsx:spec  /opsx:spec-pr  /opsx:ship-plan  /opsx:ship-code"
