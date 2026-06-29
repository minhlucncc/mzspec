# Templates — optional, skill-like project guides

A **template** is a small, skill-like guide that holds **project-specific** knowledge the generic
core defers to. Two flavors, same `<name>/TEMPLATE.md` shape:

- **Planning playbooks** — *how to break a recurring kind of change into tasks* for this project.
  Consulted during the planning/tasking phase. Optional — if none matches (the common case),
  planning proceeds normally.
- **Convention guides** — *this project's standards* that the engineering-practice skills reference
  instead of restating. The headline example is **`tdd`**: your test commands, test-file patterns,
  fixtures, and the invariants tests must respect. The generic `test-driven-development` skill says
  *"see your project's `tdd` template"* and reads its specifics from here + `mzspec.config.json`.
  This is how mzspec keeps the shipped skills generic while each project carries its own conventions.

Templates are the front-of-pipeline complement to **gates**: gates answer *"given a diff, what must
pass?"* ([gate-plugin.md](gate-plugin.md)); templates answer *"how does THIS project plan and
practice this kind of work?"*.

## A template works like a skill

```
openspec/templates/                  # templatesDir (default); set in mzspec.config.json
  <name>/
    TEMPLATE.md
```

```markdown
---
name: requirements
description: Distil an RFQ + attachments into a requirements task breakdown
---

# Planning requirements tasks

- One task per coherent section group; together cover the project's requirements standard.
- Landscape-aware: if the deal has secondary languages, leave translation to its own flow.
- Each task carries a single deliverable, its depends_on, and an acceptance line whose
  check is one of the gates the resolver emits for the touched paths.
- YAGNI: no task for absent scope.
```

Only `name` + `description` are required; the body is free-form planning guidance and
should **reference** the project's existing standards rather than restate them.

## How templates are used (the planning rule)

During planning (e.g. `/opsx:spec`, or right after `/opsx:propose` / `/opsx:propose-gh`):

1. **List** — `node .claude/workflows/lib/templates.js list --json`.
2. **Match** the change against the template `description`s.
   - exactly one clearly matches → follow its guide when writing `tasks.md`;
   - several plausibly match → ask which (or none);
   - **none match → plan normally, no template** (the usual case).
3. A template is guidance, never a hard gate — deviate when the change genuinely differs.

There is nothing to register: dropping a `<name>/TEMPLATE.md` under `templatesDir` is
enough. The only config knob is the optional `templatesDir` path.

## Composite playbooks: chaining

Keep per-step playbooks thin and **compose them** with a chain template — no duplication,
and **no resolver or CLI**: a chain is just a template whose body tells the AI to author
the tasks across its member templates. The agent reads the chain, then each member's
guide, and lays down a task group per member.

- A **full** chain (e.g. `presale`) lists every step in order — the AI authors tasks for
  all members.
- A **selective** chain (e.g. `change-request`) tells the AI to include only the members
  a change touches (for presale, the project's `impact.js` gives affected + cascade), in
  dependency order, skipping steps the change doesn't affect.

```markdown
---
name: presale
description: Full deal pipeline — author tasks by chaining every step
---
# Presale pipeline
Author tasks.md by chaining, in order: enrich → requirements → prd → estimation →
proposal → translate (honor each step's stated dependencies).
```

This is the presale shape exactly: thin `enrich` / `requirements` / `prd` / `estimation`
/ `proposal` / `translate` playbooks, a `presale` chain over all of them, and a
`change-request` chain that re-runs only what a change touches — all expressed as markdown
the AI follows.

## Manage them with the `template-*` commands

| Command | Does |
|---|---|
| `/opsx:template-list` | list the catalog (read-only) |
| `/opsx:template-create` | author a new template from `--prompt` or `--from-change <c>` |
| `/opsx:template-update` | revise an existing template's guide / description |
| `/opsx:template-remove` | delete a template |

Each is gated (AskUserQuestion) before it writes, and drives the `template` workflow,
which calls the deterministic CLI:

```
node .claude/workflows/lib/templates.js list  [--json] [--dir <d>]
node .claude/workflows/lib/templates.js show  <name> [--json]
node .claude/workflows/lib/templates.js path  <name>
printf '%s' "<body>" | node .../templates.js create <name> --description "<d>" [--force]
node .claude/workflows/lib/templates.js remove <name>
```

## Configure (`mzspec.config.json`)

```jsonc
"templatesDir": "openspec/templates"   // optional; this is the default
```

## Install

Templates are included with the **agent-skills** extension:

```bash
bash scripts/mzspec install agent-skills
```

This installs the starter playbooks into `openspec/templates/`. To create your own:
`/opsx:template-create`. Full contract: [`extensions/templates/CONTRACT.md`](../extensions/templates/CONTRACT.md).
