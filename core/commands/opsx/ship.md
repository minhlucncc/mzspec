---
name: "OPSX: Ship"
description: Orchestrate the full ship of an approved OpenSpec change — local merge (no gh) or remote PR — both test-first to an opened PR or locally-merged-and-archived main
category: Workflow
tags: [workflow, automation, pr, tdd, local, experimental]
---

Implement an OpenSpec change and open its **code PR** — stages **3–5** of the platform
workflow (implement → sync-reconcile → PR review). It orchestrates the two ship workflows:
**ship-plan** (write a `.handoff/<change>/` grouping the change into a few test-first units)
and **ship-code** (execute it unit-by-unit — Red→Green→one commit — then verify, code
review, evidence, reconcile, and open the code PR).

> **Prerequisite (stage 2): the spec PR must already be merged.** Run `/opsx:spec` until it
> APPROVES, then `/opsx:spec-pr` to open the spec PR; a human merges it so the canonical
> `openspec/specs/` contract is on the base branch **before** implementation. `ship-code`'s Preflight
> asserts the contract is present and its Sync phase only **reconciles** (a contract that
> drifts during implementation stops the ship and goes back to `/opsx:spec` + `/opsx:spec-pr`).

**Four paths** are offered at the top:

- **Remote PR (gh pr create)** — **recommended / default**. Branches `feat/<change>` from the
  freshened base (`<base>`, default `main`) → per-unit commits → verify → agent code+security review (posted on the PR)
  → evidence → reconcile → push + open the code PR with the review findings and a link to the
  merged spec PR. **Ends at PR opened; a human reviews & merges**, then `/opsx:address-review`
  handles feedback and `/opsx:archive` finalizes.
- **Remote PR in worktree (`--worktree`)** — same as remote PR, but implementation runs in an
  isolated git worktree. Stops after implementation (no push, no PR) — you verify locally first,
  then push + create the PR via `/opsx:ship-pr`.
- **Local merge (`--local`, no gh)** — escape hatch for trivial/solo changes. Bundles the spec
  sync, squash-merges into the base branch locally, archives, optional tag. Gates the merge on the agent
  review. Use only when a PR gate is genuinely unnecessary.
- **Local merge in worktree (`--local-worktree`)** — same as local merge, but implementation
  runs in an isolated git worktree so the main checkout stays on the base branch. After the
  worktree agent returns, merge/archive/cleanup runs in the main checkout automatically.

**Input**: Optionally a change name (e.g., `/opsx:ship c0006-…`). `--base <branch>`
sets the branch the change is built on and the PR targets (default `main`); when
omitted, step 0 asks. `--dry-run`
on the remote path makes the per-task commits locally but skips push + PR;
on the local path, refuses merge and stops at Verify (the branch + per-task
commits are still produced).
`--worktree` runs the implementation phases inside an isolated git worktree so the
main checkout stays on the base branch, and **stops after implementation** (no push, no PR)
so you can verify locally before creating the PR. Only valid for the remote PR path.
`--local-worktree` is the same but for the local merge path — implementation in a worktree,
then automated merge/archive/cleanup in the main checkout.

**Steps**

0. **Path selection.** AskUserQuestion:
   - "Remote PR (gh pr create)" — **recommended** (PR-gated; a human reviews & merges)
   - "Remote PR in worktree (`--worktree`)" — same as remote PR, but implementation
     runs in an isolated git worktree. Stops after implementation (no push, no PR)
     — you verify locally first, then push + create the PR.
   - "Local merge (`--local`, no gh)" — escape hatch for trivial/solo changes
   - "Local merge in worktree (`--local-worktree`)" — local merge with worktree isolation.
     Implementation runs in a worktree, then merge/archive/cleanup in the main checkout.

   **On Local** (both plain and worktree), AskUserQuestion follow-ups:
   - Merge strategy: `squash` (default) / `--no-ff` / `ff-only`
   - Bump: none (default) / patch / minor / major
   - `noPushMain`: stay fully local (default) / also push `main` to origin
   - Archive: archive after merge (default) / skip archive
   - Review: run local review (default) / skip via `--no-review`

   **On Remote** (both plain and worktree), the legacy behavior is preserved unchanged.

