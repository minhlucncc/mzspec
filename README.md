# mzspec

**A reusable, installable spec-driven delivery pipeline for AI coding agents — built on top of
[OpenSpec](https://github.com/Fission-AI/OpenSpec).**

OpenSpec gives you the spec artifacts (`openspec/specs`, `openspec/changes`, the `openspec` CLI,
and the base `/opsx:propose|sync|archive` commands). **mzspec adds the delivery layer on
top of those same artifacts**: a gated, test-first ship pipeline and a polyglot quality-gate
engine — so you get the full lifecycle on any project with one install.

```
OpenSpec (base)            mzspec (this repo, on top)
─────────────────          ──────────────────────────────────────────────
/opsx:propose               /opsx:spec → /opsx:ship-plan → /opsx:ship-code
                            → /opsx:address-review / /opsx:author-review
/opsx:sync|archive          /opsx:merge-pr
                            + the gate-resolver/runner + gate plugin contract
                            + engineering-practice skills
                            (all artifacts still live in openspec/)
```

## Quick start

```bash
# Requires: node, git, and OpenSpec (npm i -g @fission-ai/openspec)

# 1. Install the core pipeline
curl -fsSL https://raw.githubusercontent.com/minhlucncc/mzspec/main/scripts/install.sh | bash

# 2. Install extensions
./mzspec install agent-skills
./mzspec install tasks

# 3. List available extensions
./mzspec list
```

The installer vendors the core pipeline into your project's `.claude/`, writes an **`SDD_GUIDE.md`**,
and installs the **`./mzspec`** CLI for managing extensions. Gates are **zero-config** —
auto-discovered from your repo's own manifests (`pyproject.toml`/`go.mod`/`pnpm-workspace.yaml`),
so no `mzspec.config.json` is required.

## Extension management

`./mzspec` is the entry point for managing extensions:

| Command | What it does |
|---|---|
| `./mzspec list` | List available extensions |
| `./mzspec info <name>` | Show extension details |
| `./mzspec install <name> [--force]` | Install an extension |
| `./mzspec uninstall <name>` | Remove an extension |

Extensions are self-contained in `extensions/<name>/` with their own `install.sh` and `uninstall.sh`.

## What you get

| Layer | What | Where it lands |
|---|---|---|
| **Core pipeline** | the two-PR gated ship pipeline (`spec-change`, `spec-pr`, `ship-plan`, `ship-code`, `address-review`, `author-review`, `merge-pr`) + `/opsx:*` commands + hook engine + gate resolver | `.claude/workflows/`, `.claude/commands/opsx/` |
| **Core skills** | pipeline-essential skills (code review, TDD, spec-driven development, planning) | `.claude/skills/` |
| **Agent skills** *(extension)* | engineering-practice skills from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) + prompt hooks for each pipeline phase | `.claude/skills/`, `openspec/hooks/` |
| **Tasks** *(extension)* | backlog task management over local-folder / GitHub Issues / Mello | `.claude/workflows/`, `.claude/commands/opsx/` |

## How it works

mzspec never invents a parallel artifact store — evidence, handoffs, specs and archives all
live under `openspec/`. The gate-resolver resolves a diff to gates through a 3-step chain:
an `openspec/hooks/resolve-gates` executable (full override) → a `mzspec.config.json` (explicit
pin) → **zero-config auto-discovery** from your manifests (`lib/discover.js`, the default).
Architecture: [docs/architecture.md](docs/architecture.md).

## Customize

mzspec is **zero-config**: the gate inventory is auto-discovered from your repo's own manifests.
To customize, drop an executable **`openspec/hooks/resolve-gates`** that prints a gate plan for
the changed files — see [docs/hooks.md](docs/hooks.md). A legacy `mzspec.config.json` is still
honored for back-compat. See [docs/customize.md](docs/customize.md),
[docs/gate-plugin.md](docs/gate-plugin.md), and [docs/commit-convention.md](docs/commit-convention.md).

## License

MIT. Engineering-practice skills are adapted from
[addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT) — see
[ATTRIBUTION.md](ATTRIBUTION.md).
