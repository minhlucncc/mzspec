---
name: "OPSX: Propose from GitHub"
description: Start a new OpenSpec change FROM a GitHub issue — scaffold the change, seed proposal.md from the issue, link the two via github.json, and mark the issue in-progress
category: Workflow
tags: [workflow, tasks, github, backlog, automation]
---

Turn a GitHub issue into an OpenSpec change and bind them together. This is the
GitHub adapter of the **decoupled propose pattern**: it fetches the issue, writes it
to a local `TASK.md` (`.github/issues/<n>/task.md`), then delegates scaffolding to
the core `/opsx:propose` — which does not know or care about GitHub; it just reads
the local file. After scaffolding it writes `openspec/changes/<change>/github.json`
(the SSOT the lifecycle hooks read), copies `TASK.md` into the change dir for traceability,
flips the issue to **in-progress**, and posts a "spec started" comment.

Flow: `/opsx:propose-gh <issue>` → `/opsx:spec` → `/opsx:spec-pr` → `/opsx:ship-*`.

Requires the `gh` CLI authenticated and a GitHub `origin` remote (the repo is
inferred from it).

**Input**: `<issue>` (required) — an issue number (`90`), `#90`, or a full issue URL.

**Steps**

1. **Preview.** Fetch the issue: `node .claude/workflows/lib/github.js get <n> --json`.
   Summarize id, title, and a few lines of body, plus the change it will create.
2. **Approval gate.** Use **AskUserQuestion**: "Propose this issue into a new change?"
   with options *Propose it*, *Pick another issue*, *Cancel*. Don't proceed without an
   explicit choice.
3. **Launch the Workflow** (date from context):
   ```
   Workflow({ name: 'propose-gh', args: { issue: '<#N|N|url>', date: '<YYYY-MM-DD>', projectOrg: '<org>', projectNumber: '<board-number>', worktree: <true|false> } })
   ```
   Optional project args: `projectOrg` and `projectNumber` link the issue card to a GitHub
   Projects board and auto-move it through columns via lifecycle.js.
   With `--worktree`, creates a persistent spec worktree (`../<project>-spec-<change>/`)
   and scaffolds inside it, so the main checkout stays on the base branch.
   Phases: **Resolve** (fetch the issue) → **Scaffold** (write `.github/issues/<n>/task.md`
   → delegate to the core `propose` workflow with `worktree:true`) → **Link** (in the worktree:
   `github-link.js link` writes `github.json`, `github.js set-status … in-progress`,
   `lifecycle.js before-spec` comments the issue).
4. **Relay the result.** Report the linked `issueNumber`, the created `change`, the
   `proposalPath`, and the next step (`/opsx:spec <change>`). On failure surface
   `stage` + `reason`.

**Guardrails**
- Never create a change without the approval gate in step 2.
- Faithful seeding only: `proposal.md` must reflect the issue text; do not invent scope.
- The issue is flipped to in-progress exactly once, by the workflow (not by hand).
- If you only need the change scaffold without GitHub linkage, use `/opsx:propose` instead.
