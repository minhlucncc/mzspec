# Templates — the contract

A **template** is an *optional*, skill-like guide that holds **project-specific** knowledge the
generic core defers to. Templates come in two flavors (same `<name>/TEMPLATE.md` shape):

- **Planning playbooks** — for a recurring *kind of change*: how to break it into tasks for THIS
  project's landscape (deliverables/sections, landscape-aware splits, which gates verify each task,
  what to skip). Consulted during the planning/tasking phase. *(e.g. `rag-feature`, `go-worker`,
  `migration`.)*
- **Convention guides** — the project's *standards* that the engineering-practice skills reference
  instead of restating: e.g. a `tdd` template holding this project's test commands, test-file
  patterns, fixtures, and DB/service setup; a `code-review` or `security` template holding the
  project's review checklist / invariants. The generic skills say *"see your project's `<name>`
  template"*; the template is where the specifics live.

Both are **optional**: most changes have no matching planning playbook, and a skill works without a
convention template (it falls back to `mzspec.config.json` + the repo's existing conventions).

Templates are the front-of-pipeline complement to gates. Gates answer *"given a diff, what must
pass?"* (`extensions/gates/CONTRACT.md`); templates answer *"how does THIS project plan and practice
this kind of work?"* — keeping the shipped skills/workflows generic and reusable.

## Shape (works like a skill)

```
<templatesDir>/                      # default: openspec/templates/  (set templatesDir in mzspec.config.json)
  <name>/
    TEMPLATE.md
```

`TEMPLATE.md` — frontmatter + a guide body (the "readme"):

```markdown
---
name: <kebab-name>
description: <one line — WHEN this template applies>
---

# <Title>

How to plan the tasks for this kind of change:
- which deliverables/sections each task must cover (reference the project's standards,
  don't restate them);
- landscape-aware splits (e.g. branch on config/profile, scope, languages, budget);
- which gate(s) verify each task;
- what to leave out (YAGNI).
```

Only `name` and `description` are required; the body is free-form planning guidance.

## How templates are used (the planning rule)

During the planning/tasking phase (e.g. `/opsx:spec`, or after `/opsx:task-pull`):

1. **List** the catalog — `node .claude/workflows/lib/templates.js list --json`.
2. **Match** the change against template `description`s.
   - If exactly one clearly matches → follow its guide when writing `tasks.md`.
   - If several plausibly match → ask the human which (or none).
   - **If none match (the common case) → plan normally, no template.**
3. A template is guidance, never a hard gate: a planner may deviate when the change
   genuinely differs, and should note why.

Templates are **discovered**, not registered — dropping a `<name>/TEMPLATE.md` under
`templatesDir` is enough; there is no list to maintain in `mzspec.config.json` (only the
optional `templatesDir` path override).

## Managing templates

Author / revise / remove them with the `template-*` commands (which call
`lib/templates.js`):

| Command | Does |
|---|---|
| `/opsx:template-list` | list the catalog (read-only) |
| `/opsx:template-create` | author a new template from `--prompt` or `--from-change` |
| `/opsx:template-update` | revise an existing template's guide / description |
| `/opsx:template-remove` | delete a template |

## CLI (deterministic surface)

```
node .claude/workflows/lib/templates.js list  [--json] [--dir <d>]
node .claude/workflows/lib/templates.js show  <name> [--json] [--dir <d>]
node .claude/workflows/lib/templates.js path  <name> [--dir <d>]
printf '%s' "<body>" | node .../templates.js create <name> --description "<d>" [--force]
node .claude/workflows/lib/templates.js remove <name> [--dir <d>]
```

`list`/`get`/`create`/`remove` are also exported for unit tests (with an explicit dir).
