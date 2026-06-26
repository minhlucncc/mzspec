# Changelog

All notable changes to mzspec are recorded here. The installed release is stamped
into each project at `.claude/.mzspec-version`; `update.sh` runs the migrations
between a project's stamped version and the current `VERSION`.

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
