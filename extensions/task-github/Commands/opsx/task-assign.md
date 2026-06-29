---
name: "OPSX: Task Assign"
description: Assign the GitHub issue linked to the current/selected OpenSpec change (defaults to @me)
category: Workflow
tags: [workflow, tasks, github, assign, automation]
---

Assign the GitHub issue linked to an OpenSpec change. Defaults to **@me** (the
authenticated user) — "take this task". The issue is resolved from the change's
`github.json` (written by `/opsx:propose-gh`).

Requires the `gh` CLI authenticated and a GitHub `origin` remote.

**Input**: all optional — `[<login>]` (a GitHub username; defaults to `@me`; pass an
empty string to clear all assignees), `--change <name>` (defaults to the current
`feat/<change>` branch's change).

**Steps**

1. **Resolve the issue number.** From `--change` or the current branch's change:
   `node .claude/workflows/lib/github-link.js read <change> --json` → take `.issue.number`.
   If there's no linked issue, report that and stop (use `/opsx:propose-gh` to link one).
2. **Assign**:
   ```
   node .claude/workflows/lib/github.js set-assignee <issueNumber> <login|@me>
   ```
3. **Relay the result.** Report who the issue was assigned to. On failure surface the error.

**Guardrails**
- `@me` is the default; only assign someone else when a `<login>` is explicitly given.
- An empty `<login>` clears all assignees — confirm intent before doing so.
