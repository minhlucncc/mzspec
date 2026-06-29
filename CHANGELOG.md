# Changelog

All notable changes to mzspec are recorded here. The installed release is stamped
into each project at `.claude/.mzspec-version`; `update.sh` runs the migrations
between a project's stamped version and the current `VERSION`.

## 0.10.0 — GitHub Projects board lifecycle + split merge-pr into spec/code workflows

**Lifecycle.js now updates GitHub Projects boards** when the change's `github.json`
carries a `project` config, and `merge-pr` is split into two dedicated workflows.

Added:
- `setProjectStatus()` in `extensions/task-github/lib/github.js` — dynamically resolves
  project/field/item IDs via `gh project` CLI and moves the board card to the column
  mapped to the normalized status (`todo`→Todo, `in-progress`→In Progress,
  `in-review`→In Review, `done`→Done; all overridable).
- `projectRef()` in `github-link.js` — project config (org, number, field, options)
  carried in `github.json` with safe defaults. CLI accepts `--project-org`,
  `--project-number`, `--project-field`.
- `projectUpdated` tracking in lifecycle.js `did` result.
- `--project-org` / `--project-number` args to `propose-gh.js` — passed through to the
  link command so newly-proposed changes carry the board config.
- `core/workflows/merge-pr-spec.js` — dedicated workflow for merging `spec/<change>` PRs:
  preflight, prepare, merge, fire `after-spec-pr-merged` lifecycle. No archive or changelog.
- `core/workflows/merge-pr-code.js` — dedicated workflow for merging `feat/<change>` PRs:
  preflight with changelog check, prepare, archive on branch, merge + close issues,
  fire `after-code-pr-merged` lifecycle.
- `core/commands/opsx/merge-pr-spec.md`, `merge-pr-code.md` — command docs for the
  dedicated workflows.

Changed:
- `core/workflows/merge-pr.js` — simplified to a lightweight **router** that detects
  the branch prefix (`spec/` vs `feat/`) and delegates to the sub-workflow.
- `core/commands/opsx/merge-pr.md` — updated to describe the auto-dispatch routing.

## 0.9.0 — separate `propose` from tasking; GitHub-only `task-github` extension

**Split change-scaffolding from task integration, and replace the 3-source `tasks`
extension with a focused GitHub-only `task-github`.** Scaffolding a change is now a
first-class, github-agnostic core command; all GitHub coupling lives in one opt-in
extension that wires the pipeline to GitHub through the existing lifecycle hooks. The
per-change link + PR refs move to a single `openspec/changes/<change>/github.json` SSOT
(replacing `.task-link.json` + the `ticket:` proposal frontmatter).

Added:
- `core/commands/opsx/propose.md` + `core/workflows/propose.js` — `/opsx:propose <what>`,
  a github-agnostic change scaffolder (compute `cNNNN-<slug>` → `openspec new change` →
  seed `proposal.md`). No review, no task coupling.
- `extensions/task-github/` — `/opsx:propose-gh <issue>` (scaffold from a GitHub issue +
  link + mark in-progress + fire `before-spec`), `/opsx:task-log` (comment the linked
  issue), `/opsx:task-assign` (assign, defaults `@me`).
- `extensions/task-github/lib/` — `github.js` (gh adapter + CLI), `github-link.js`
  (`github.json` SSOT + `link` CLI), `lifecycle.js` (github.json-backed; vendored to the
  path the core workflows already call), `exec.js`, plus ported unit tests.
- `docs/task-github.md` — commands + `github.json` schema + lifecycle table.

Changed:
- `core/workflows/spec-change.js` — dropped the `ticket:` proposal-frontmatter linking
  (and the `ticket` arg); the `before-spec` lifecycle call stays and no-ops when unlinked.
- `core/commands/opsx/spec.md` — removed `--ticket`; points to `/opsx:propose-gh` for linking.
- `spec-pr.js` / `ship-code.js` / `merge-pr.js` — agent-hook prose + merge note now
  reference `github.json` instead of the old `.task-link.json` / frontmatter ticket.
- `README.md`, `docs/lifecycle-hooks.md`, `docs/templates.md` — task-github wording.
- `scripts/update.sh` — no longer auto-installs the retired `tasks` extension.

Removed:
- `extensions/tasks/` (multi-source local-folder / gh-issues / mello tasking) and
  `docs/task-sources.md`.

Migration:
- `migrations/0.9.0-task-github.sh` (run by `update.sh`) + `migrate_0002` in
  `scripts/migrate.sh` — prune the old vendored task files (content-gated for
  `lifecycle.js`), and install `task-github` for projects that had `tasks`.

## 0.8.0 — local worktree ship path + worktree spec-pr

