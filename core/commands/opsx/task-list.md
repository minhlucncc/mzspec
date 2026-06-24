---
name: "OPSX: Task List"
description: List the backlog from the configured task source(s) — local-folder / GitHub Issues / Mello — optionally filtered by status
category: Workflow
tags: [workflow, tasks, backlog]
---

Show the task backlog. Read-only. Defaults to the enabled task source; `--source <name>`
picks one, `--all` aggregates across every enabled source. Use it to see what is
pullable before `/opsx:task-pull`.

**Input** — all optional: `--source <name>`, `--status <todo|in-progress|in-review|done>`,
`--all` (across enabled sources).

**Steps**

1. **List.** Run the task-sources CLI directly (read-only, no workflow needed):
   ```
   node .claude/workflows/lib/task-sources/cli.js list [--source <name>] [--status <s>] --json
   ```
   For `--all`, run it once per enabled `taskSources` entry and merge.

2. **Render.** Present a compact table: `id │ status │ title │ source` (sorted by source then id).
   Mark which are `todo` (pullable).

3. **Next step.** Suggest `/opsx:task-pull --id <id>` for a specific task, or `/opsx:task-pull` for the
   top todo.

**Guardrails**
- Strictly read-only — never create, status-change, or comment.
