---
name: "OPSX: Task Push"
description: Push a change's current lifecycle status back to its linked task (proposal→in-progress, open PR→in-review, archived→done) on the configured task source
category: Workflow
tags: [workflow, tasks, status, automation]
---

Sync the status of a task back to its backlog as the linked OpenSpec change moves
through the pipeline. Reads the change↔task link written by `/opsx:task-pull`
(`openspec/changes/<change>/.task-link.json`) and applies the mapped status via the
task-sources CLI.

**Input**: all optional — `--change <name>` (which change's link to read; defaults
to the current `feat/<change>` branch), `--id <taskId>` (target a task directly),
`--status <todo|in-progress|in-review|done>` (force a status instead of deriving it),
`--source <name>`.

**Steps**

1. **Resolve the link.** From `--change`/the current branch, read
   `openspec/changes/<change>/.task-link.json` → `{ source, type, taskId }`. (Or use `--id`/`--source`.)

2. **Derive or take the status.** If `--status` is given, use it. Otherwise derive from the change's
   lifecycle: archived → `done`; open PR for `feat/<change>` → `in-review`; else proposal exists →
   `in-progress`.

3. **Launch the Workflow**:
   ```
   Workflow({ name: 'task', args: { action: 'push', change: '<name?>', id: '<taskId?>', status: '<status?>', source: '<name?>', date: '<YYYY-MM-DD>' } })
   ```
   It calls `cli set-status <taskId> <status>` and appends `{ at, status }` to the link history.

4. **Relay the result.** Report `taskId`, applied `status`, and `change`. On failure surface
   `stage` + `reason`.

**Guardrails**
- Only updates status — never closes/reopens beyond the configured `taskStatusMap`.
- A no-op derive (status unchanged) is fine; report it rather than erroring.
- Use this at lifecycle moments (PR opened, merged/archived) until auto-hooks land.
