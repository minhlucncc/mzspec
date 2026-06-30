#!/usr/bin/env bash
# 0.12.0 — tag-driven skill routing system.
#
# Introduces a deterministic tag system for skill/hook loading. Tasks and work-units
# now carry tags (ui, backend, api, db, ...), skills and hooks declare which tags they
# apply to in YAML frontmatter, and the tag-resolver.js module matches them at runtime.
#
# Changes:
#   - New file: lib/tag-resolver.js — deterministic tag→skill/hook resolver
#   - New skill: core/skills/tag-system/SKILL.md — tag taxonomy and usage docs
#   - All SKILL.md files now have a `tags` field in frontmatter
#   - All prompt hooks now have YAML frontmatter with `tags` (tags: [] = universal)
#   - Prompt hooks no longer contain conditional "if UI" text — tag system handles routing
#   - ship-plan.js: units carry tags inherited from covered tasks
#   - ship-code.js: tag context injected per unit for skill selection
#   - spec-change.js: UX consistency axis only runs when change has ui.md
#   - mzspec.config.json has new optional "tags.categories" section for path→tag inference
#
# Backward compatible: un-tagged units get universal skills (same behavior as before).
set -euo pipefail
DEST="${1:?usage: 0.12.0-smart-tagging.sh <dest> <src>}"
SRC="${2:?usage: 0.12.0-smart-tagging.sh <dest> <src>}"
log() { printf '\033[1;35mmzspec/migrate 0.12.0\033[0m %s\n' "$*"; }

cd="$DEST/.claude"

# 1. Ensure new core files are in place (re-vendored by update.sh before migration runs)
#    - lib/tag-resolver.js
#    - core/skills/tag-system/SKILL.md
# These are part of the core pipeline and are re-vendored by install.sh --force --no-openspec.
# Just validate they exist in the source.
if [ ! -f "$SRC/lib/tag-resolver.js" ]; then
  log "WARNING: $SRC/lib/tag-resolver.js not found — re-vendor may be incomplete"
fi
if [ ! -f "$SRC/core/skills/tag-system/SKILL.md" ]; then
  log "WARNING: $SRC/core/skills/tag-system/SKILL.md not found — re-vendor may be incomplete"
fi

# 2. Re-vendor the agent-skills hooks to get tag-frontmatter versions.
#    Only if the agent-skills extension is already installed (don't force-install it).
if [ -d "$cd/skills/test-driven-development" ] || [ -d "$cd/skills/code-review-and-quality" ]; then
  if [ -x "$SRC/extensions/agent-skills/install.sh" ]; then
    log "re-vendoring agent-skills hooks (tag frontmatter, removed conditional UI text)..."
    bash "$SRC/extensions/agent-skills/install.sh" --dest "$DEST" --force 2>&1 | sed 's/^/  /'
    log "agent-skills hooks updated with tag frontmatter"
  else
    log "WARNING: agent-skills extension not found in source — hooks not updated"
  fi
else
  log "agent-skills extension not installed — skipping hook update"
fi

# 3. Update SKILL.md files that may exist at project level (not re-vendored by default)
#    The core skills under .claude/workflows/skills/ are re-vendored by install.sh --force.
#    But skills in .claude/skills/ (from agent-skills extension) might have been preserved.
#    Check if any lack the 'tags:' field and note it.
NEED_TAGS=0
for skill_md in "$cd/skills"/*/SKILL.md; do
  [ -f "$skill_md" ] || continue
  if ! grep -q '^tags:' "$skill_md" 2>/dev/null; then
    if [ "$NEED_TAGS" -eq 0 ]; then
      log "the following skill files may be missing the 'tags:' frontmatter field:"
      NEED_TAGS=1
    fi
    log "  - ${skill_md#"$DEST"/}"
  fi
done
if [ "$NEED_TAGS" -eq 0 ]; then
  log "all skill files have tags frontmatter"
else
  log "re-run with --force-skills to re-vendor the agent-skills extension files"
fi

# 4. Note about mzspec.config.json (optional — no changes made)
if [ -f "$DEST/mzspec.config.json" ]; then
  log "mzspec.config.json found — you can optionally add a 'tags.categories' section"
  log "  for automatic tag inference from file paths. See docs/tag-system.md."
else
  log "no mzspec.config.json — zero-config tag inference uses default path rules"
fi

# 5. Note about task tagging
log "to get the most out of smart tagging, add (tags: ...) to task lines in tasks.md:"
log '  ## Task [N]: Title  (tags: ui, auth)'
log "see docs/tag-system.md for the full tag taxonomy."

log "migration 0.12.0 complete — tag-driven skill routing is active."