**Added `--local-worktree` ship path and `--worktree` support for spec-pr.** The
local merge path can now run implementation inside an isolated git worktree, then
automatically merge/archive/cleanup in the main checkout. The spec-pr workflow can
also run sync + commit in a worktree, with push + PR from the main checkout.

Added:
- `--local-worktree` alias for `ship-code.js` — combines worktree isolation with
  local merge/archive (best of both worlds)
- `--worktree` flag for `spec-pr.js` — sync + commit in isolated worktree, push + PR
  from main checkout
- 4th path "Local merge in worktree" in `/opsx:ship` path selection

Changed:
- `ship-code.js`: removed `--worktree`+`--local` incompatibility. When both are set,
  implementation runs in the worktree then merge/archive/cleanup in the main checkout
- `ship-code.js`: extracted shared variables (`repairs`, `gatesRun`, `coverage`, etc.)
  before the worktree/implement conditional so both paths can use them
- `ship.md`: path selection now offers "Local merge in worktree" as a 4th option
- `spec-pr.md`: step to ask user about main checkout vs worktree
- `ship-code.md`: documents `--local-worktree` and worktree step for local path

## 0.7.0 — extension management + dynamic skill hooks

**Extensions are now self-contained** with their own `install.sh`/`uninstall.sh`,
managed via the new `scripts/mzspec` CLI. Core no longer hardcodes skill names —
skills are injected dynamically via prompt hooks at each pipeline phase.

Added:
- `scripts/mzspec` — extension manager CLI: `install`, `uninstall`, `list`, `info`
- `extensions/agent-skills/install.sh` + `uninstall.sh`
- `extensions/tasks/install.sh` + `uninstall.sh`
- `core/workflows/lib/hook-engine.js` — shared hook driver (replaces duplicated inline code)
- `extensions/agent-skills/hooks/on-*.prompt.md` — 9 prompt hooks injecting skill guidance per phase

Changed:
- `core/skills/` — 4 pipeline-essential skills; 8 general skills to `extensions/agent-skills/skills/`
- `core/gates/` — gate contract moved from `extensions/gates/`
- Skill references removed from `ship-code.js`, `address-review.js`, `ship-plan.js` — dynamic via `getPromptHooks()`
- `install.sh` — simplified to core only
- `extensions/gates/` → `core/gates/`
- `extensions/templates/` → `core/templates/` (then removed, starters to `extensions/agent-skills/templates/`)
- `extensions/hooks/` removed entirely
- Scripts moved to `scripts/` (`install.sh`, `update.sh`, `migrate.sh`, `mzspec`)

Removed:
- `/opsx:apply` references everywhere
- `mzspec.config.schema.json` — zero-config, not needed
- Hardcoded `SKILLS` map in `ship-code.js` — replaced by prompt hooks
- `extensions/task-sources/` — contract moved to `extensions/tasks/task-sources/`

## 0.6.0 — (previous release)

## 0.2.0 — zero-config gate resolution + `openspec/hooks/`

**Retires the centralized `mzspec.config.json`.** Gate resolution is now a 3-step
chain (no config required):

1. `openspec/hooks/resolve-gates` (executable) — the universal, per-project override
   for any framework/language; its stdout JSON is the gate plan.
2. `mzspec.config.json` — still honored if present (back-compat).
3. **auto-discovery** (`lib/discover.js`) — the default: the toolchain/gate inventory
   is synthesized from the repo's own manifests (the `uv` workspace in
   `pyproject.toml`, every `go.mod`, `pnpm-workspace.yaml`), the bench ladder and
   migration gate are detected by file presence, and the task source is inferred from
   `git remote`.

Added:
- `lib/discover.js` (+ `lib/discover.test.js`) — the discovery layer.
- `docs/hooks.md` + `templates/resolve-gates.example` — the hook contract.
- `update.sh` + `migrations/` — versioned updates with a migration runner.
- `VERSION` + the `.claude/.mzspec-version` stamp written by `install.sh`.

Changed:
- `lib/gate-resolver.js` — hook → config → discovery chain; tags output `source`.
- `lib/task-sources/` — infers the gh-issues source from the git remote; `cli.js`
  no longer requires a config file.
- `install.sh` — stops writing `mzspec.config.json`; scaffolds `openspec/hooks/`.

Migration `0.2.0-zero-config-hooks.sh`: backs up `mzspec.config.json` →
`.pre-0.2.0.bak`, removes the schema, scaffolds `openspec/hooks/`.

## 0.1.0 — initial

The config-driven ship pipeline: `mzspec.config.json` as the single source of truth
for toolchains/gates, the `/opsx:*` two-PR gated workflow, engineering-practice
skills, task sources, and templates.
