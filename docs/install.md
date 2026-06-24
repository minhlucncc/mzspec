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
| `--with <a,b,c>` | `core,gates,skills` | components to install (`core`, `gates`, `skills`) |
| `--ref <tag>` | `main` | mzspec git ref to pin |
| `--dest <dir>` | cwd | target project root |
| `--force` | off | overwrite already-vendored files (per file) |
| `--no-openspec` | off | don't auto-run `openspec init` |

## What it does (idempotent)

1. Checks `node`/`git`; warns/initializes OpenSpec if `openspec/` is absent.
2. Fetches the pinned mzspec (or uses the local checkout if you run it from one).
3. Vendors the selected components:
   - `core` → `.claude/workflows/` (+ `lib/`) and `.claude/commands/opsx/`
   - `skills` → `.claude/skills/`
   - `gates` → `.claude/mzspec-gates/` (the contract + starters)
4. Writes `mzspec.config.json` from the template **only if absent** (never clobbers yours), plus
   `mzspec.config.schema.json` for editor validation, and an **`SDD_GUIDE.md`** (the workflow intro,
   also skip-if-present).

Re-running is safe: existing files are skipped unless `--force` is given. The installer prints how
many files were installed vs left in place.

## After installing

1. Edit `mzspec.config.json` — set `toolchains.<tc>.dirs` / `gates`, `gatesDir`, `customGates`.
2. Add your gate scripts under your `gatesDir` (see `.claude/mzspec-gates/CONTRACT.md`).
3. Drive the pipeline: `/opsx:spec` → `/opsx:spec-pr` → `/opsx:ship-plan` → `/opsx:ship-code`.
