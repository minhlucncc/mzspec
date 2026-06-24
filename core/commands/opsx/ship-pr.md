---
name: "OPSX: Ship PR"
description: Push an implemented feature branch, archive the change, and open/create its code PR — after local verification of a --worktree ship
category: Workflow
tags: [workflow, automation, pr, experimental]
---

Push the `feat/<change>` branch, **archive the change** (move `openspec/changes/<c>/`
→ `openspec/changes/archive/`), and create (or update) the code PR — all in one step.
Archiving as part of this PR means the archive lands on `main` when the PR merges,
so **no separate post-merge workflow or extra PR** is needed.

> **Prerequisite:** The change must have been implemented already via
> `/opsx:ship --worktree <change>`. Test locally, then run this.

**Input**: A change name (e.g., `/opsx:ship-pr c0006-…`).

**Steps**

1. **Select the change** (infer from context / `openspec list --json` /
   AskUserQuestion). Announce "Opening code PR for: <name>".

2. **Verify the branch exists:**
   ```bash
   git rev-parse --verify feat/<change>
   ```
   If it doesn't exist, stop — tell the user to run `/opsx:ship --worktree <change>`
   first.

3. **Archive the change** (move artifacts to archive/):
   ```bash
   mkdir -p openspec/changes/archive/$(date +%F)-<change>
   mv openspec/changes/<change>/* openspec/changes/archive/$(date +%F)-<change>/
   ```
   Verify the change dir is now empty, then commit the archive:
   ```bash
   git add -A
   git commit -m "chore(${change}): archive after implementation"
   ```

4. **Push the branch** (all commits + archive):
   ```bash
   git push -u origin feat/<change>
   ```

5. **Create or update the PR.** Reuse if one already exists:
   ```bash
   gh pr view feat/<change> --json url,state 2>/dev/null
   ```
   If open → reuse its URL. Otherwise create:
   ```bash
   gh pr create --base main --head feat/<change> \
     --title "feat: <title from proposal>" \
     --body "<summary from proposal + AI review findings + evidence>"
   ```

6. **Relay the result.** Report the PR URL. Tell the user: the PR includes both
   code and the archive — when it merges, everything lands on `main` at once.
   No separate post-merge workflow needed.

**Guardrails**
- Requires a `feat/<change>` branch with commits — never creates a PR from nothing.
- Does not implement code, does not merge — just archives + pushes + creates the PR.
- Handles the case where the PR already exists (push updates it, reuses URL).
- Archive happens on the feature branch before push — it becomes part of the PR.
