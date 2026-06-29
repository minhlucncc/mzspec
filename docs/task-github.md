# task-github — GitHub-backed tasking for the pipeline

> The **task-github** extension (`extensions/task-github/`) makes a GitHub issue the backlog
> item behind an OpenSpec change and keeps it in sync as the change moves spec → ship → merge.
> It is the reference implementation of the **adapter pattern** documented in
> [adapter-contract.md](adapter-contract.md): it converts a GitHub issue into a local
> `TASK.md` file and delegates scaffolding to the core `/opsx:propose`, which knows
> nothing about GitHub.
> For skill-injection hooks see [hooks.md](hooks.md); for the lifecycle event contract see
> [lifecycle-hooks.md](lifecycle-hooks.md).

GitHub is the single task API. Install the extension and the pipeline is integrated — no
`mzspec.config.json` `taskSources`, no adapter registry. The repo is inferred from your
`origin` remote; everything runs through the `gh` CLI.

```bash
./mzspec install task-github     # requires the core install + an authenticated gh CLI
```

## Commands

| Command | What it does |
|---|---|
| `/opsx:propose-gh <issue>` | Start a change FROM a GitHub issue: fetch the issue, write `.github/issues/<n>/task.md` (the local TASK.md handoff), delegate to `/opsx:propose` via "read TASK.md", write `github.json`, copy TASK.md into the change dir, flip the issue to **in-progress**, and comment "spec started". |
| `/opsx:task-log --text "<body>"` | Comment on the issue linked to the current/selected change. |
| `/opsx:task-assign [<login>]` | Assign the linked issue (defaults to **@me**; empty `<login>` clears assignees). |

The github-agnostic **`/opsx:propose <what>`** (core) scaffolds a change with **no** GitHub
coupling — use it when you don't want a linked issue. `propose-gh` is the GitHub-linked variant.

Flow: `/opsx:propose-gh <issue>` → `/opsx:spec` → `/opsx:spec-pr` → `/opsx:ship-*` →
`/opsx:merge-pr`.

## The SSOT: `openspec/changes/<change>/github.json`

A single per-change JSON file ties the change to its issue and accumulates the PR/branch refs
as the pipeline runs. It is written by `/opsx:propose-gh` and updated by the lifecycle events.

```json
{
  "v": 1,
  "change": "c0007-add-login",
  "issue":  { "number": 90, "url": "https://github.com/o/r/issues/90", "title": "Add login" },
  "status": "in-review",
  "assignee": "alice",
  "branch": "feat/c0007-add-login",
  "specPr": { "url": "https://github.com/o/r/pull/91", "number": 91, "mergedSha": "abc1234" },
  "codePr": { "url": "", "number": 0, "mergedSha": "" },
  "changelogRef": "",
  "archivePath": "",
  "history": [ { "at": "2026-06-29", "event": "after-spec-pr-opened", "status": "in-review" } ]
}
```

`status` vocabulary: `todo | in-progress | in-review | done`. Status is mapped to GitHub via
labels (`in-progress` / `in-review`) and issue state (`done` → closed).

## How the sync happens

The core workflows already fire a **lifecycle event** at each milestone
(`node .claude/workflows/lib/lifecycle.js <event> --change <c> …`). Installing task-github vendors
`lifecycle.js` to exactly that path, so the event:

1. reads `github.json` (no link → no-op),
2. **comments** the issue, advances **status**, and **assigns @me** at code-PR time,
3. records the spec/code PR + branch + changelog + archive refs back into `github.json`,
4. then runs an executable `openspec/hooks/on-<event>` if present (the project-extension seam).

Every step is best-effort — a GitHub or hook failure never fails the ship.

| Event | When | Issue effect |
|---|---|---|
| `before-spec` | spec authoring starts | comment "spec started" |
| `after-spec-pr-opened` | spec PR opened | comment + status → in-review + record specPr |
| `after-spec-pr-merged` | spec PR merged | comment + record merge SHA |
| `before-ship` | implementation starts | comment + record branch |
| `after-code-pr-opened` | code PR opened | comment + status → in-review + assign @me + record codePr |
| `after-code-pr-merged` | code PR merged | comment + status → done + record archive |

> The `*-merged` events require merging via **`/opsx:merge-pr`** — merging with the GitHub button
> bypasses them.

## The `gh` CLI surface

`github.js` is also a small CLI the workflows drive (and you can too):

```bash
node .claude/workflows/lib/github.js get <id> [--json]
node .claude/workflows/lib/github.js list [--status S] [--label L] [--json]
printf '%s' "<body>" | node .claude/workflows/lib/github.js comment <id>
node .claude/workflows/lib/github.js set-status <id> <todo|in-progress|in-review|done>
node .claude/workflows/lib/github.js set-assignee <id> <login|@me>
```

