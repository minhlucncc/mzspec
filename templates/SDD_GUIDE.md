# Spec-Driven Development with mzspec

This project uses **[mzspec](https://github.com/minhlucncc/mzspec)** — a spec-driven delivery
pipeline built on top of [OpenSpec](https://github.com/Fission-AI/OpenSpec). Non-trivial work flows
**task → spec → ship**, gated by two human-reviewed PRs. This guide is the 2-minute orientation; the
commands live under `/opsx:*`.

## The pipeline

```
  task ──▶ spec ──▶ ship
   │         │        │
   │         │        └─ implement test-first, verify gates, open the CODE PR (human merges)
   │         └─ write & review the spec, open the SPEC PR (human merges → contract on main)
   └─ pick the next backlog item (or author one) and turn it into a change
```

Nothing reaches `main` without a human merging the spec PR **and** the code PR. The agent never
self-merges.

## 1. Task — get something to work on

The backlog is pluggable (configured in `mzspec.config.json` → `taskSources`: a local `.tasks/`
folder, GitHub Issues, or Mello). Verbs:

| Command | What it does |
|---|---|
| `/opsx:task-list` | show the backlog (`--source`, `--status`, `--all`) |
| `/opsx:task-pull` | take the top open task (or `--id`) → create an OpenSpec change `cNNNN-<slug>`, seed `proposal.md` from it, mark the task **in-progress** |
| `/opsx:task-create` | author a new task from a `--prompt`, the current change (`--from-change`), or working code (`--from-diff`) — local, or push to a remote |
| `/opsx:task-push` | push a local task to the remote backlog, or sync the change's status back (in-progress → in-review → done) |
| `/opsx:task-log` | comment on the linked task |

You can also skip the backlog and start straight from a prompt with `/opsx:propose`.

## 2. Spec — define the contract before code

| Command | What it does |
|---|---|
| `/opsx:propose` | create the change + draft `proposal.md` / `design.md` / `tasks.md` / delta specs |
| `/opsx:spec` | review the spec across 6 axes (structure, clarity, testability, minimality, consistency, completeness) until it's APPROVE |
| `/opsx:spec-pr` | sync the delta specs into the canonical `openspec/specs/` and open the **SPEC PR** — a human merges it so the contract is on `main` |

## 3. Ship — implement against the merged contract

| Command | What it does |
|---|---|
| `/opsx:ship-plan` | group the change into a few test-first work-units under `.handoff/<change>/` |
| `/opsx:ship-code` | implement unit-by-unit (Red → Green → one commit), run the resolver-selected gates, write evidence, open the **CODE PR** (human merges) |
| `/opsx:address-review` | address human PR feedback, re-run gates, push, reply |
| `/opsx:archive` | after the code PR merges, archive the change |

`/opsx:ship` runs plan → code in one go; `/opsx:ship-all` batches every active change.

## Where things live

- `openspec/specs/` — the canonical capability specs (the contract).
- `openspec/changes/<change>/` — in-progress change: `proposal.md`, `design.md`, `tasks.md`, delta
  `specs/`, `evidence/`, and `.task-link.json` (the link back to the backlog task).
- `openspec/changes/archive/` — shipped changes.
- `.handoff/<change>/` — the test-first execution plan (git-ignored).
- `mzspec.config.json` — this project's config: toolchains + quality **gates**, `taskSources`, and
  hard `invariants`. Edit this, not the vendored `.claude/` files.

## Quality gates

On every change, `ship-code` resolves which gates to run from the touched files
(`.claude/workflows/lib/gate-resolver.js` reading `mzspec.config.json`) — per-toolchain lint/type/test
plus any project gates — and each must pass before the PR. See `.claude/mzspec-gates/CONTRACT.md`.

## Quick start

```
/opsx:task-list                 # what's in the backlog?
/opsx:task-pull                 # take the top one → a new change
/opsx:spec <change>             # review the spec
/opsx:spec-pr <change>          # open the spec PR  → (human merges)
/opsx:ship-plan <change>        # plan the work-units
/opsx:ship-code <change>        # implement + open the code PR → (human merges)
/opsx:task-push --change <c>    # report status back to the backlog
/opsx:archive <change>
```

Full docs: [task sources](https://github.com/minhlucncc/mzspec/blob/main/docs/task-sources.md) ·
[architecture](https://github.com/minhlucncc/mzspec/blob/main/docs/architecture.md) ·
[customize](https://github.com/minhlucncc/mzspec/blob/main/docs/customize.md).
