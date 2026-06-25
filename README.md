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
/opsx:propose|apply         → /opsx:ship-code → /opsx:address-review
                            /opsx:author-review (lead reviews member's PR → address-review)
                            /opsx:merge-pr      (lead merges PR, closes issue, links ticket)
/opsx:sync|archive          + the gate-resolver/runner + gate plugin contract
                            + engineering-practice skills
                            (all artifacts still live in openspec/)
```

## Install

```bash
# Requires: node, git, and OpenSpec (npm i -g @fission-ai/openspec)
curl -fsSL https://raw.githubusercontent.com/minhlucncc/mzspec/main/install.sh | bash -s -- --with core,gates,skills
```

The installer vendors the pipeline into your project's `.claude/` and writes an **`SDD_GUIDE.md`**
that orients humans + agents to the `task → spec → ship` workflow. Gates are **zero-config** —
auto-discovered from your repo's own manifests (`pyproject.toml`/`go.mod`/`pnpm-workspace.yaml`),
so no `mzspec.config.json` is required. It's idempotent (re-run anytime; `--force` to overwrite,
`--upgrade` to refresh + prune). Pick components with `--with` (`core`, `gates`, `skills`, `tasks`,
`templates`). See [docs/install.md](docs/install.md).

## What you get

| Layer | What | Where it lands |
|---|---|---|
| **Workflow** (`core`) | the two-PR gated ship pipeline (`spec-change`, `spec-pr`, `ship-plan`, `ship-code`, `address-review`, `author-review`, `merge-pr`) + the `/opsx:*` commands | `.claude/workflows/`, `.claude/commands/opsx/` |
| **Scripts** (`core`) | the **gate-resolver** (maps a diff → the exact per-toolchain gates; zero-config auto-discovery via `discover.js`, optional `mzspec.config.json` / `openspec/hooks/resolve-gates` overrides) | `.claude/workflows/lib/` |
| **Extensions: gates** | the **gate plugin contract** + generic starter gates | `.claude/mzspec-gates/` |
| **Extensions: skills** | engineering-practice skills (TDD, code review, security, …) | `.claude/skills/` |
| **Tasks** (`tasks`) | the pipeline front — `task → spec → ship`. Author/pull/list backlog tasks and push status/items back: `/opsx:task-create\|list\|pull\|push\|log` over local-folder / GitHub Issues / Mello (per-project `taskSources`) | `.claude/workflows/lib/task-sources/`, `.claude/commands/opsx/task-*.md` |
| **Templates** (`templates`) | optional, **skill-like project guides** — *planning playbooks* (how to break a kind of change into tasks; thin per-step playbooks **chain** into composites by prose the AI follows — a full `presale` chain, a selective `change-request` chain, no resolver) and *convention guides* (e.g. `tdd`: your test commands/patterns/fixtures the generic skills defer to) — `/opsx:template-create\|update\|remove\|list`. A template is a `<name>/TEMPLATE.md`; if none matches, the core proceeds normally | `openspec/templates/`, `.claude/commands/opsx/template-*.md`, `.claude/mzspec-templates/` |
| **Config** (optional) | `mzspec.config.json` — override auto-discovery when you need to pin toolchains/gates/invariants; omit it for zero-config | repo root |

## Configure

Everything project-specific lives in **`mzspec.config.json`** (validated by
[`mzspec.config.schema.json`](mzspec.config.schema.json)). Declare your toolchains, their
package dirs and gate commands, register your own gate scripts via `customGates`, and list
your hard-invariants. The [`examples/meknow/`](examples/meknow/) config is a complete,
real-world reference (a polyglot Python+Go+TS monorepo). See [docs/customize.md](docs/customize.md),
[docs/gate-plugin.md](docs/gate-plugin.md), and [docs/commit-convention.md](docs/commit-convention.md).

## How it works

mzspec never invents a parallel artifact store — evidence, handoffs, specs and archives all
live under `openspec/`. The gate-resolver resolves a diff to gates through a 3-step chain:
an `openspec/hooks/resolve-gates` executable (full override) → a `mzspec.config.json` (explicit
pin) → **zero-config auto-discovery** from your manifests (`lib/discover.js`, the default). With
the meknow example config it still emits a **byte-identical** plan to the original hand-rolled
resolver (`node --test lib/gate-resolver.test.js`). Architecture: [docs/architecture.md](docs/architecture.md).

## License

MIT. Engineering-practice skills are adapted from
[addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT) — see
[ATTRIBUTION.md](ATTRIBUTION.md).
