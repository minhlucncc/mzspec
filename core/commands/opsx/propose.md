---
name: "OPSX: Propose"
description: Scaffold a new OpenSpec change from a free-text prompt — compute the next cNNNN-<slug>, create the change, and seed proposal.md. The github-agnostic front door to the pipeline.
category: Workflow
tags: [workflow, openspec, propose, scaffold]
---

Start a new change from a description of what to build. `/opsx:propose`
**only scaffolds** — it computes the next `cNNNN-<slug>`, runs `openspec new change`,
and drafts `proposal.md` grounded in your prompt. It does not review, validate, or
touch any task source; that separation is deliberate. Flow: `/opsx:propose <what>` →
`/opsx:spec` → `/opsx:spec-pr` → `/opsx:ship-*`.

**The prompt can be either**:
- **Inline text** — a free-text description of the change (e.g. `/opsx:propose add login`)
- **A file pointer** — "read the task from `<path>`" where the adapter has written
  the task content to a local file (e.g. `.github/issues/90/task.md`). The agent
  reads the file and scaffolds from it. This is how source adapters hand off:
  they fetch from an external backlog, write a local `TASK.md`, and tell propose
  to read it.

> To start from a GitHub issue and link the two (issue ↔ change, lifecycle sync),
> install the **task-github** extension and use `/opsx:propose-gh <issue>` instead.
> It writes the issue to `.github/issues/<n>/task.md`, delegates to propose with
> a "read the file" prompt, then links the change to the issue.

**Input**: `<what>` (required) — the description or file pointer. Optionally
`--slug <kebab>` to pin the slug.

**Steps**

1. **Confirm scope.** Restate the change in one line and the `cNNNN-<slug>` it will create.
   If the request is broad enough to be several changes, say so and suggest splitting.
2. **Launch the Workflow** (date from context):
   ```
   Workflow({ name: 'propose', args: { prompt: '<what>', slug: '<slug|undefined>', date: '<YYYY-MM-DD>' } })
   ```
   Phase: **Scaffold** (compute the next ordinal → `openspec new change` → seed `proposal.md`
   from the prompt following the `openspec-propose` skill).
3. **Relay the result.** Report the created `change`, the `proposalPath`, and the next step
   (`/opsx:spec <change>`). On failure surface `stage` + `reason`.

**Guardrails**
- Faithful seeding only: `proposal.md` must reflect the prompt; do not invent scope.
- Do not review or validate here — that is `/opsx:spec`'s job.
- One change per concern — prefer splitting an over-broad request over packing it.
