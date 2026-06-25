# Workflow hooks — `openspec/hooks/`

mzspec is **zero-config**. It needs no `mzspec.config.json`: the per-toolchain gate
inventory is auto-discovered from your repo's own manifests, and the task backlog
source is inferred from your git remote. When a project needs something the
conventions don't cover — another language/framework, custom gates, exclusions —
you **drop a hook** under `openspec/hooks/` instead of maintaining a central config.

A hook is just an executable (any language via shebang). If present, it takes over
that one decision; if absent, mzspec uses its built-in default. This keeps the
common case config-free while making every behavior fully customizable per project.

## `resolve-gates` — gate resolution

The Verify step (ship-code) asks the gate-resolver which quality gates to run for a
change. Resolution chain:

1. **`openspec/hooks/resolve-gates`** (executable) — if present, it **fully owns**
   gate resolution.
2. **`mzspec.config.json`** — honored if present (back-compat).
3. **auto-discovery** — the default: `lib/discover.js` synthesizes the inventory
   from `pyproject.toml`/`[tool.uv.workspace]`, `go.mod` files, and
   `pnpm-workspace.yaml`.

### Contract

- **stdin:** changed files, one path per line (what `git diff --name-only` emits).
- **stdout:** a JSON gate plan:

  ```json
  {
    "toolchains": ["py", "go"],
    "units": [
      { "toolchain": "py", "unitDir": "packages/core",
        "gates": [{ "name": "test", "cmd": "uv --directory packages/core run pytest -q" }] }
    ],
    "always": [{ "name": "openspec-validate", "cmd": "openspec validate \"<change>\" --strict" }],
    "custom": []
  }
  ```

- **exit 0** on success. Any non-zero exit or unparseable stdout falls back to the
  next step in the chain.

The resolver tags its output with `source: "hook" | "config" | "discover"` so you
can see which path produced the plan (`node .claude/workflows/lib/gate-resolver.js --stdin --json`).

### Example

`openspec/hooks/resolve-gates` (make it executable: `chmod +x`):

```sh
#!/usr/bin/env sh
# Cargo project: run fmt/clippy/test whenever any crate file changes.
files=$(cat)
if printf '%s\n' "$files" | grep -q '\.rs$'; then
  cat <<'JSON'
{ "toolchains": ["rust"],
  "units": [{ "toolchain": "rust", "unitDir": ".",
    "gates": [
      { "name": "fmt",    "cmd": "cargo fmt --check" },
      { "name": "clippy", "cmd": "cargo clippy -- -D warnings" },
      { "name": "test",   "cmd": "cargo test" }
    ] }],
  "always": [{ "name": "openspec-validate", "cmd": "openspec validate \"<change>\" --strict" }] }
JSON
else
  echo '{ "toolchains": [], "units": [], "always": [{ "name": "openspec-validate", "cmd": "openspec validate \"<change>\" --strict" }] }'
fi
```

## `task-source` — task backlog (optional)

By default the task backlog source is inferred as GitHub Issues on your `origin`
remote. Configure a different backend with a `taskSources` entry in a legacy config,
or (future) an `openspec/hooks/task-source` hook.

## Adding more hook points

The same pattern extends to other workflow decisions (e.g. `pre-verify`,
`post-archive`). Each looks for `openspec/hooks/<name>`, runs it if present, and
falls back to a built-in default otherwise — so a repo customizes only what it needs.
