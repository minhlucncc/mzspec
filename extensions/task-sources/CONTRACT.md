# Task-source plugin contract

A **task source** is a backlog mzspec can pull work from and report status back to. mzspec ships the
*resolver* + the `/opsx:task-*` workflow; a task source is a Node adapter that normalizes some backend
(a folder, GitHub Issues, Mello, …) to a common shape. This is the sibling of the gate plugin contract.

## The normalized Task

Every adapter returns tasks in this shape (build them with `normalize.makeTask`):

```js
{ id, title, body, status, labels, assignee, url, source }
// status ∈ 'todo' | 'in-progress' | 'in-review' | 'done'
```

`body` is the requirement text — it seeds the change's `proposal.md` on pull.

## The adapter interface

A constructor `new Adapter(entry, { statusMap, cwd, bin })` and six async verbs:

```js
class TaskSource {
  async list({ status } = {})        // -> Task[]   (filter by status when given; stable order)
  async get(id)                      // -> Task
  async create({ title, body, labels }) // -> Task   (new backlog item; status 'todo')
  async setStatus(id, status)        // map normalized status -> backend representation
  async comment(id, text)            // append a comment (text may be multi-line)
  async setAssignee(id, login)       // assign the ticket (idempotent; login '' clears). '@me' allowed.
}
```

The **task-lifecycle** dispatcher (`lib/lifecycle.js`) drives `comment`/`setStatus`/`setAssignee`
through the configured adapter as a change moves through the pipeline, and records the resulting
PR/branch refs in the change's `.task-link.json`. PR ↔ ticket cross-links ride in the comment body
(GitHub's timeline auto-links a `#<pr>` mention); the `.task-link.json` is the queryable source of
truth. Projects-backed adapters set the assignee on the item's backing issue (cross-repo `--repo`).

- `entry` is the `taskSources[]` config entry `{ name, type, enabled, config }`.
- `statusMap` is `config.taskStatusMap` (per-adapter status mapping; adapters supply defaults).
- Remote adapters shell out to a CLI via `exec.run/runJson`; the binary is overridable (`opts.bin` or
  an env var) so tests can substitute a stub on `PATH`.
- Throw on "not found" / failure with a clear message; the workflow surfaces `reason`.

## Registering an adapter

1. Add `lib/task-sources/<type>.js` exporting the class, and register it in `lib/task-sources/index.js`
   `ADAPTERS`.
2. Add a `taskSources` entry in `mzspec.config.json`:

```jsonc
"taskSources": [
  { "name": "local",  "type": "local-folder", "enabled": true,  "config": { "path": ".tasks" } },
  { "name": "github", "type": "gh-issues",     "enabled": false, "config": { "repo": "owner/repo", "label": "backlog" } },
  { "name": "mello",  "type": "mello-cli",      "enabled": false, "config": { "board": "<id>", "column": "Todo" } }
]
```

The first `enabled` source is the default; `--source <name>` overrides per command.

## The CLI surface (what the workflow calls)

`node .claude/workflows/lib/task-sources/cli.js <list|next|get|set-status|set-assignee|comment> [...] [--source N]`
prints JSON. The `/opsx:task-*` commands drive this the same way `ship-code` drives `gate-resolver.js`.

## Built-in adapters

- **local-folder** — folder-per-task; status in `task.md` frontmatter; comments in `comments/`.
- **gh-issues** — GitHub Issues via `gh`; status via labels + open/closed (`taskStatusMap['gh-issues']`).
- **mello-cli** — Mello tickets via `mello`; status via board column (`taskStatusMap['mello-cli'].columns`).