0b. **Base branch.** Unless `--base <branch>` was passed, **AskUserQuestion**: "Which
   branch should this change be based off (and the PR target)?" with options:
   - `main` — **recommended / default**
   - `develop`
   - *Other* — free-text any existing branch name

   Capture the answer as `base` (used for both ship paths). On the **remote** paths,
   `ship-code`'s first phase (**Base sync**) fetches origin, switches to `<base>`, and
   `git merge --ff-only origin/<base>` so the change builds on the freshest base; a dirty
   tree or a non-fast-forwardable base stops the ship (it never auto-stashes or
   force-resets). `--local` skips Base sync (it ships from `feat/<change>` and merges into
   `<base>` in its Merge phase).

1. **Select the change** (infer from context / `openspec list --json` +
   AskUserQuestion). Announce "Shipping change: <name> via <path> path onto <base>".

2. **Plan.** Launch
   `Workflow({ name: 'ship-plan', args: { change, date, local: <true|false> } })`.
   `localOnly` flows through to `plan.json` so `ship-code` picks it up.

3. **Review gate.** Show the handoff: the proposal's what/why, the per-pair
   breakdown, and (for Local) the merge strategy + bump + push + archive
   decisions. Use **AskUserQuestion**: "Handoff looks right — run ship-code
   now?" with options *Ship it*, *Dry run (commits, no push/PR on remote;
   no merge on local)*, *Edit handoff first*, *Cancel*.

4. **Execute.** Launch
   `Workflow({ name: 'ship-code', args: { change, date, dryRun,
     local: <true|false>, worktree: <true|false>, localWorktree: <true|false>,
     base: <base>, mergeStrategy, bump, noPushMain, archive, skipReview } })`.

   **Remote path** Base sync (fetch + ff-merge `<base>`) → branches from the freshened
   `<base>` → runs each unit Red→Green→one commit →
   verify → agent code+security review → evidence → **reconcile** (delta vs the already-merged
   canonical specs; drift → stop) → changelog → push + `gh pr create` with the review findings
   + a link to the merged spec PR. Opens the PR and **stops**.

   **Remote-worktree path** Preflight runs in the main checkout. Implementation
   (branch → implement → verify → review → evidence → sync → changelog → chore commit)
   runs inside an isolated `git worktree`. **Stops after the chore commit** — no push,
   no PR. You verify locally (touch point 3), then run `/opsx:ship-pr <change>` to
   push + create the PR (touch point 4). The main checkout stays on `<base>` throughout.

   **Local path** branches → runs each pair Red→Green→one commit → verify →
   Local review (code-review-and-quality + security-and-hardening, gated on
   `--no-review`) → pre-merge evidence → `git switch <base> && git merge --<strategy>
   feat/<change>` (conventional commit, signed off, never `git add -A`,
   never auto-resolves conflicts) → re-runs verify on `<base>` post-merge →
   sync delta specs → archives `openspec/changes/<change>/` →
   `openspec/changes/archive/<date>-<change>/` → optional semver tag →
   chore commit (evidence + sync + archive + changelog + post-merge.md) →
   `git branch -D feat/<change>` → optional `git push origin <base>` (when
   `--push-main`).

   **Local-worktree path** Preflight runs in the main checkout. Implementation
   (branch → implement → verify → review → evidence → sync → changelog → chore commit)
   runs inside an isolated `git worktree`. After the worktree agent returns,
   **merge/archive/cleanup runs in the main checkout** (same as the local path above).
   Main checkout stays on `<base>` throughout; the worktree is cleaned up automatically.

5. **Relay the result.**

   **Remote**: branch, per-task commits, gates + coverage, agent review verdict + findings,
   evidence dir, PR URL. Remind the user: a human reviews & merges; run `/opsx:address-review`
   for feedback, and **archive happens after merge** (`/opsx:archive`).

   **Remote-worktree**: branch, per-task commits, agent review findings, evidence dir,
   and instructions to verify locally then push + create the PR. The main checkout was
   never switched away from `<base>`. The worktree was cleaned up.

   **Local** (both plain and worktree): mergeSha + baseSha, pre-merge gates + coverage, review verdict +
   findings, post-merge gates + coverage, sync state, archive path, tag (if
   any), choreSha, pushed status, evidence dir (and the new
   `evidence/post-merge.md` inside it).

**Guardrails**
- Never run ship-code without the review gate in step 3.
- Test-first by default; doc-only changes auto-skip Red per pair (recorded, never
  silent).
- The local path **never** calls `gh`. The remote path **always** ends at PR
  opened — never merges.
- Pass `dryRun` whenever testing the pipeline.
- `--worktree` requires the remote path; incompatible with `--local`. Use `--local-worktree`
  instead if you want both worktree isolation AND local merge.
- The worktree is cleaned up automatically after the agent returns (success or failure).