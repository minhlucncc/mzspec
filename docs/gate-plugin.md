# Gate plugins

mzspec ships the gate **resolver** and **runner convention**; your project owns the gate
**scripts**. This is how you plug your own checks into the ship pipeline without touching mzspec.

## The contract (summary)

A gate is any executable that:

- returns **exit 0 = pass, non-zero = fail** (the only thing inspected),
- runs with **cwd = repo root** (resolve paths repo-relative),
- takes **optional positional args**,
- writes diagnostics to **stderr**, a terse `ok:`/`fail:` line to stdout,
- is **deterministic and side-effect-free**.

Full text: [`extensions/gates/CONTRACT.md`](../extensions/gates/CONTRACT.md) (installed to
`.claude/mzspec-gates/CONTRACT.md`).

## Registering a gate

1. Put the script under your `gatesDir` (e.g. `benchmarks/gates/my-check.sh`).
2. Add a `customGates` entry with a `when` predicate:

```jsonc
"gatesDir": "benchmarks/gates",
"customGates": [
  { "name": "acl",       "cmd": "bash benchmarks/gates/retrieve-kb-acl-test.sh", "when": { "toolchains": ["py"] } },
  { "name": "bundle",    "cmd": "bash benchmarks/gates/bundle-size.sh 250",       "when": { "toolchains": ["ts"] } },
  { "name": "migrate",   "cmd": "uv --directory apps/backend run alembic upgrade head", "when": { "touchesMigrations": true } },
  { "name": "free",      "cmd": "bash benchmarks/ci-free-gates.sh",               "when": { "touchesBench": true } }
]
```

### `when` predicates

All keys are optional; **all present keys must hold** for the gate to fire. An empty/absent `when`
fires the gate on every change.

| key | fires when |
|---|---|
| `touches` | a touched path starts with this prefix |
| `touchesMigrations` | the diff touched a `migrations/` or `alembic/` path |
| `touchesBench` | the diff touched the bench `prefix` |
| `toolchains` | at least one of these toolchains is in the resolved plan |

## Seeing the plan

```bash
git diff --name-only main...HEAD | node .claude/workflows/lib/gate-resolver.js --stdin --json
```

emits `{ toolchains, units, flags, always, custom }`. The `custom` array is your matched gate
plugins. The ship-code Verify phase runs every command in `units[].gates`, `always`, and `custom`;
each must exit 0 (with a bounded repair loop on failure).

## Starter gates

`.claude/mzspec-gates/starters/` has generic, project-agnostic examples
(`openspec-validate.sh`, `toolchain-passthrough.sh`). Your real gates live in your repo, not in
mzspec.
