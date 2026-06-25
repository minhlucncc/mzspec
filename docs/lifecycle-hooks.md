# Lifecycle hooks — wiring a change to a backlog board

mzspec fires a **lifecycle event** at each stage of the spec→ship pipeline. A project can react to
those events to keep an external backlog (a GitHub Projects board, an issue tracker, Slack, …) in
sync — **without** a built-in adapter or `taskSources` config. The integration lives entirely in the
consumer repo as **hooks**.

## The events

From `lib/lifecycle.js`, in pipeline order:

| Event | Fired by | When |
|---|---|---|
| `before-spec` | `/opsx:spec` (`spec-change.js`) | spec authoring/review starts |
| `after-spec-pr-opened` | `/opsx:spec-pr` (`spec-pr.js`) | the spec PR is opened |
| `after-spec-pr-merged` | `/opsx:merge-pr` (`merge-pr.js`) | the spec PR is merged |
| `before-ship` | `/opsx:ship` (`ship-code.js`) | implementation starts |
| `after-code-pr-opened` | `/opsx:ship` (`ship-code.js`) | the code PR is opened |
| `after-code-pr-merged` | `/opsx:merge-pr` (`merge-pr.js`) | the code PR is merged |

> The `*-merged` events require merging via **`/opsx:merge-pr`**. Merging a PR with the GitHub
> button bypasses them.

## Two hook flavors

Both live under `<repo>/openspec/hooks/` and are best-effort — a hook failure never fails a ship.

1. **Shell hook** — executable `openspec/hooks/on-<event>` (any language; JSON context on stdin,
   optional JSON on stdout). Deterministic. Driven by `lib/lifecycle.js`, so it only runs when the
   change is linked via `.task-link.json` (the `taskSources` path). See `lib/run-hook.js`.
2. **Agent-form hook** — `openspec/hooks/on-<event>.agent.md` (natural-language instructions an
   agent executes with tools like `gh`, `git`, `node`). Run by the workflows themselves for **every**
   event. This is the flavor to use for board integrations that have no built-in adapter.

## Agent-form hooks (recommended for boards)

For each event the workflow checks `openspec/hooks/on-<event>.agent.md`; if present it reads the file
and **follows its instructions** with this context: the change name, the event, and the relevant refs
(`branch`, the spec/code PR URL, the merge SHA — whichever apply). The hook decides what to do.

The conventional **ticket reference** lives in the change's `proposal.md` **frontmatter**:

```markdown
---
ticket: https://github.com/<owner>/<repo>/issues/90
---
```

`/opsx:spec --ticket <url|#N>` records it idempotently (never overwrites). A hook reads it to find
the backlog item to update. If `ticket:` is absent, a well-written hook should log "no ticket — skip"
and no-op.

### Example: GitHub Projects board

`openspec/hooks/on-after-spec-pr-opened.agent.md`:

```markdown
Post a backlog update to GitHub Projects board #6 (org `mezonai`).
1. Read `openspec/changes/<change>/proposal.md` frontmatter `ticket:`. If absent, log and stop.
2. Resolve the board item for that backing issue:
   `gh project item-list 6 --owner mezonai --format json` (match `content.number`).
3. Comment on the backing issue: `gh issue comment <n> --repo <owner/repo> --body "📋 Spec PR opened: <specPr url>"`.
4. Move the card's Status column to "In Review" via `gh project item-edit`
   (resolve ids with `gh project field-list 6 --owner mezonai --format json`).
Best-effort: report what you did; never fail the workflow.
```

Notes:
- `gh project …` uses `--format json` (not `--json`); `item-edit` needs the project id + field id +
  option id.
- Comments and assignees ride on the item's **backing issue** (Projects v2 items have no comment
  stream); the card surfaces that activity.
