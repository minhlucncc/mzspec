# Orchestrator Agent — Autonomous SDLC with Human-in-the-Loop

The orchestrator is a **Claude Code agent** that manages the software development
lifecycle inside a mework sandbox. It acts as a smart coordinator — receiving
high-level human instructions, delegating specialized work to child agent sandboxes,
monitoring progress, and reporting results back to the human.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Human (gives instructions, responds to questions)                │
└──────────────────────────┬───────────────────────────────────────┘
                           │ (via session input / Mello / CLI)
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  mework Daemon                                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Orchestrator Sandbox (interactive session)                 │  │
│  │  ┌──────────────────┐    MCP stdio    ┌────────────────┐   │  │
│  │  │  Claude Code      │◄──────────────►│  mework-mcp     │   │  │
│  │  │  (orchestrator)   │                │  (MCP server)   │   │  │
│  │  └──────────────────┘                └────────────────┘   │  │
│  │  ┌──────────────────┐    MCP stdio                        │  │
│  │  │  Claude Code      │◄──── gh mcp ────► GitHub API       │  │
│  │  │  (orchestrator)   │                                     │  │
│  │  └──────────────────┘                                     │  │
│  │                                                           │  │
│  │  Workspace: /path/to/project + .orchestrator/state.json   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  Impl Agent  │  │  Audit Agent │  │ Ideation Ag. │  (child   │
│  │  (sandbox)   │  │  (sandbox)   │  │  (sandbox)   │   sand-   │
│  └──────────────┘  └──────────────┘  └──────────────┘   boxes)  │
└──────────────────────────────────────────────────────────────────┘
```

## Interaction Flow

### Human asks → Bot works → Bot notifies → Human feedback

```
HUMAN: "Implement the user authentication module"
         │
         ▼
ORCHESTRATOR: Plans → spawns implementation-agent sandbox
         │
         ▼
ORCHESTRATOR: Monitors progress
         │
         ▼
ORCHESTRATOR: "PR #123 is open for user auth — ready for review"
         │
         ▼
HUMAN: "Looks good, let me review"
         │
         ▼
HUMAN: "I left some review comments on PR #123"
         │
         ▼
ORCHESTRATOR: Spawns implementation-agent to address feedback
         │
         ▼
ORCHESTRATOR: "Review comments addressed on PR #123"
         │
         ▼
HUMAN: "Approved, merge it"
         │
         ▼
ORCHESTRATOR: Merges PR #123
         │
         ▼
ORCHESTRATOR: "PR #123 merged to main ✅"
```

## Setup

### Prerequisites

- **mework** with `mework-mcp` built and on PATH
- **mzspec** installed in the target project
- **gh CLI** installed and authenticated
- **Claude Code** available as the agent CLI

### Step 1: Install the orchestrator extension

```bash
cd /path/to/project
./mzspec ext install orchestrator
```

### Step 2: Build mework-mcp

```bash
cd <mework-repo>
# Build the MCP server binary:
go build -o bin/mework-mcp ./mcp-server/
# Ensure it's on your PATH:
export PATH="$PATH:$(pwd)/bin"
```

### Step 3: Start an orchestrator session

```bash
mework session create --orchestrator --workspace /path/to/project
```

Or via a Mello ticket: comment `@mework orchestrator <instructions>` on a ticket.

### Step 4: Send instructions

Once the orchestrator session is active, send your instruction. The orchestrator
will decompose it, delegate to child agents, and keep you updated.

## Child Agents

| Agent | Purpose | Timeout | Sandbox |
|-------|---------|---------|---------|
| **implementation-agent** | Full mzspec pipeline: propose → spec → ship → PR | 60 min | Local/Docker |
| **audit-agent** | Multi-dimensional code review + gate verification | 30 min | Local/Docker |
| **ideation-agent** | Explore issues, TODOs, deps, and propose work | 15 min | Local/Docker |

Child agents are **ephemeral sandboxes** created by the orchestrator via
`spawn_sandbox()` MCP tool. They run autonomously and are destroyed after
completion.

## MCP Tools Reference

### mework-mcp (sandbox management)

| Tool | Description |
|------|-------------|
| `spawn_sandbox` | Create a child sandbox with a prompt and optional workspace |
| `get_sandbox_status` | Check a child sandbox's current status |
| `wait_for_sandbox` | Block until a child sandbox completes |
| `list_child_sandboxes` | List all active child sandboxes |
| `destroy_sandbox` | Terminate and clean up a child sandbox |
| `notify_human` | Send a message to the human via session output |
| `ask_human` | Block until the human responds to a question |
| `get_session_context` | Get session identity and workspace info |
| `write_artifact` | Persist content to the session workspace |

### GitHub (gh mcp)

| Tool | Description |
|------|-------------|
| `gh_mcp__create_pr` | Open a pull request |
| `gh_mcp__merge_pr` | Merge a pull request |
| `gh_mcp__review_pr` | Add a review to a PR |
| `gh_mcp__add_comment` | Comment on an issue or PR |
| `gh_mcp__list_prs` | List pull requests |
| `gh_mcp__list_issues` | List issues |

## Limitations

- **Single orchestrator per session**: One orchestrator agent handles one
  instruction chain at a time. Instructions are processed serially.
- **Child agents are ephemeral**: If the orchestrator restarts, running
  child agents are lost. Long-running work should checkpoint state.
- **Network access**: Child agents inherit the sandbox's network access.
  For sensitive work, use the Docker engine for stronger isolation.
- **No visual UI**: All interaction is via session text (CLI, Mello comments,
  GitHub issue comments).

## Comparison: Orchestrator vs. Direct mzspec

| Aspect | Direct mzspec | Orchestrator |
|--------|---------------|--------------|
| Scope | One change at a time | Multi-step, multi-agent workflows |
| Human involvement | Required at every gate | Delegate, then notify for decisions |
| Parallelism | Sequential pipeline | Spawn multiple child agents |
| PR review | Manual review by human | Automated audit agent + human final sign-off |
| Exploration | Human-driven | Ideation agent proactively proposes |
| State | Stateless per command | Persistent state across turns |
