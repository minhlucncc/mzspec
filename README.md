# mzspec

**A reusable, installable spec-driven delivery pipeline for AI coding agents — built on top of
[OpenSpec](https://github.com/Fission-AI/OpenSpec).**

OpenSpec gives you the spec artifacts (`openspec/specs`, `openspec/changes`, the `openspec` CLI,
and the base `/opsx:propose|apply|sync|archive` commands). **mzspec adds the delivery layer on
top of those same artifacts**: a gated, test-first ship pipeline and a polyglot quality-gate
engine — so you get the full lifecycle on any project with one install.

```
OpenSpec (base)            mzspec (this repo, on top)
─────────────────          ──────────────────────────────────────────────
openspec CLI + folder  →   /opsx:spec → /opsx:spec-pr → /opsx:ship-plan
/opsx:propose|apply         → /opsx:ship-code → /opsx:address-review → ship-all
/opsx:sync|archive          + the gate-resolver/runner + gate plugin contract
                            + engineering-practice skills
                            (all artifacts still live in openspec/)
```

## Install

```bash
# Requires: node, git, and OpenSpec (npm i -g @fission-ai/openspec)
curl -fsSL https://raw.githubusercontent.com/minhlucncc/mzspec/main/install.sh | bash -s -- --with core,gates,skills
```

The installer vendors the pipeline into your project's `.claude/`, drops a `mzspec.config.json` you
fill in, and writes an **`SDD_GUIDE.md`** that orients humans + agents to the `task → spec → ship`
workflow. It's idempotent (re-run anytime; `--force` to overwrite). Pick components with `--with`
(`core`, `gates`, `skills`, `tasks`, `templates`). See [docs/install.md](docs/install.md).

## What you get

| Layer | What | Where it lands |
|---|---|---|
| **Workflow** (`core`) | the two-PR gated ship pipeline (`spec-change`, `spec-pr`, `ship-plan`, `ship-code`, `ship-all`, `address-review`) + the `/opsx:*` commands | `.claude/workflows/`, `.claude/commands/opsx/` |
| **Scripts** (`core`) | the config-driven **gate-resolver** (maps a diff → the exact per-toolchain gates) | `.claude/workflows/lib/` |
| **Extensions: gates** | the **gate plugin contract** + generic starter gates | `.claude/mzspec-gates/` |
| **Extensions: skills** | engineering-practice skills (TDD, code review, security, …) | `.claude/skills/` |
| **Tasks** (`tasks`) | the pipeline front — `task → spec → ship`. Author/pull/list backlog tasks and push status/items back: `/opsx:task-create\|list\|pull\|push\|log` over local-folder / GitHub Issues / Mello (per-project `taskSources`) | `.claude/workflows/lib/task-sources/`, `.claude/commands/opsx/task-*.md` |
| **Templates** (`templates`) | optional, **skill-like project guides** — *planning playbooks* (how to break a kind of change into tasks; thin per-step playbooks **chain** into composites by prose the AI follows — a full `presale` chain, a selective `change-request` chain, no resolver) and *convention guides* (e.g. `tdd`: your test commands/patterns/fixtures the generic skills defer to) — `/opsx:template-create\|update\|remove\|list`. A template is a `<name>/TEMPLATE.md`; if none matches, the core proceeds normally | `openspec/templates/`, `.claude/commands/opsx/template-*.md`, `.claude/mzspec-templates/` |
| **Config** | `mzspec.config.json` — the single source of truth for your toolchains, gates, and invariants | repo root |

## Configure

Everything project-specific lives in **`mzspec.config.json`** (validated by
[`mzspec.config.schema.json`](mzspec.config.schema.json)). Declare your toolchains, their
package dirs and gate commands, register your own gate scripts via `customGates`, and list
your hard-invariants. The [`examples/meknow/`](examples/meknow/) config is a complete,
real-world reference (a polyglot Python+Go+TS monorepo). See [docs/customize.md](docs/customize.md)
and [docs/gate-plugin.md](docs/gate-plugin.md).

## How it works

mzspec never invents a parallel artifact store — evidence, handoffs, specs and archives all
live under `openspec/`. The gate-resolver is config-driven; with the meknow example config it
emits a **byte-identical** gate plan to the original hand-rolled resolver it was extracted from
(`node --test lib/gate-resolver.test.js`). Architecture: [docs/architecture.md](docs/architecture.md).

## License

MIT. Engineering-practice skills are adapted from
[addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT) — see
[ATTRIBUTION.md](ATTRIBUTION.md).
