# Installing mzspec

## Prerequisites

- **node** — the workflows and gate-resolver run on Node.
- **git** — the installer clones a pinned ref.
- **OpenSpec** — mzspec builds on it. `npm i -g @fission-ai/openspec` and `openspec init` (the
  installer will offer to run `openspec init` if `openspec/` is missing and the CLI is present).

## One-liner

```bash
curl -fsSL https://raw.githubusercontent.com/minhlucncc/mzspec/main/install.sh | bash -s -- --with core,gates,skills
```

Or from a clone:

```bash
git clone https://github.com/minhlucncc/mzspec && bash mzspec/install.sh --dest /path/to/project
```

## Options

| Option | Default | Meaning |
|---|---|---|
| `--with <a,b,c>` | all | components to install (`core`, `gates`, `skills`, `tasks`, `templates`) |
| `--ref <tag>` | `main` | mzspec git ref to pin |
| `--dest <dir>` | cwd | target project root |
| `--force` | off | overwrite already-vendored files (per file) |
| `--upgrade` | off | update an existing install (implies `--force` + runs `migrate.sh`) — see below |
| `--no-openspec` | off | don't auto-run `openspec init` |

## What it does (idempotent)

1. Checks `node`/`git`; warns/initializes OpenSpec if `openspec/` is absent.
2. Fetches the pinned mzspec (or uses the local checkout if you run it from one).
3. Vendors the selected components:
   - `core` → `.claude/workflows/` (+ `lib/`) and `.claude/commands/opsx/`
   - `tasks` → `task` workflow + `lib/task-sources/` + `/opsx:task-*` commands
   - `templates` → `template` workflow + `lib/templates.js` + `/opsx:template-*` commands +
     `.claude/mzspec-templates/` (contract) + starter playbook(s) into `openspec/templates/`
   - `skills` → `.claude/skills/`
   - `gates` → `.claude/mzspec-gates/` (the contract + starters)
4. Vendors the `openspec/hooks/` README + `resolve-gates.example` (the universal gate override),
   the `mzspec.config.schema.json` (editor validation, for the optional config), and an
   **`SDD_GUIDE.md`** (the workflow intro, skip-if-present). It does **not** write a
   `mzspec.config.json` — gates are **zero-config** by default (auto-discovered from your
   manifests); a placeholder config would only shadow that discovery. Add one yourself only to
   override discovery.

Re-running is safe: existing files are skipped unless `--force` is given. The installer prints how
many files were installed vs left in place.

## Upgrading an existing install

`install.sh` only ever *vendors* (copies) files — it never deletes. So a plain re-run won't pick up
files that mzspec **removed** (e.g. a retired workflow), and without `--force` it won't refresh files
that mzspec **changed**. Use `--upgrade` to bring an existing install fully up to date:

```bash
curl -fsSL https://raw.githubusercontent.com/minhlucncc/mzspec/main/install.sh | bash -s -- --upgrade --dest /path/to/project
# or from a clone:
bash mzspec/install.sh --upgrade --dest /path/to/project
```

`--upgrade`:

1. **Refreshes** every mzspec-owned vendored file to the current version (it implies `--force`).
2. **Refreshes `SDD_GUIDE.md`** (the workflow guide tracks mzspec).
3. **Preserves project-owned content** — `mzspec.config.json` and your `openspec/templates/` starter
   playbooks are never overwritten.
4. **Runs `migrate.sh`** to prune the artifacts of removed features (idempotent remove-if-present).

You can also run the prune step on its own without re-vendoring:

```bash
bash mzspec/migrate.sh --dest /path/to/project          # or --dry-run to preview
```

## After installing

1. Gates are **zero-config** — sanity-check what the resolver discovers for a diff:
   `git diff --name-only <base>...HEAD | node .claude/workflows/lib/gate-resolver.js --stdin`.
2. Need to override a gate? Either drop an `openspec/hooks/resolve-gates` executable
   (`cp openspec/hooks/resolve-gates.example openspec/hooks/resolve-gates`) or add an explicit
   `mzspec.config.json` — both optional.
3. (optional) Capture a recurring flow with `/opsx:template-create` — planning consults
   `openspec/templates/`, and no template is fine (see [templates.md](templates.md)).
4. Drive the pipeline: `/opsx:spec` → `/opsx:spec-pr` → `/opsx:ship-plan` → `/opsx:ship-code`.
