---
name: "OPSX: Task Log"
description: Add a comment to the GitHub issue linked to the current/selected OpenSpec change
category: Workflow
tags: [workflow, tasks, github, comment, automation]
---

Post a comment to the GitHub issue linked to an OpenSpec change — e.g. "spec'd as
c0007-…", "PR opened at <url>", "merged". The issue is resolved from the change's
`github.json` (written by `/opsx:propose-gh`).

Requires the `gh` CLI authenticated and a GitHub `origin` remote.

**Input**: `--text "<body>"` (required — the comment), plus optional `--change <name>`
(defaults to the current `feat/<change>` branch's change).

**Steps**

1. **Resolve the issue number.** From `--change` or the current branch's change, read the
   linked issue: `node .claude/workflows/lib/github-link.js read <change> --json` → take
   `.issue.number`. If there's no `github.json` or no issue bound, report that and stop
   (this change isn't linked — use `/opsx:propose-gh` to link one).
2. **Post the comment** (body via stdin — safe for multi-line / special characters):
   ```
   printf '%s' "<body>" | node .claude/workflows/lib/github.js comment <issueNumber>
   ```
3. **Relay the result.** Report the issue number commented on. On failure surface the error.

**Guardrails**
- `--text` is required; never post an empty comment.
- The body is passed via stdin — do not interpolate it into the command string.
