# Installing mzspec

## Prerequisites

- **node** — the workflows and gate-resolver run on Node.
- **git** — the installer clones a pinned ref.
- **OpenSpec** — mzspec builds on it. `npm i -g @fission-ai/openspec` and `openspec init` (the
  installer will offer to run `openspec init` if `openspec/` is missing and the CLI is present).

## One-liner

```bash
curl -fsSL https://raw.githubusercontent.com/minhlucncc/mzspec/main/scripts/install.sh | bash
```

Or from a clone:

```bash
git clone https://github.com/minhlucncc/mzspec && bash mzspec/scripts/install.sh --dest /path/to/project
```

## Options

| Option | Default | Meaning |
|---|---|---|
| `--ref <tag>` | `main` | mzspec git ref to pin |
| `--dest <dir>` | cwd | target project root |
| `--force` | off | overwrite already-vendored files (per file) |
| `--upgrade` | off | update an existing install (implies `--force` + runs `migrate.sh`) |
| `--no-openspec` | off | don't auto-run `openspec init` |

## What it does

1. Checks `node`/`git`; warns/initializes OpenSpec if `openspec/` is absent.
2. Fetches the pinned mzspec (or uses the local checkout if you run it from one).
3. Vendors the **core pipeline**:
   - Workflows → `.claude/workflows/`
   - Commands → `.claude/commands/opsx/`
   - Lib (gate-resolver, discover, hook-engine, etc.) → `.claude/workflows/lib/`
   - Core skills → `.claude/skills/`
   - Gate contract → `.claude/workflows/lib/`
4. Writes `SDD_GUIDE.md` (the workflow intro, skip-if-present).

Gates are **zero-config** — auto-discovered from your manifests; no config needed.

## Installing extensions

Extensions are self-contained and managed via the `scripts/mzspec` CLI:

```bash
# List available extensions
bash scripts/mzspec list

# Install an extension
bash scripts/mzspec install agent-skills --dest /path/to/project --force

# Remove an extension
bash scripts/mzspec uninstall agent-skills --dest /path/to/project
```

Extensions live in `extensions/<name>/` with their own `install.sh` and `uninstall.sh`.

## Upgrading an existing install

`install.sh` only ever *vendors* (copies) files — it never deletes. Use `--upgrade` to bring
an existing install fully up to date:

```bash
curl -fsSL https://raw.githubusercontent.com/minhlucncc/mzspec/main/scripts/install.sh | bash -s -- --upgrade --dest /path/to/project
```

`--upgrade`:
1. **Refreshes** every mzspec-owned vendored file (implies `--force`).
2. **Refreshes `SDD_GUIDE.md`**.
3. **Runs `migrate.sh`** to prune artifacts of removed features.

You can also run the prune step on its own:

```bash
bash scripts/migrate.sh --dest /path/to/project          # or --dry-run to preview
```

## After installing

1. Gates are **zero-config** — sanity-check what the resolver discovers for a diff:
   `git diff --name-only <base>...HEAD | node .claude/workflows/lib/gate-resolver.js --stdin`.
2. Need to override a gate? Drop an `openspec/hooks/resolve-gates` executable or add an
   `mzspec.config.json` — both optional.
3. Install extensions: `bash scripts/mzspec install agent-skills`
4. Drive the pipeline: `/opsx:spec` → `/opsx:spec-pr` → `/opsx:ship-plan` → `/opsx:ship-code`.
