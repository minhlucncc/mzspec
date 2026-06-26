#!/usr/bin/env bash
# uninstall.sh — agent-skills extension uninstaller
set -euo pipefail

DEST="$(pwd)"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dest) DEST="${2:?}"; shift 2 ;;
    --help) echo "Usage: uninstall.sh [--dest <path>]"; exit 0 ;;
    *) echo "unknown: $1"; exit 1 ;;
  esac
done

DEST="$(cd "$DEST" && pwd)"
removed=0

rm_item() {
  if [ -e "$1" ]; then
    rm -rf "$1"
    echo "removed: $1"
    removed=$((removed + 1))
  fi
}

# Remove all agent-skills files
for skill in ci-cd-and-automation code-simplification debugging-and-error-recovery documentation-and-adrs git-workflow-and-versioning incremental-implementation security-and-hardening using-agent-skills; do
  rm_item "$DEST/.claude/skills/$skill"
done
rm_item "$DEST/.claude/skills/ATTRIBUTION.md"

# Remove prompt hooks
rm_item "$DEST/openspec/hooks/on-test.prompt.md"
rm_item "$DEST/openspec/hooks/on-implement.prompt.md"
rm_item "$DEST/openspec/hooks/on-verify.prompt.md"
rm_item "$DEST/openspec/hooks/on-review.prompt.md"
rm_item "$DEST/openspec/hooks/on-pr.prompt.md"
rm_item "$DEST/openspec/hooks/on-local-merge.prompt.md"
rm_item "$DEST/openspec/hooks/on-archive.prompt.md"
rm_item "$DEST/openspec/hooks/on-address-review.prompt.md"
rm_item "$DEST/openspec/hooks/on-plan.prompt.md"

# Remove templates
rm_item "$DEST/openspec/templates/example-feature"
rm_item "$DEST/openspec/templates/tdd"

echo "agent-skills: $removed item(s) removed"
