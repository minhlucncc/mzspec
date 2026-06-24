#!/usr/bin/env bash
# 0.2.0 — zero-config gate resolution + openspec/hooks override.
#
# Retires the centralized mzspec.config.json: the toolchain/gate inventory is now
# auto-discovered from the repo's own manifests (uv workspace / go.mod / pnpm), and
# any custom behavior moves to an executable openspec/hooks/resolve-gates.
# Idempotent — safe to re-run.
set -euo pipefail
DEST="${1:?usage: 0.2.0-zero-config-hooks.sh <dest> <src>}"
SRC="${2:?usage: 0.2.0-zero-config-hooks.sh <dest> <src>}"
log() { printf '\033[1;35mmzspec/migrate 0.2.0\033[0m %s\n' "$*"; }

# 1. Retire the centralized config. Keep a backup of the JSON (it may hold custom
#    taskSources / customGates worth porting to a hook); the schema is regenerable.
if [ -f "$DEST/mzspec.config.json" ]; then
  mv "$DEST/mzspec.config.json" "$DEST/mzspec.config.json.pre-0.2.0.bak"
  log "moved mzspec.config.json → mzspec.config.json.pre-0.2.0.bak"
  log "  → port any custom taskSources/customGates into openspec/hooks/, then delete the .bak"
fi
if [ -f "$DEST/mzspec.config.schema.json" ]; then
  rm -f "$DEST/mzspec.config.schema.json"
  log "removed mzspec.config.schema.json"
fi

# 2. Scaffold the hooks override point (the new customization surface).
mkdir -p "$DEST/openspec/hooks"
if [ -f "$SRC/docs/hooks.md" ]; then
  cp "$SRC/docs/hooks.md" "$DEST/openspec/hooks/README.md"
fi
if [ -f "$SRC/templates/resolve-gates.example" ] && [ ! -e "$DEST/openspec/hooks/resolve-gates.example" ]; then
  cp "$SRC/templates/resolve-gates.example" "$DEST/openspec/hooks/resolve-gates.example"
fi
log "ensured openspec/hooks/ (README + resolve-gates.example)"

# 3. Note: gates now auto-discover; nothing to configure. If the project pinned the
#    JSON $schema reference anywhere it's harmless (the file is gone). Done.
