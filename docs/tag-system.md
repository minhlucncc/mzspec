# Tag-Driven Skill Routing

mzspec uses a **deterministic tag system** to load only the skills and hooks relevant to each unit of work — no conditional text, no "if this unit touches UI" logic in prompts.

## How it works

Every task and work-unit carries **tags** (e.g., `ui`, `backend`, `api`, `db`). Every skill and hook **declares which tags it applies to** in its YAML frontmatter. The tag resolver matches them at runtime — only relevant guidance reaches the agent.

```
Task/Unit (tags: [ui, auth])
         │
         ▼
   Tag Resolver ──→ Matches against:
         │              ├── SKILL.md frontmatter (tags field)
         │              └── Hook .prompt.md frontmatter (tags field)
         │
         ▼
   Only matching skills + hooks loaded
   └─ "ui" tag → ui-design skill loaded
   └─ "auth" tag → security-and-hardening skill loaded
   └─ No "backend" tag → backend skills skipped
```

## Tag taxonomy

| Tag | When to use | Skills it activates |
|-----|-------------|-------------------|
| `ui` | Components, screens, forms, any user-facing surface | `ui-design`, `ux-pattern-audit` |
| `frontend` | Frontend code (JS/TS/CSS) | `ui-design` |
| `backend` | Server logic, APIs, services | — (universal skills apply) |
| `api` | API endpoints, contracts | — |
| `db` | Schemas, queries, migrations | — |
| `auth` | Authentication, authorization | `security-and-hardening` |
| `security` | Security hardening, vulnerability fixes | `security-and-hardening` |
| `docs` | Documentation, ADRs | `documentation-and-adrs` |
| `infra` | CI/CD, git, deployment | `git-workflow-and-versioning`, `ci-cd-and-automation` |
| `test` | Test infrastructure | `test-driven-development` |
| `migration` | Data/schema migrations | — |
| `cli` | CLI tools, scripts | — |
| `design` | UX design artifacts | `ux-pattern-audit` |

**Universal skills** (no tags, always loaded): `spec-driven-development`, `spec-review-and-quality`, `planning-and-task-breakdown`, `code-review-and-quality`, `code-simplification`, `incremental-implementation`, `debugging-and-error-recovery`, `orchestrator`.

## How tags get on tasks

In `tasks.md`, annotate tasks with `(tags: ...)`:

```markdown
## Task [1]: Login form UI  (tags: ui, auth)
## Task [2]: Token validation API  (tags: backend, api, security)
## Task [3]: User table migration  (tags: db, migration)
```

Tags can also be **inferred automatically** from file paths via `mzspec.config.json`:

```json
{
  "tags": {
    "categories": {
      "ui": { "paths": ["apps/portal/", "apps/web/"] },
      "backend": { "paths": ["packages/", "apps/api/"] },
      "db": { "paths": ["migrations/", "prisma/"] }
    }
  }
}
```

## How tags flow through the pipeline

```
1. PROPOSE → tasks.md created with (tags: ui, auth) annotations
                    │
2. SHIP-PLAN → plan.json units inherit tags from covered tasks
               unit.tags = union of covered tasks' tags
                    │
3. SHIP-CODE → for EACH unit:
               - Read unit tags: ["ui", "auth"]
               - Resolve matching skills → ui-design, security-and-hardening
               - Resolve matching hooks → only those with matching tags
               - Inject ONLY those skills + hooks into the agent
               - Backend units never see UI guidance
```

## Matching rules

| Condition | Behavior |
|-----------|----------|
| Skill/hook has **no `tags` field** | **Universal** — always loaded |
| Skill/hook has `tags: [ui]` | Only loaded when the unit has `ui` tag |
| Unit has `tags: [ui, backend]` | Skills/hooks for BOTH `ui` AND `backend` are loaded |
| Unit has no tags | Only universal skills/hooks are loaded |
| File path matches tag→path mapping | Tag auto-inferred (even without explicit task annotation) |

## Adding custom tags per project

1. Define tag→path mappings in `mzspec.config.json` → `tags.categories`
2. Create a `SKILL.md` with `tags: [your-custom-tag]` in your project's `.claude/skills/`
3. Tag tasks with `(tags: your-custom-tag)` in `tasks.md`

The tag resolver discovers all SKILL.md files in `.claude/skills/`, `openspec/skills/`, and extension skill directories — no registration needed.

## What this replaces

| Before | After |
|--------|-------|
| "If this unit touches UI:" conditional text in hooks | `tags: [ui]` on hooks — pure tag matching |
| All hooks injected for every unit | Only tags-matching hooks injected per unit |
| Hardcoded skill references in prompts | Skills declare their tags — resolver matches |
| Edit hook files to add new task types | Add new tag + `SKILL.md` frontmatter |
