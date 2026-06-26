---
name: "OPSX: Task Push"
description: Push a task to its remote backlog — UPSERT (git-like) — create the remote item for a local-authored task, or sync the linked change's status (proposal→in-progress, open PR→in-review, archived→done)
category: Workflow
tags: [workflow, tasks, status, remote, automation]
---

Push a task **to its remote backlog**, git-style. Two cases, one verb:

- **Create (unlinked local task):** a task authored locally (`/opsx:task-create`) that
  isn't on a remote yet → create it on the target remote and record the `remoteRef`.
- **Sync (already linked):** as the linked OpenSpec change moves, push its status back
  (`proposal→in-progress`, `open PR→in-review`, `archived→done`).

Reads the task↔change/remote link (`openspec/changes/<change>/.task-link.json` and/or
`.tasks/<id>/.link.json`).

**Input**: all optional — `--change <name>` (read its link; defaults to the current
`feat/<change>` branch), `--id <taskId>`, `--to <remote>` (target remote source for a
create; default = first enabled non-local source), `--status <todo|in-progress|in-review|done>`
(force a status instead of deriving), `--source <name>`.

**Steps**

1. **Resolve the task** from `--change`/the current branch/`--id` → `{ source, type, taskId, remoteRef? }`.

2. **Upsert:**
   - **No `remoteRef`** → read the local task body and `cli create --source <to>` on the remote;
     write the new `remoteRef` back into the link file(s) with a history entry.
   - **Has `remoteRef`** → derive or take the status and `cli set-status` on the remote; append to history.

3. **Launch the Workflow**:
   ```
   Workflow({ name: 'task', args: { action: 'push', change: '<name?>', id: '<taskId?>', to: '<remote?>', status: '<status?>', source: '<name?>', date: '<YYYY-MM-DD>' } })
   ```

4. **Relay the result.** Report `taskId` (remote id when created), the applied `status`/`created`, and
   `change`. On failure surface `stage` + `reason`.

**Guardrails**
- Create-on-remote happens only when there is no `remoteRef` yet; otherwise it syncs status only.
- Status sync stays within the configured `taskStatusMap` — no closing/reopening beyond it.
- A no-op derive (status unchanged) is fine; report it rather than erroring.
