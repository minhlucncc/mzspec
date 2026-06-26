---
name: "OPSX: Task Create"
description: Author a new backlog task from a prompt, from the current change's spec, or from working code/diff — into the local backlog (or directly onto a remote), optionally pushing it to a remote
category: Workflow
tags: [workflow, tasks, backlog, authoring]
---

Author a new task and add it to the backlog. The content comes from one of: a free
prompt, the **current change's spec** (`--from-change`), or the **working code**
(`--from-diff`). By default it lands in the enabled `local-folder` source; pass
`--source <name>` to create it directly on a remote, or `--push <remote>` to author
locally and immediately publish it to the remote backlog. This is the reverse of
`/opsx:task-pull` — turn what you (or the code) already have into a tracked task.

**Input** — one content source:
- `--prompt "<text>"` — describe the task, or
- `--from-change <name>` — distill the change's `proposal.md`/specs into a task, or
- `--from-diff` — summarize the working `git diff` into a task.

Plus optional `--source <name>` (where to create; default = first enabled, usually
`local`), `--push <remote>` (also create it on that remote and link), `--labels a,b`.

**Steps**

1. **Draft.** The workflow's Resolve phase reads the chosen source (prompt / change / diff) and drafts
   a `{ title, body, labels }`. Preview it.

2. **Approval gate.** Show the drafted title + body and where it will be created. Use
   **AskUserQuestion**: "Create this task?" with options *Create it*, *Edit first*, *Cancel*. Don't
   write without an explicit choice.

3. **Launch the Workflow** (date from context):
   ```
   Workflow({ name: 'task', args: { action: 'create', prompt: '<?>', fromChange: '<?>', fromDiff: <bool>, source: '<?>', pushTo: '<remote?>', date: '<YYYY-MM-DD>' } })
   ```
   Resolve (draft) → Apply (`cli create` on the source; if `--push`, also `cli create` on the remote and
   write the `remoteRef` link).

4. **Relay the result.** Report the new `taskId`, title, `url`, and `remoteRef` (if pushed), and the next
   step (`/opsx:task-pull --id <taskId>` to start specing it).

**Guardrails**
- Never write a task without the approval gate in step 2.
- Faithful drafting: a `--from-change`/`--from-diff` task must reflect the real spec/code, not invent scope.
- New tasks start as `todo`.
