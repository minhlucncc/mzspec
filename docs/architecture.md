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
  `/opsx:ship`, `/opsx:ship-pr`, `/opsx:ship-all`, `/opsx:address-review`, `/opsx:author-review`, `/opsx:merge-pr`,
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
`/opsx:ship-all` runs the whole thing in batch across every ACTIVE change (local merges).

## The gate engine

`lib/gate-resolver.js` maps `git diff --name-only <base>...HEAD` to the exact, deduped set of
quality gates for the change, driven entirely by `mzspec.config.json`:

1. **classify** each touched file to a toolchain by longest-prefix match over
   `toolchains.<tc>.dirs` (declaration order breaks ties — declare `go` before `py`).
2. **emit** that toolchain's `gates` (with `{dir}` substituted) per touched package.
3. **add** the bench "free ladder" when a trigger toolchain or a bench path is touched.
4. **append** always-gates (e.g. `openspec validate`) and the migration gate when relevant.
5. **append** matching `customGates` — the plugin hook for your own gate scripts.

The ship-code Verify phase runs every emitted command; each must exit 0. See
[gate-plugin.md](gate-plugin.md).

## What stays project-owned

mzspec is generic. Your concrete gate scripts, your toolchain inventory, and your hard-invariants
live in *your* repo (config + `gatesDir`), not in mzspec. The `examples/meknow/` config shows a
complete real-world setup.
