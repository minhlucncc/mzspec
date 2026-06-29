# Adapter contract: propose + task-source integration

The pipeline separates **scaffolding** (the core `propose` workflow) from **task-source
integration** (adapters that bridge external backlogs). An adapter fetches from a source
(GitHub Issues, GitHub Projects, Jira, Linear, …), writes the task content to a local
`TASK.md` file, and hands off to `propose` — which does not know or care where the text
came from.

```
  ┌──────────────┐     ┌──────────────────┐
  │   Adapter    │     │  propose (core)  │
  │  (source-    │────►│                  │
  │   specific)  │     │  "read TASK.md   │
  │              │     │   and scaffold"  │
  │  1. fetch    │     │                  │
  │  2. write    │     │  cNNNN-slug      │
  │     TASK.md  │     │  proposal.md     │
  │  3. call     │     │  (from TASK.md)  │
  │     propose  │     │                  │
  └──────────────┘     └──────────────────┘
```

## 1. The propose interface (stable core)

**Workflow name**: `propose`  
**Defined in**: `core/workflows/propose.js`  
**Called via**: `await workflow('propose', args)` from another workflow, or
`Workflow({ name: 'propose', args })` from a command file.

| Arg | Required | Description |
|-----|----------|-------------|
| `prompt` | yes | What to build — a free-text instruction OR a "read TASK.md" meta-instruction that tells the agent where to find the task content. |
| `title` | no | Human-readable title (e.g. the issue title). Used when the prompt is a meta-instruction; otherwise same as prompt. |
| `slug` | no | Explicit kebab-slug override (≤ 48 chars). Auto-derived from title if omitted. |
| `date` | no | ISO date string `YYYY-MM-DD` (passed in because `Date.now()` is unavailable in workflow scripts). |

**Returns**:
```json
{ "stage": "done", "ok": true,
  "change": "c0007-add-login",
  "proposalPath": "openspec/changes/c0007-add-login/proposal.md",
  "nextStep": "..." }
```

