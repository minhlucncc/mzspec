#!/usr/bin/env bash
# mzspec installer — vendor the OpenSpec ship pipeline + quality-gate engine into a
# project's .claude/ tree. mzspec layers ON TOP of OpenSpec and reuses the openspec/
# folder for artifacts, so OpenSpec must be present (or initialized) first.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/minhlucncc/mzspec/main/install.sh | bash -s -- [options]
#   bash install.sh [options]                 # when run from a clone
#
# Options:
#   --with <a,b,c>   Components to install: core,gates,skills (default: all)
#   --ref <tag>      mzspec git ref to install (default: main)
#   --dest <dir>     Target project root (default: current directory)
#   --force          Overwrite already-vendored files (default: skip existing)
#   --no-openspec    Do not attempt `openspec init` if openspec/ is missing
#   -h, --help       Show this help
set -euo pipefail

REPO_URL="${MZSPEC_REPO_URL:-https://github.com/minhlucncc/mzspec.git}"
RAW_BASE="${MZSPEC_RAW_BASE:-https://raw.githubusercontent.com/minhlucncc/mzspec}"
WITH="core,gates,skills"
REF="main"
DEST="$(pwd)"
FORCE=0
DO_OPENSPEC=1

log()  { printf '\033[1;35mmzspec\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mmzspec\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mmzspec\033[0m %s\n' "$*" >&2; exit 1; }

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --with)        WITH="${2:?}"; shift 2 ;;
    --with=*)      WITH="${1#*=}"; shift ;;
    --ref)         REF="${2:?}"; shift 2 ;;
    --ref=*)       REF="${1#*=}"; shift ;;
    --dest)        DEST="${2:?}"; shift 2 ;;
    --dest=*)      DEST="${1#*=}"; shift ;;
    --force)       FORCE=1; shift ;;
    --no-openspec) DO_OPENSPEC=0; shift ;;
    -h|--help)     usage ;;
    *)             die "unknown option: $1 (try --help)" ;;
  esac
done

has() { case ",$WITH," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }

# ---- prerequisites -------------------------------------------------------------

command -v node >/dev/null 2>&1 || die "node is required (the workflows + gate-resolver run on Node)."
command -v git  >/dev/null 2>&1 || die "git is required."

DEST="$(cd "$DEST" && pwd)" || die "--dest does not exist: $DEST"
log "installing into: $DEST"

if [ ! -d "$DEST/openspec" ]; then
  if [ "$DO_OPENSPEC" -eq 1 ] && command -v openspec >/dev/null 2>&1; then
    warn "no openspec/ folder found — running 'openspec init' (mzspec reuses it for artifacts)"
    ( cd "$DEST" && openspec init --tools claude ) || warn "openspec init did not complete; continuing"
  else
    warn "no openspec/ folder found. mzspec builds on OpenSpec — install it and run 'openspec init':"
    warn "    npm i -g @fission-ai/openspec && openspec init --tools claude"
  fi
fi

# ---- fetch a pinned copy of mzspec --------------------------------------------

SRC=""
CLEANUP=""
# If run from inside a mzspec checkout, use it directly; else clone the pinned ref.
SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SELF_DIR/install.sh" ] && [ -d "$SELF_DIR/core/workflows" ]; then
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
vendor() { # vendor <src-path> <dest-path>
  local s="$1" d="$2"
  mkdir -p "$(dirname "$d")"
  if [ -e "$d" ] && [ "$FORCE" -eq 0 ]; then
    skipped=$((skipped + 1)); return 0
  fi
  cp -R "$s" "$d"
  copied=$((copied + 1))
}
vendor_dir() { # vendor_dir <src-dir> <dest-dir> — file by file so --force is per-file
  local s="$1" d="$2" f rel
  [ -d "$s" ] || return 0
  while IFS= read -r f; do
    rel="${f#"$s"/}"
    vendor "$f" "$d/$rel"
  done < <(find "$s" -type f)
}

# ---- install components --------------------------------------------------------

if has core; then
  log "installing core (workflows + opsx commands)"
  vendor_dir "$SRC/core/workflows" "$DEST/.claude/workflows"
  vendor_dir "$SRC/lib"            "$DEST/.claude/workflows/lib"
  vendor_dir "$SRC/core/commands"  "$DEST/.claude/commands"
fi

if has skills; then
  log "installing engineering-practice skills"
  vendor_dir "$SRC/extensions/skills" "$DEST/.claude/skills"
fi

GATES_DIR="gates"
if has gates; then
  log "installing gate plugin contract + starter gates"
  vendor_dir "$SRC/extensions/gates" "$DEST/.claude/mzspec-gates"
fi

# ---- project config ------------------------------------------------------------

CONFIG="$DEST/mzspec.config.json"
if [ ! -e "$CONFIG" ]; then
  cp "$SRC/templates/mzspec.config.template.json" "$CONFIG"
  log "wrote mzspec.config.json (fill in your toolchain dirs + gates)"
else
  log "mzspec.config.json already present — left untouched"
fi
# Schema for editor validation.
vendor "$SRC/mzspec.config.schema.json" "$DEST/mzspec.config.schema.json"

# ---- summary -------------------------------------------------------------------

log "done — $copied file(s) installed, $skipped left in place (use --force to overwrite)."
log "next:"
log "  1. edit mzspec.config.json — set toolchains.<tc>.dirs/gates, gatesDir, customGates"
log "  2. add your gate scripts under your gatesDir (see .claude/mzspec-gates/CONTRACT.md)"
log "  3. run the pipeline:  /opsx:spec  →  /opsx:spec-pr  →  /opsx:ship-plan  →  /opsx:ship-code"
