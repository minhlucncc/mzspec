---
name: "OPSX: Task Pull"
description: Pull the next task from the configured task source (local-folder | gh-issues | mello-cli) into a new OpenSpec change — seed proposal.md from the task and mark it in-progress
category: Workflow
tags: [workflow, tasks, backlog, automation]
---

Pull "the next task to do" from the project's task backlog and turn it into an
OpenSpec change. The task source is whichever entry in `mzspec.config.json`
`taskSources` is enabled (override with `--source <name>`). This creates
`cNNNN-<slug>`, seeds `proposal.md` from the task title/body, flips the task to
**in-progress**, and writes the task↔change link. It is the front door to the
spec pipeline: `/opsx:task-pull` → `/opsx:spec` → `/opsx:spec-pr` → `/opsx:ship-*`.

**Input**: all optional — `--source <name>` (which task source), `--id <taskId>`
(pull a specific task instead of the top open one), `--list` (just print the
backlog and stop, create nothing).

**Steps**

1. **Resolve & preview.** Run `node .claude/workflows/lib/task-sources/cli.js next [--source <name>] --json`
   (or `... get <id> ...`) to fetch the candidate task. If `--list`, run `... list ... --json` and
   show the backlog, then STOP.

2. **Approval gate.** Summarize the task (id, title, a few lines of body) and the change name it will
   create. Use **AskUserQuestion**: "Pull this task into a new change?" with options *Pull it*,
   *Pick another (--id)*, *Cancel*. Don't proceed without an explicit choice.

3. **Launch the Workflow** (date from context):
   ```
   Workflow({ name: 'task', args: { action: 'pull', source: '<name?>', id: '<taskId?>', list: <bool>, date: '<YYYY-MM-DD>' } })
   ```
   Phases: **Resolve** (load config → resolve source → fetch task) → **Apply** (`openspec new change` →
   seed proposal.md from the task body → `cli set-status <id> in-progress` → write `.task-link.json`
   and, for a local-folder task, the task's `.link.json`).

4. **Relay the result.** Report the pulled `taskId`/title, the created `change`, the `proposalPath`,
   and the next step (`/opsx:spec <change>`). On no-task or failure, surface `stage` + `reason`.

**Guardrails**
- Never create a change without the approval gate in step 2.
- `--list` is read-only — it must not create a change or change any task status.
- Faithful seeding only: `proposal.md` must reflect the task text; do not invent scope.
- The task is flipped to in-progress exactly once, by the workflow (not by hand).
