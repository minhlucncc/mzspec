#!/usr/bin/env bash
# 0.9.0 — replace the multi-source `tasks` extension with `task-github`.
#
# The 3-source tasking layer (local-folder / gh-issues / mello, with a .task-link.json
# SSOT and a task-sources adapter registry) is retired. GitHub is now the only task API,
# shipped as the `task-github` extension: github.json is the SSOT, /opsx:propose-gh links
# an issue, and the lifecycle sync is built into the vendored lifecycle.js.
#
# This migration prunes the old vendored files. To preserve lifecycle continuity for a
# project that *had* the tasks extension, it then installs task-github (which re-vendors a
# github.json-backed lifecycle.js). Idempotent — safe to re-run.
set -euo pipefail
DEST="${1:?usage: 0.9.0-task-github.sh <dest> <src>}"
SRC="${2:?usage: 0.9.0-task-github.sh <dest> <src>}"
log() { printf '\033[1;35mmzspec/migrate 0.9.0\033[0m %s\n' "$*"; }

cd="$DEST/.claude"

# Did this project have the old tasks extension? (decide BEFORE pruning)
HAD_TASKS=0
for marker in \
  "$cd/workflows/task.js" \
  "$cd/workflows/lib/task-link.js" \
  "$cd/commands/opsx/task-pull.md"; do
  [ -e "$marker" ] && HAD_TASKS=1 && break
done

rm_path() { [ -e "$1" ] && { rm -rf "$1"; log "  removed ${1#"$DEST"/}"; }; return 0; }

# Files that were ONLY ever the old tasks extension — always safe to prune.
rm_path "$cd/workflows/task.js"
rm_path "$cd/workflows/lib/task-link.js"
rm_path "$cd/workflows/lib/task-link.test.js"
rm_path "$cd/workflows/lib/task-sources"
rm_path "$cd/task-sources"
for cmd in task-create task-list task-pull task-push; do
  rm_path "$cd/commands/opsx/$cmd.md"
done

# lifecycle.js / lifecycle.test.js share a path with task-github's new versions, so prune
# ONLY the OLD (multi-source) variant — detected by its require of the retired modules.
prune_if_old() {
  local f="$1"
  [ -f "$f" ] || return 0
  if grep -qE "task-sources/index|require\('\./task-link" "$f"; then
    rm -f "$f"; log "  removed ${f#"$DEST"/} (old multi-source variant)"
  fi
}
prune_if_old "$cd/workflows/lib/lifecycle.js"
prune_if_old "$cd/workflows/lib/lifecycle.test.js"

# Continuity: if the project used tasks, install task-github so the pipeline keeps its
# board sync (now github.json-backed) and gains propose-gh / task-log / task-assign.
if [ "$HAD_TASKS" -eq 1 ] && [ -x "$SRC/extensions/task-github/install.sh" ]; then
  log "project used the tasks extension → installing task-github for lifecycle continuity"
  bash "$SRC/extensions/task-github/install.sh" --dest "$DEST" --force
  log "  note: lifecycle now reads openspec/changes/<c>/github.json — re-link changes via /opsx:propose-gh"
else
  log "task-github is available — run \`./mzspec install task-github\` for GitHub-backed tasking"
fi