**What propose does**:
1. Compute the next `cNNNN-<slug>` ordinal from existing changes.
2. Run `openspec.js new change "cNNNN-<slug>"` to scaffold the directory.
3. Seed `proposal.md` (## What / ## Why) grounded in the task content the prompt
   points to — whether the prompt IS the content or says "read this file".
4. Return the change name and proposal path.

**Guarantees**:
- Zero knowledge of GitHub, Jira, or any external source.
- No lifecycle events, no SSOT files, no status flips.
- Faithful seeding only — never invents scope.
- Does NOT review or validate — that is `/opsx:spec`'s job.

## 2. The adapter pattern (three phases)

Every task-source adapter follows the same shape:

```
Phase 1: Resolve   — fetch the task from the external source
Phase 2: Scaffold  — write TASK.md → delegate to propose
Phase 3: Link      — write source-specific SSOT + fire lifecycle
```

### Phase 1 — Resolve

Fetch the external task and extract at minimum: an **identifier**, a **title**, and the
**body/description**. For GitHub Issues that means `github.js get <n>`; for a local file
it is a filesystem read. Return structured data the workflow can reference.

### Phase 2 — Scaffold (the handoff)

1. **Write TASK.md** — write the fetched task to a **source-specific local path** so
   the content persists and is traceable. The path follows this convention:

   ```
   .github/<source>/<id>/task.md
   ```

   Examples:
   - GitHub Issue #90 → `.github/issues/90/task.md`
   - GitHub Project task → `.github/projects/<project-id>/tasks/<task-id>/task.md`

   The TASK.md file is plain markdown — title as `# <title>`, body as-is, metadata
   (URL, source ID) in a `---` block or footer.

2. **Delegate to propose** — call `await workflow('propose', ...)` with a prompt
   that tells the agent where to read the task from:

   ```js
   const result = await workflow('propose', {
     prompt: `Read the task from .github/issues/90/task.md and scaffold the change from it. Base the proposal on what you read.`,
     title: 'Actual issue title',
     date: '2026-06-29',
   })
   ```

   The propose agent is instructed to seed `proposal.md` grounded in "the request" —
   when the request says "read this file", the agent reads the file and uses its
   content. **The file, not the prompt string, is the carrier of the task content.**

3. **Result** — propose returns `{ change, proposalPath }`. The adapter now knows
   where the change lives.

### Phase 3 — Link

1. **Write the source SSOT** — a JSON file mapping the change to its external task.
   For GitHub Issues this is `openspec/changes/<change>/github.json` (written by
   `github-link.js`). For other sources it would be a similarly-named file
   (`jira.json`, `linear.json`, …).

2. **Copy TASK.md into the change** — `openspec/changes/<change>/TASK.md` so the
   proposal context is co-located with the change for future reference.

3. **Set source status** — flip the external task to `in-progress`.

4. **Fire lifecycle event** — run `lifecycle.js before-spec --change <change>` to
   post a comment and record the event.

All GitHub operations in Phase 3 are **best-effort** — failures log but do not abort
the flow (the SSOT write and TASK.md copy are the only hard requirements).

## 3. Reference implementation: propose-gh

The canonical adapter lives at `extensions/task-github/Workflows/propose-gh.js` with its
command at `extensions/task-github/Commands/opsx/propose-gh.md`.

```
Phase 1: Resolve
   github.js get 90
   → { number: 90, title: "Add login", body: "…", url: "https://…" }

Phase 2: Scaffold
   a) Write .github/issues/90/task.md
   b) await workflow('propose', {
        prompt: "Read .github/issues/90/task.md and scaffold",
        title: "Add login",
        date: "2026-06-29",
      })
   c) ← { change: "c0007-add-login", proposalPath: "…" }

Phase 3: Link
   a) github-link.js link c0007-add-login --issue-number 90 --status in-progress
   b) cp .github/issues/90/task.md openspec/changes/c0007-add-login/TASK.md
   c) github.js set-status 90 in-progress
   d) lifecycle.js before-spec --change c0007-add-login
   e) rm .github/issues/90/task.md (staging file cleaned up; TASK.md in change dir lives on)
```

## 4. Adding a new source adapter

To add support for a new external task source (Jira, Linear, Asana, …):

### What to create

| File | Purpose |
|------|---------|
| `extensions/<source>/Commands/opsx/propose-<source>.md` | Command definition — the natural-language instructions for the agent that drives the workflow. |
| `extensions/<source>/Workflows/propose-<source>.js` | Workflow script implementing the three-phase pattern. |
| `extensions/<source>/lib/<source>.js` | Source API adapter (fetch, comment, set-status, set-assignee). |
| `extensions/<source>/lib/<source>-link.js` | SSOT file read/write (`openspec/changes/<change>/<source>.json`). |
| `extensions/<source>/lib/lifecycle.js` | (Optional) lifecycle event dispatcher that reads the SSOT and calls the source adapter. |

### The three phases (template)

```js
export const meta = {
  name: 'propose-<source>',
  description: 'Start a change from a <source> task — scaffolds the change, seeds proposal.md from the task body, links the two, and marks the task in-progress.',
  phases: [
    { title: 'Resolve', detail: 'fetch the task from <source>' },
    { title: 'Scaffold', detail: 'write TASK.md → delegate to core propose workflow' },
    { title: 'Link', detail: 'write <source>.json, flip status, fire before-spec' },
  ],
}

// Phase 1 — Resolve
phase('Resolve')
// ... fetch from your source, return { id, title, body, url }

// Phase 2 — Scaffold
phase('Scaffold')
// a) Write TASK.md
//    Task file path: .github/<source>/<id>/task.md
// b) Delegate to propose
const scaffolded = await workflow('propose', {
  prompt: `Read the task from .github/<source>/<id>/task.md and scaffold the change from it.`,
  title: resolved.title,
  date,
})

// Phase 3 — Link
phase('Link')
// a) Write SSOT (<source>.json in the change directory)
// b) Copy TASK.md into the change directory
// c) Set source status to in-progress (best-effort)
// d) Fire lifecycle if applicable (best-effort)
```

### The SSOT convention

Each source writes a JSON file at `openspec/changes/<change>/<source>.json` carrying:

```json
{
  "v": 1,
  "change": "c0007-add-login",
  "issue": { "number": 90, "url": "https://...", "title": "..." },
  "status": "todo | in-progress | in-review | done",
  "assignee": "",
  "branch": "",
  "history": []
}
```

The lifecycle hook for that source reads this SSOT to know which external task to
comment on and what status to set.

### Lifecycle integration

When the core workflows fire a lifecycle event (`node .claude/workflows/lib/lifecycle.js
<event> --change <c>`), the `lifecycle.js` CLI reads ALL `<source>.json` files in the
change directory. For each one it finds, it:

1. Posts a milestone comment on the external task.
2. Advances the external status (`in-progress` → `in-review` → `done`).
3. Records cross-references (PR URLs, branch names) back into the SSOT.

This means **multiple sources can be linked to one change** — e.g. a GitHub issue AND
a Jira ticket — and lifecycle keeps both in sync.

## 5. Summary

| Layer | Responsibility | Examples |
|-------|---------------|----------|
| **Core propose** | Scaffold cNNNN-slug, seed proposal.md from a prompt. | `propose.js` |
| **Adapters** | Resolve a source, write TASK.md, call propose, link + lifecycle. | `propose-gh.js` |
| **Source libs** | Fetch/comment/status API for one external system. | `github.js` |
| **SSOT libs** | Read/write `<source>.json` in the change directory. | `github-link.js` |
| **Lifecycle** | Dispatch events to all linked sources. | `lifecycle.js` |

The contract is minimal: an adapter fetches → writes a local TASK.md → calls
`workflow('propose', { prompt: "read TASK.md" })` → links. Propose never imports a
source library, never writes a SSOT, never calls an external API.
