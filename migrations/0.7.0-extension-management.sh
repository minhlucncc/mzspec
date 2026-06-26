#!/usr/bin/env bash
# 0.7.0 — extension management + dynamic skill hooks.
#
# Core is now installed via scripts/install.sh, extensions via scripts/mzspec.
# Stale artifacts from the old component-based install are pruned.
# Idempotent — safe to re-run.
set -euo pipefail
DEST="${1:?usage: 0.7.0-extension-management.sh <dest> <src>}"
SRC="${2:-}"
log() { printf '\033[1;35mmzspec/migrate 0.7.0\033[0m %s\n' "$*"; }

# 1. Remove stale mzspec-gates directory (was installed to .claude/ in 0.6.0,
#    no longer needed — gates are zero-config auto-discovered).
if [ -d "$DEST/.claude/mzspec-gates" ]; then
  rm -rf "$DEST/.claude/mzspec-gates"
  log "removed stale .claude/mzspec-gates/ (gates auto-discovered from manifests)"
fi

# 2. Remove schema file if present (was vendored by 0.6.0 install.sh).
if [ -f "$DEST/mzspec.config.schema.json" ]; then
  rm -f "$DEST/mzspec.config.schema.json"
  log "removed leftover mzspec.config.schema.json (zero-config, not needed)"
fi

# 3. Hook examples are no longer shipped as vendor files.
#    If the user had custom hooks under openspec/hooks/, they are left untouched.
#    Any stale .example files from the old install can be removed.
if [ -d "$DEST/openspec/hooks" ]; then
  find "$DEST/openspec/hooks" -name "*.example" -type f -exec rm -f {} + 2>/dev/null || true
  log "cleaned up stale .example hook files from openspec/hooks/"
fi

# 4. Note about extensions
log "extensions are now managed via: bash scripts/mzspec install <name>"
log "  available: agent-skills, tasks (and more)"
