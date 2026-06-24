---
name: "OPSX: Task Log"
description: Add a comment to the task linked to the current/selected OpenSpec change on the configured task source
category: Workflow
tags: [workflow, tasks, comment, automation]
---

Post a comment to the backlog task linked to an OpenSpec change — e.g. "spec'd as
c0007-…", "PR opened at <url>", "merged". Resolves the task from the change↔task
link written by `/opsx:task-pull`.

**Input**: `--text "<body>"` (required — the comment), plus optional `--id <taskId>`,
`--change <name>`, `--source <name>`. If `--id`/`--change` are omitted, the task is
resolved from the current `feat/<change>` branch's `.task-link.json`.

**Steps**

1. **Resolve the task id** from `--id`, or `--change`, or the current branch's link file.
2. **Launch the Workflow**:
   ```
   Workflow({ name: 'task', args: { action: 'log', id: '<taskId?>', change: '<name?>', text: '<body>', source: '<name?>' } })
   ```
   It pipes the body to `cli comment <taskId>` via stdin (no shell-escaping pitfalls).
3. **Relay the result.** Report the `taskId` commented on. On failure surface `stage` + `reason`.

**Guardrails**
- `--text` is required; never post an empty comment.
- The body is passed via stdin — safe for multi-line / special characters.
