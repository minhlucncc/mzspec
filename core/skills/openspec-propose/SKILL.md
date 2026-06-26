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
- **tasks.md** — ordered, verifiable implementation tasks

Name convention: `cNNNN-<kebab-slug>` starting from the next available number.
