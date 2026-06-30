# mzspec Docs

AI agents can write code faster than any human. But speed without process is just technical debt
at high velocity. Requirements drift between sessions. Quality depends on the luck of the prompt.
Context evaporates when you close the terminal.

**Spec-driven development** fixes that: write the contract before the code, gate every change,
review before merge. But traditional SDD was too heavy for solo devs and too slow for modern teams.

mzspec is the bridge. It makes spec-driven development **practical** — lightweight enough for a
vibe-coder hacking on a side project, rigorous enough for a platform team shipping to production.
One install, zero config, and your AI agent goes from "generate and pray" to "specify, gate, review,
ship" — with a human making the final call at every merge.

These docs will guide you from first install to advanced customization. Pick your path below.

---

## What We Believe

**Agent coding will keep getting better.** The trajectory is clear: today's agents are
impressive but unreliable — they need structure, gates, and human oversight. Tomorrow's agents
will be faster, more capable, and eventually autonomous. We're not there yet. But mzspec is
built for that future — the pipeline works with today's agents and will scale to tomorrow's.

**The developer role is shifting.** Writing code by hand is becoming a smaller part of the job.
The real value moves to defining intent, setting policy, reviewing outputs, and managing agents.
The best developers will be the ones who can think like product engineers — who know what
"good" looks like and can guide an agent to deliver it.

**Agent works. Human reviews.** Every output in the pipeline — spec, plan, code, evidence —
passes through a human gate. The agent drafts, implements, and tests. The human makes the
final call. This is not a limitation; it's the point. Autonomy without accountability is just
technical debt in fast motion.

**Human has taste. Agent has skill.** Humans know what "feels right" — good UX, clean
architecture, the right trade-off. Agents know how to execute — write code, run tests,
generate documentation. The pipeline is the interface between taste and skill.

---

## What We Are Solving

| Problem | What it looks like | How mzspec fixes it |
|---------|-------------------|-------------------|
| **Context evaporation** | Requirements live in chat history. Close the terminal, lose the context. | Specs are files in `openspec/`. They survive sessions, agents, and team handoffs. |
| **Quality variance** | Some generations are great, others are broken. Luck of the prompt. | Gates enforce deterministic quality checks — lint, typecheck, test, validate — on every change. |
| **No audit trail** | Who approved what? Why was that change made? No record. | Every phase leaves artifacts: REVIEW.md, evidence/, gate logs, signed commits. |
| **Agent drift** | Agent starts building X, ends up building Y. No one notices until review. | Handoff paces the work in test-first units. Drift hits a gate and stops. |
| **Integration debt** | The pipeline doesn't talk to your ticket system, board, or CI. | Lifecycle hooks fire at every milestone. Changes sync back to GitHub. |
| **Single-agent ceiling** | One agent fills the context window. Parallel work means parallel humans. | Orchestrator spawns ideation, implementation, and audit agents in parallel. |

---

## How We Are Solving It

| Approach | What it means |
|----------|---------------|
| **Spec-first, not code-first** | Write the contract, then implement. Spec PR merges before code PR starts. |
| **Gates as policy** | Quality checks are auto-discovered from your manifests — no config needed. |
| **Tags for classification** | Tasks tag themselves (`ui`, `backend`, `api`, `db`). Only relevant skills load per unit. |
| **Handoff pacing** | Changes break into a few test-first units. One Red → Green → commit at a time. |
| **Human-in-the-loop** | Two human merges per change: spec PR (the contract) and code PR (the implementation). |
| **Multi-agent orchestration** | Ideation, implementation, and audit agents work in parallel under human oversight. |

---

## Who are you?

Different readers, different starting points. Pick your track:

