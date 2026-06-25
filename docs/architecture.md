# Architecture

mzspec is a thin delivery layer on top of OpenSpec. This doc explains the seam and the state
machine.

## The layering: mzspec on OpenSpec

OpenSpec owns the **artifact model**; mzspec owns the **delivery pipeline**. Both operate on the
same `openspec/` tree — mzspec never creates a parallel store.

```
            ┌─────────────────────────── your project ───────────────────────────┐
            │  openspec/                          ← OpenSpec owns the artifacts     │
            │    specs/      (canonical)                                            │
            │    changes/<c>/{proposal,design,tasks}.md, specs/   ← delta           │
            │    changes/<c>/evidence/            ← mzspec writes here              │
            │    changes/archive/                                                   │
            │  .handoff/<c>/                      ← mzspec ship-plan handoff        │
            │  mzspec.config.json                 ← mzspec config (toolchains/gates)│
            │  .claude/workflows, commands, skills← mzspec, vendored by install.sh  │
            └──────────────────────────────────────────────────────────────────────┘
```

- **OpenSpec provides:** the `openspec` CLI, `openspec init`/`validate`, and the base
  `/opsx:propose`, `/opsx:apply`, `/opsx:sync`, `/opsx:archive` commands.
- **mzspec adds:** `/opsx:spec`, `/opsx:spec-pr`, `/opsx:ship-plan`, `/opsx:ship-code`,
  `/opsx:ship`, `/opsx:ship-pr`, `/opsx:address-review`, `/opsx:author-review`, `/opsx:merge-pr`,
  plus the gate engine.

The `/opsx:*` namespace is shared deliberately — mzspec extends OpenSpec's command surface rather
than forking it.

## The two-PR, spec-first state machine

```
  /opsx:propose ─▶ /opsx:spec ─▶ /opsx:spec-pr ──▶ [human merges SPEC PR]
   (OpenSpec)      (review,       (sync delta→            │  contract now on main
                    6 axes)        canonical, open PR)     ▼
                                          /opsx:ship-plan ─▶ /opsx:ship-code ─▶ [human merges CODE PR]
                                          (TDD units in     (Red→Green→commit per unit,
                                           .handoff/)         Verify gates, Review,
                                                              Evidence, Sync-reconcile)
                                                                     │
                                              /opsx:author-review ─┬─ review mode (AI, 4 dimensions)
                                             (lead runs on PR)    └─ comment mode (custom message)
                                                                           │
                                              /opsx:address-review ◀───────┘  (PR feedback loop)
                                                               │
                                               /opsx:merge-pr ──┘  (lead merges PR, closes issue)
                                                                     │
                                                          /opsx:archive (OpenSpec)
```

The agent never merges to the base branch — a human merges both the spec PR and the code PR.

## The gate engine

`lib/gate-resolver.js` maps `git diff --name-only <base>...HEAD` to the exact, deduped set of
quality gates for the change. It resolves the gate inventory through a **3-step chain** (no
central config required):

1. **`openspec/hooks/resolve-gates`** — if this executable exists, run it; its stdout JSON *is*
   the plan. The universal override for any framework/language.
2. **`mzspec.config.json`** — if present, use it (explicit pin; back-compat).
3. **auto-discovery** (`lib/discover.js`, the **zero-config default**) — synthesize the inventory
   from the repo's own manifests: `[tool.uv.workspace]` members / `pyproject.toml` (py), every
   `go.mod` (go), `pnpm-workspace.yaml` packages with a `lint` script (ts), plus the bench ladder
   and the alembic migration gate when present.

Given that inventory, it then **classifies** each touched file to a toolchain by longest-prefix
match, **emits** that toolchain's gates per touched package, **adds** the bench free ladder when a
trigger toolchain/path is touched, and **appends** the always-gates (e.g. `openspec validate`) and
the migration gate when relevant.

The ship-code Verify phase runs every emitted command; each must exit 0. See
[gate-plugin.md](gate-plugin.md).

## What stays project-owned

mzspec is generic. Your toolchain inventory is auto-discovered from your manifests; your concrete
gate overrides (`openspec/hooks/resolve-gates`), any explicit config, and your hard-invariants
live in *your* repo, not in mzspec. The `examples/meknow/` config shows a
complete real-world setup.
