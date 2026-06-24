# Task sources — pull the backlog into the spec pipeline

mzspec can pull "the next task to do" from a backlog, turn it into an OpenSpec change, and report
status back as the change ships. The backlog is pluggable: a local folder, GitHub Issues, or Mello.

## The three commands

| Command | Does |
|---|---|
| `/opsx:task-pull` | pull the top open task (or `--id`; `--list` to preview) → create `cNNNN-<slug>` → seed `proposal.md` from the task → mark the task **in-progress** → write the task↔change link |
| `/opsx:task-push` | sync the linked change's status back to the task (proposal→`in-progress`, open PR→`in-review`, archived→`done`, or `--status`) |
| `/opsx:task-log` | add a comment to the linked task (`--text "..."`) |

Flow: `/opsx:task-pull` → `/opsx:spec` → `/opsx:spec-pr` → `/opsx:ship-plan` → `/opsx:ship-code`, with
`/opsx:task-push` / `/opsx:task-log` reporting back at lifecycle moments.

## Configure (`mzspec.config.json`)

```jsonc
"taskSources": [
  { "name": "local",  "type": "local-folder", "enabled": true,  "config": { "path": ".tasks" } },
  { "name": "github", "type": "gh-issues",     "enabled": false, "config": { "repo": "owner/repo", "label": "backlog" } },
  { "name": "mello",  "type": "mello-cli",      "enabled": false, "config": { "board": "<id>", "column": "Todo" } }
],
"taskStatusMap": {
  "gh-issues": { "in-progress": ["+in-progress","-in-review"], "in-review": ["+in-review","-in-progress"], "done": ["state:closed"] },
  "mello-cli": { "columns": { "todo": "Todo", "in-progress": "In Progress", "in-review": "In Review", "done": "Done" } }
}
```

The first `enabled` source is the default; override per command with `--source <name>`.

## Folder-per-task (the local source)

Each task is a **folder** (like an `openspec/changes/<c>/` folder), authored and committed in-repo:

```
.tasks/                          # or .github/projects/<proj>/tasks/  (set config.path)
  T-001-add-login/
    task.md         # frontmatter: id, title, status, labels, assignee  +  requirement body
    comments/       # NNN-mzspec.md, appended by task-log / status changes
    .link.json      # written on pull: { change, status, history }
```

`task.md`:
```markdown
---
id: T-001-add-login
title: Add login
status: todo
labels: [auth, p1]
---
As a user I want to log in so that I can access my workspace.
```

`task-pull` reads `task.md`'s body to seed the change proposal, flips `status` to `in-progress`, and
writes `.link.json`. `task-push`/`task-log` update the frontmatter / append a comment file.

## GitHub Issues / Mello

- **gh-issues** uses the `gh` CLI (must be authed: `gh auth status`). Status maps to labels +
  open/closed; the issue `body` seeds the proposal. Set `config.label` to scope the backlog.
- **mello-cli** uses the `mello` CLI (`mello auth login`); status maps to a board column.

Both are remote — no local files are written except the change-side `.task-link.json`.

## The task↔change link

- `openspec/changes/<change>/.task-link.json` → `{ source, type, taskId, taskTitle, status, history }`
  (lets `task-push`/`task-log` find the task from the change).
- `.tasks/<task>/.link.json` (local source only) → `{ change, status, history }` (reverse link).

## Add your own source (e.g. Jira)

Drop `lib/task-sources/jira.js` implementing the four verbs, register it in
`lib/task-sources/index.js` `ADAPTERS`, and add a `taskSources` entry. See
[`extensions/task-sources/CONTRACT.md`](../extensions/task-sources/CONTRACT.md).

## Status write-back (v1)

`task-pull` auto-marks the task **in-progress**; other transitions are explicit `task-push`/`task-log`.
Wiring `task-push` automatically into `ship-code` (PR opened → `in-review`) and archive (→ `done`) is a
documented follow-up — v1 keeps the core ship workflows untouched.
