# Task sources — pull the backlog into the spec pipeline

mzspec can pull "the next task to do" from a backlog, turn it into an OpenSpec change, and report
status back as the change ships. The backlog is pluggable: a local folder, GitHub Issues, or Mello.

## The commands (create · list · pull · push · log)

| Command | Does |
|---|---|
| `/opsx:task-create` | author a new task from `--prompt`, `--from-change <c>` (its spec), or `--from-diff` (working code) — into the local backlog (or `--source <remote>`), optionally `--push <remote>` |
| `/opsx:task-list` | list the backlog (`--source`, `--status`, `--all`). Read-only |
| `/opsx:task-pull` | pull the top open task (or `--id`; `--list` to preview) → create `cNNNN-<slug>` → seed `proposal.md` → mark the task **in-progress** → write the task↔change link |
| `/opsx:task-push` | **upsert to remote**: create the remote item for an unlinked local task (+ `remoteRef`), or sync the linked change's status (proposal→`in-progress`, open PR→`in-review`, archived→`done`) |
| `/opsx:task-log` | add a comment to the linked task (`--text "..."`) |

### task → spec → ship

The task verbs are the **front of the pipeline**, with two entry flows:

```
inbound :  human prompt ─┐
           remote task  ─┴─▶ task-create / task-pull ─▶ /opsx:spec ─▶ /opsx:spec-pr ─▶ /opsx:ship-*
                                       │ (task → in-progress)            (push status back at each step)
outbound:  current spec/code ─▶ task-create --from-change|--from-diff ─▶ task-push <remote>  (→ backlog)
```

`task-push` / `task-log` report progress back to the source at lifecycle moments. The **remote
inventory is per-project**: each project's `taskSources` binds the real backend (a GitHub repo's
Issues, a Mello board); a task carries a `remoteRef` once linked, so the same normalized `Task`
abstraction maps to whatever inventory the project uses.

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

## The task↔change link (the lifecycle SSOT)

`openspec/changes/<change>/.task-link.json` is the single source of truth tying a ticket to
its change and every artifact the ship produces. v2 shape (backward-compatible with v1; old
files are migrated on next write by `lib/task-link.js`):

```jsonc
{ "v": 2, "source": "github", "type": "gh-issues", "taskId": "42", "taskTitle": "…",
  "status": "in-review", "assignee": "minhlucncc",
  "branch": "feat/c0007-…",
  "specPr": { "url": "…", "number": 128, "mergedSha": "" },
  "codePr": { "url": "…", "number": 131, "mergedSha": "" },
  "changelogRef": "…", "archivePath": "openspec/changes/archive/…",
  "history": [ { "at": "…", "event": "after-spec-pr-opened", "ref": "…" }, … ] }
```

- `.tasks/<task>/.link.json` (local source only) → `{ change, status, history }` (reverse link).

## Add your own source (e.g. Jira)

Drop `lib/task-sources/jira.js` implementing the four verbs, register it in
`lib/task-sources/index.js` `ADAPTERS`, and add a `taskSources` entry. See
[`extensions/tasks/task-sources/CONTRACT.md`](../extensions/tasks/task-sources/CONTRACT.md).

## Automatic lifecycle wiring

As a linked change moves through the pipeline, the ship workflows fire **lifecycle events**
(`lib/lifecycle.js`, invoked the same way they invoke `gate-resolver.js`) that comment the
ticket, advance its status, **assign it at ship time**, and record the spec/code-PR + branch +
CHANGELOG + archive refs into `.task-link.json`. All best-effort — never fails the ship; no-ops
when the change isn't linked to a ticket.

| Event | Fires from | Ticket effect |
|---|---|---|
| `before-spec`          | `/opsx:spec`     | comment "spec started" |
| `after-spec-pr-opened` | `/opsx:spec-pr`  | comment + `specPr`; status → `in-review` |
| `after-spec-pr-merged` | `/opsx:merge-pr` (spec branch) | comment + `specPr.mergedSha` |
| `before-ship`          | `/opsx:ship`     | comment "implementation starting"; `branch` |
| `after-code-pr-opened` | `/opsx:ship`     | comment + `codePr`; **assign `@me`** (if unassigned); status → `in-review` |
| `after-code-pr-merged` | `/opsx:merge-pr` (feat branch) | comment + traceability; status → `done`; archive |

Adapters gained a `setAssignee(id, login)` verb for this (see
[`extensions/tasks/task-sources/CONTRACT.md`](../extensions/tasks/task-sources/CONTRACT.md)). Customize or
extend any event with an executable `openspec/hooks/on-<event>` (see
[`docs/hooks.md`](../docs/hooks.md)).
