# Openspec Propose

Creates a new OpenSpec change with the standard artifact structure. Run:

```
node .claude/workflows/lib/openspec.js new change "<name>"
```

This scaffolds `openspec/changes/<name>/` with `proposal.md`, `design.md`, `tasks.md`, and `specs/`.

Then draft:
- **proposal.md** — what, why, scope, assumptions
- **Delta specs** under `specs/<capability>/spec.md` using `ADDED/MODIFIED/REMOVED/RENAMED`
- **design.md** — architectural decisions and rationale
- **ui.md** — UI/visual design (optional; create only for changes with a user-facing surface)
- **tasks.md** — ordered, verifiable implementation tasks

Name convention: `cNNNN-<kebab-slug>` starting from the next available number.

## Detecting when to create ui.md

If the change has a visible user-facing surface — new screens, component changes,
UX improvements, or UI-adjacent work — create `ui.md` following the `ui-design`
skill (`openspec/changes/<name>/ui.md`). Check the prompt for keywords like
"UI", "page", "screen", "component", "form", "frontend", "portal", "dialog",
"modal", "layout", "navigation", "theme", "responsive", or "mobile" to determine
if UI design is needed.

If the change is purely backend, infrastructure, or spec-only with no UI surface,
skip `ui.md`. State "no UI surface — ui.md not created" in the propose output.
