# Customizing mzspec for your project

Everything project-specific is in **`mzspec.config.json`** at your repo root.
You should not need to edit any vendored `.claude/` file.

## Toolchains

Declare one entry per toolchain. Each has the package `dirs` it owns and the `gates` to run on a
touched package. `{dir}` is substituted with the touched directory.

```jsonc
"toolchains": {
  "go": {                          // declare go BEFORE py if a dir name could match both —
    "dirs": ["packages/event-core", "apps/worker-x"],   // first-declared wins ties
    "gates": [
      { "name": "build", "cmd": "(cd {dir} && go build ./...)" },
      { "name": "test",  "cmd": "(cd {dir} && go test -race ./...)" }
    ]
  },
  "py": {
    "dirs": ["packages/core", "apps/api"],
    "gates": [
      { "name": "lint",      "cmd": "uv --directory {dir} run ruff check ." },
      { "name": "typecheck", "cmd": "uv --directory {dir} run pyright" },
      { "name": "test",      "cmd": "uv --directory {dir} run python -m pytest -q" }
    ]
  }
}
```

A touched file is matched to a toolchain by **longest path-prefix** over its `dirs`. Files under
no toolchain (and not bench/meta) are treated as meta (validate-only).

## Bench "free ladder" (optional)

A fast cross-cutting suite that runs as its own unit and is auto-added when a trigger toolchain
or a bench path is touched:

```jsonc
"bench": {
  "prefix": "benchmarks/",
  "dir": "benchmarks",
  "alsoWhenToolchains": ["py"],          // also run it whenever py is touched
  "gates": [{ "name": "free-ladder", "cmd": "bash benchmarks/ci-free-gates.sh" }]
}
```

Leave `gates: []` to disable.

## Always-gates, meta, migration

```jsonc
"metaPrefixes": ["openspec/", "docs/", ".claude/", ".github/"],   // doc/config-only → validate-only
"always":   [{ "name": "openspec-validate", "cmd": "openspec validate \"<change>\" --strict" }],
"migration":{ "pattern": "(^|/)(migrations|alembic)/",
              "gate": { "name": "migration", "cmd": "... alembic upgrade head" } }   // gate:null to disable
```

## Custom gates (your gate scripts)

See [gate-plugin.md](gate-plugin.md). Drop scripts under `gatesDir` and register them in
`customGates` with a `when` predicate.

## Invariants

List your project's hard-invariants under `invariants`. The `security-and-hardening` and
`code-review-and-quality` skills read these instead of the MeKnow examples they ship with.

## Reference

See [docs/gate-plugin.md](gate-plugin.md) for gate configuration examples.