| You are… | Start here |
|----------|-----------|
| 🧑‍💻 **Developer** wanting to try it | [Install](01-getting-started/01-install.md) → [Architecture](03-guides/01-architecture.md) → [Tag system](03-guides/02-tag-system.md) → [Customize](03-guides/01-customize.md) |
| 🎨 **Vibe coder** / solo builder | [Install](01-getting-started/01-install.md) → run `./mzspec docs` → [SDD intro](02-concepts/01-sdd-intro.md) |
| 📋 **Project manager** evaluating process | [SDD intro](02-concepts/01-sdd-intro.md) → [Claude Code workflow](02-concepts/02-claude-code-workflow.md) → [Enterprise SDD](02-concepts/03-enterprise-sdd.md) |
| 🏢 **Enterprise architect** | [Enterprise SDD](02-concepts/03-enterprise-sdd.md) → [Architecture](03-guides/01-architecture.md) → [Hooks](05-reference/01-hooks.md) → [Gates](05-reference/03-gate-plugin.md) |
| 🔭 **Future-curious** | [Future of Agent-Driven SDLC](02-concepts/04-future-agent-sdlc.md) → [Orchestrator](04-extensions/02-orchestrator.md) |
| 🔧 **Tool / integration builder** | [Propose adapters](05-reference/04-adapter-contract.md) → [Hooks](05-reference/01-hooks.md) → [Gate plugins](05-reference/03-gate-plugin.md) |

## The learning path

If you're reading cover to cover, follow the tiers. Each folder has its own README
with an overview of what's inside.

### [Getting Started](01-getting-started/README.md)

New here? Start here.

| Guide | What it covers |
|-------|---------------|
| [Installing mzspec](01-getting-started/01-install.md) | Prerequisites, one-liner, options, what gets installed |

→ **Next:** [Concepts](02-concepts/README.md)

---

### [Concepts](02-concepts/README.md)

The ideas and philosophy behind the system — for everyone.

| Article | What it covers |
|---------|---------------|
| [SDD: The Missing Discipline](02-concepts/01-sdd-intro.md) | What is SDD, the spec kit, OpenSpec, pros/cons, what's missing |
| [The Claude Code Workflow](02-concepts/02-claude-code-workflow.md) | Why agent-driven pipelines change everything |
| [Enterprise-Grade SDD](02-concepts/03-enterprise-sdd.md) | What enterprise-grade SDD needs at scale |
| [The Future of Agent-Driven SDLC](02-concepts/04-future-agent-sdlc.md) | Multi-agent orchestration and autonomous iteration |

→ **Next:** [Guides](03-guides/README.md)

---

### [Guides](03-guides/README.md)

Technical how-to for developers configuring and using mzspec.

| Guide | What it covers |
|-------|---------------|
| [Architecture](03-guides/01-architecture.md) | Two-PR state machine, OpenSpec seam, gate engine |
| [Tag-driven skill routing](03-guides/02-tag-system.md) | Smart tagging: how tags on tasks drive skill and hook loading |
| [Configuration reference](03-guides/01-customize.md) | `mzspec.config.json` — toolchains, gates, tags, invariants |
| [Planning templates](03-guides/02-templates.md) | Project-specific planning playbooks |
| [Commit conventions](03-guides/03-commit-convention.md) | Conventional Commits for mzspec projects |

→ **Next:** [Extensions](04-extensions/README.md)

---

### [Extensions](04-extensions/README.md)

Add capabilities on top of the core pipeline.

| Guide | What it covers |
|-------|---------------|
| [task-github](04-extensions/01-task-github.md) | GitHub-backed tasking: `propose-gh`, `task-log`, `task-assign` |
| [Orchestrator](04-extensions/02-orchestrator.md) | Autonomous SDLC agent with human-in-the-loop |

→ **Next:** [Reference](05-reference/README.md)

---

### [Reference](05-reference/README.md)

Deep technical reference for power users.

| Guide | What it covers |
|-------|---------------|
| [Workflow hooks](05-reference/01-hooks.md) | Prompt hooks, agent hooks, and executable hooks |
| [Lifecycle hooks](05-reference/02-lifecycle-hooks.md) | Event-driven board and ticket sync |
| [Gate plugins](05-reference/03-gate-plugin.md) | Custom gate scripts, `when` predicates, starter gates |
| [Propose adapters](05-reference/04-adapter-contract.md) | Building custom task-source adapters |
| [Mework integration](05-reference/05-mework-integration.md) | Mework sandbox for orchestrator deployment |

---

### Reference

| Guide | What it covers |
|-------|---------------|
| [CLI reference](03-guides/01-customize.md#reference) | `./mzspec` command tree |
| [Full config schema](03-guides/01-customize.md) | All `mzspec.config.json` fields |
| [Changelog](../CHANGELOG.md) | Version history and migration notes |

## Quick links

- [Pipeline flow diagram](assets/flow-diagram.png) — visual overview of the full pipeline
- [Installing mzspec](01-getting-started/01-install.md) — first step if you haven't installed yet
