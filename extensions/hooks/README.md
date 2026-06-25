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

## Lifecycle hooks — `on-<event>` (task wiring)

As a change moves through the pipeline, mzspec keeps the linked backlog ticket in sync:
it comments the ticket, advances its status, assigns it at ship time, and records the
spec/code-PR + branch + CHANGELOG + archive refs in `openspec/changes/<change>/.task-link.json`
(the source of truth). This is **built-in** — it runs automatically whenever the change is
linked to a ticket (i.e. it was pulled via `/opsx:task-pull`); if there's no link it no-ops.

Six events fire, each from the workflow that owns that step:

| Event | Fires from | Built-in default |
|---|---|---|
| `before-spec`          | `/opsx:spec`     | comment "spec started"; keep `in-progress` |
| `after-spec-pr-opened` | `/opsx:spec-pr`  | comment + record `specPr`; status → `in-review` |
| `after-spec-pr-merged` | `/opsx:merge-pr` (spec branch) | comment + record `specPr.mergedSha` |
| `before-ship`          | `/opsx:ship`     | comment "implementation starting"; record `branch` |
| `after-code-pr-opened` | `/opsx:ship`     | comment + record `codePr`; **assign `@me`**; status → `in-review` |
| `after-code-pr-merged` | `/opsx:merge-pr` (feat branch) | comment + traceability; status → `done`; record archive |

Assignment happens **only** at `after-code-pr-opened`, to `@me` (the gh user shipping),
and only when the ticket has no assignee yet — a manual reassignment is never clobbered.

### The `on-<event>` hook (optional extension)

Drop an executable `openspec/hooks/on-<event>` (copy the matching `.example`, `chmod +x`)
to **extend** an event — e.g. ping Slack, set a custom label. It runs **after** the
built-in default.

- **stdin:** one JSON context object —
  `{ "event", "change", "date", "taskId", "task", "link", "refs", "comment", "repo" }`.
- **stdout:** optional JSON, merged into the lifecycle result's `extra`.
- **exit 0** — a non-zero exit or invalid JSON is **logged and ignored** (best-effort).
  Unlike `resolve-gates`, lifecycle hooks never fall back and never fail the ship.

The whole lifecycle layer is best-effort: a failing adapter or hook records an error but
the `.task-link.json` is still updated and the ship proceeds. See
`docs/task-sources.md` for the `.task-link.json` schema and the `setAssignee` adapter verb.

### The `on-<event>.agent.md` hook (optional, agentic)

Where the executable `on-<event>` shell hook runs a deterministic script, an
`openspec/hooks/on-<event>.agent.md` hook is a set of **natural-language instructions the
workflow runs as an agent** — with full tool access (`gh`, `git`, `node`, the task-source
CLI). Use it for work a script can't reasonably do: drafting a release note from the diff,
deciding based on spec content, opening a follow-up, posting a richer ticket/PR comment.

- **Driven from the workflow, not from `lifecycle.js`.** The owning workflow (currently
  `merge-pr` for `after-spec-pr-merged` / `after-code-pr-merged`) has a dedicated **Hooks
  phase** whose agent hook-runner: (1) runs `lifecycle.js <event>` — the built-in ticket
  comment + status + the `on-<event>` shell hook — then (2) if `on-<event>.agent.md`
  exists, reads it and follows its instructions as an agent task.
- **Context:** the runner passes the `change`, `event`, merged PR #/URL, and merge SHA;
  read `openspec/changes/<change>/.task-link.json` for the linked ticket.
- **Best-effort:** a failure is logged in the workflow result's `hooks.errors[]` and never
  un-does the merge.
- Copy `on-after-spec-pr-merged.agent.md.example` → `on-after-spec-pr-merged.agent.md`
  (drop the `.example`) and edit. The runner matches the exact name `on-<event>.agent.md`.
