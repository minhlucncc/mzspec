# Spec-Driven Development: The Missing Discipline

## What is SDD?

Spec-Driven Development (SDD) inverts the natural order of coding. Instead of writing code first and
documenting later (if at all), you **specify first** — what you're building, why, how it behaves, and
how you'll know it works — **then** plan, **then** implement. Code becomes the fulfillment of a
contract, not the first draft of an idea.

The shift is subtle but profound:

| Traditional approach | Spec-driven approach |
|---------------------|---------------------|
| "Let me build something and we'll see if it works" | "Let me write down what success looks like, then build to match" |
| Requirements live in chat history or Jira tickets | Requirements live in version-controlled spec artifacts |
| Testing is an afterthought | Tests are derived from the spec scenarios |
| "Done" means "it compiles" | "Done" means "all spec scenarios pass" |
| Knowledge evaporates when the session ends | Knowledge survives in `openspec/changes/` |

## The Spec Kit

A complete spec is more than a single document. It's a set of artifacts — the **spec kit** —
each answering a different question. The [GitHub SpecKit](https://github.com/github/specKit)
popularized this pattern: a lightweight, template-driven approach to spec-driven development
that any team can adopt without heavy process overhead.

mzspec's spec kit adapts GitHub's approach for the agent-driven pipeline:

| Artifact | Question it answers |
|----------|-------------------|
| **Proposal** (`proposal.md`) | What are we building and why? What's in scope? What's out? |
| **Design** (`design.md`) | How will we build it? Architecture decisions, risks, mitigations. |
| **UI/UX** (`ui.md`) | What does it look like? Wireframes, component tree, states, flows. |
| **Delta specs** (`specs/`) | What must the system do? Requirements in ADDED/MODIFIED/REMOVED form with scenarios. |
| **Tasks** (`tasks.md`) | What's the order of work? Ordered, verifiable implementation units. |

Each artifact is a **living document** — it evolves as understanding deepens, but changes are made
deliberately, not by accident.

## OpenSpec: The Artifact Model

[OpenSpec](https://github.com/Fission-AI/OpenSpec) provides the **artifact model** — the file format,
directory structure, and validation rules for these spec artifacts. It defines:

- The `openspec/` directory tree (`specs/`, `changes/`, `archive/`)
- The delta spec format (`# ADDED` / `# MODIFIED` / `# REMOVED` / `# RENAMED`)
- Validation rules (every requirement has a scenario, every delta references a canonical spec)
- Base commands (`init`, `validate`, `status`, `new change`, `archive`)

OpenSpec is **necessary but not sufficient** for a production SDD pipeline. It gives you the
*what* (artifact format) but not the *how* (delivery pipeline).

## Pros of SDD

- **Shared understanding** — a written spec is unambiguous in a way that conversation isn't. The
  proposal, design, and delta specs force precision.
- **Testable requirements** — every scenario in a delta spec is a test case. Red-Green-Refactor
  becomes natural: write the failing test from the spec, then implement.
- **Contract before code** — the spec PR merges before the code PR. The team agrees on *what* before
  debating *how*. This prevents the most expensive kind of rework.
- **Human-verifiable** — a spec review is 10 minutes of reading, not 2 hours of debugging. Catch
  logic errors, missing edge cases, and scope creep before a line of code is written.
- **Survives session boundaries** — AI context windows are finite. Spec artifacts persist across
  sessions, across agents, across teams. The knowledge doesn't evaporate when you close the terminal.

## Cons of SDD

- **Overhead for small changes** — a one-line bug fix doesn't need a full spec cycle. Knowing when
  to skip the ceremony is a skill. (mzspec's `ship-plan` handles this by collapsing small changes
  into a single unit.)
- **Requires discipline** — writing a good spec is harder than writing code for many developers.
  The benefit is deferred (you feel it during implementation and review), but the cost is immediate.
- **Spec drift risk** — the spec says X, the code does Y. Without enforcement, specs become shelfware.
  (This is what **gates** and the **reconcile step** in `ship-code` prevent — if the implementation
  drifts from the spec, the pipeline stops.)
- **Learning curve** — delta spec format, the two-PR workflow, the artifact structure. It's a new
  mental model for teams used to "just code."

## What's Missing from SDD Alone

OpenSpec gives you the artifacts. But a production SDD pipeline needs more:

| Missing piece | What it does | mzspec component |
|---------------|-------------|-----------------|
| **Gate engine** | Enforces quality automatically — lint, typecheck, test, benchmark every change | `lib/gate-resolver.js`, `lib/discover.js` |
| **Hook system** | Injects skill guidance at each pipeline phase; syncs with external systems | `extensions/agent-skills/Hooks/`, `hook-engine.js` |
| **Task classification** | Tags tasks by type (UI, backend, API, DB) so only relevant skills load | `lib/tag-resolver.js`, `core/skills/tag-system/` |
| **Handoff pacing** | Breaks a change into test-first work-units so the agent doesn't overbuild or go off-track | `core/workflows/ship-plan.js`, `.handoff/` |
| **Spec review** | 6-axis quality review (structure, clarity, testability, minimality, consistency, completeness + UX consistency) | `core/workflows/spec-change.js` |
| **Lifecycle sync** | Fires events at every milestone for board/ticket sync | `lifecycle.js`, `extensions/task-github/` |
| **Evidence collection** | Captures gate results, test output, coverage — an audit trail for every change | `ship-code` Evidence phase |
| **Multi-agent orchestration** | Coordinates ideation, implementation, and audit agents under human oversight | `extensions/orchestrator/` |

**In short:** OpenSpec defines the *language* of specs. mzspec builds the *factory* that turns specs
into shipped code with quality gates, human reviews, and an audit trail.

---

→ **Next:** [Architecture](../03-guides/01-architecture.md) explains how mzspec layers on top of OpenSpec.
→ Then: [The Claude Code workflow](02-claude-code-workflow.md) — why agent-driven pipelines change everything.
