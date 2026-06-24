---
name: "OPSX: Merge PR"
description: Team-lead PR merge workflow — preflight, update title/body, merge via GitHub API, close linked issues, post cross-reference comments
category: Workflow
tags: [workflow, automation, merge, pr, github, issues]
---

Merge workflow for team leads. Given an OpenSpec change slug or a PR URL, it:

1. **Preflights**: checks PR status (OPEN, not draft, no conflicts), detects linked issues,
   checks changelog entry
2. **Prepares** (optional): updates PR title/description, adds `Closes #N` keywords
3. **Merges**: via GitHub API (squash/merge/rebase), deletes the branch
4. **Closes linked issues**: auto-closes detected issues, posts cross-reference comment
5. **Reports**: merge SHA, closed issues, PR URL

**Input**: A change name (e.g. `/opsx:merge-pr c0005-llm-profiling-inspector`)
or a PR URL/number (e.g. `/opsx:merge-pr --pr 75`).

**Options**
- `--pr <url|number>` — merge a PR directly (no OpenSpec change needed)
- `--title "<text>"` — override the PR title before merge (optional)
- `--body "<text>"` — replace/append PR body before merge (optional)
- `--closes "#N"` — add `Closes #N` to PR body (optional, comma-separated for multiple)
- `--strategy squash|merge|rebase` — merge strategy (default: squash)
- `--skip-archive` — skip the auto-archive step for OpenSpec changes
- `--dry-run` — check PR status + show what would be done; no merge

**Examples**

```bash
# Merge an OpenSpec change — auto-merges PR, closes issues, archives the change
/opsx:merge-pr c0005-llm-profiling-inspector

# Merge with a custom title (squash commit name)
/opsx:merge-pr c0005-llm-profiling-inspector --title "feat(c0005): add LLM profiling pipeline"

# Merge a direct PR and close a specific issue
/opsx:merge-pr --pr 75 --closes "#74" --strategy squash

# Cross-repo PR
/opsx:merge-pr --pr 75 --repo mezonai/mezon-bot-ai --closes "#74"

# Skip archive (archive manually later)
/opsx:merge-pr c0005-llm-profiling-inspector --skip-archive

# Dry run — see what would happen first
/opsx:merge-pr c0005-llm-profiling-inspector --dry-run
```

**Guardrails**
- Never merges a **draft** PR — you must mark it ready first.
- Never merges a **conflicting** PR — resolve conflicts on GitHub first.
- All merge operations go through the **GitHub API** — no local merges.
- `--dry-run` validates the PR but does NOT merge or close anything.
- After merge, the remote branch is deleted via `--delete-branch`.
- For OpenSpec changes (when `change` slug is given), the workflow **auto-archives** the change:
  runs `openspec archive <change>` or falls back to `mv` + `git commit`, then pushes to `main`.
  Use `--skip-archive` to disable.
- The workflow does NOT create a CHANGELOG entry — add one before merging if missing.
