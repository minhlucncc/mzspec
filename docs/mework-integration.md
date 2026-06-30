# Mework Integration

How the mzspec orchestrator agent integrates with mework's infrastructure —
the MCP tool contract, session lifecycle, agent catalog registration, and
notification flows.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  mework Hub (server)                                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Agent Catalog     Bus (topics)    Session Manager         │  │
│  └────────────────────────┬───────────────────────────────────┘  │
│                           │                                       │
│                    dispatch / session.input                       │
│                           │                                       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  mework Daemon (developer machine)                           │  │
│  │                                                              │  │
│  │  ┌─────────────────────┐   stdio    ┌──────────────────┐   │  │
│  │  │  Orchestrator       │◄──────────►│  mework-mcp       │   │  │
│  │  │  (Claude Code)      │   MCP      │  (MCP server)    │   │  │
│  │  └─────────────────────┘            └────────┬─────────┘   │  │
│  │                                               │               │
│  │  ┌────────────────────────────────────────────┼───────────┐  │
│  │  │  Child sandboxes (spawned by MCP)          │           │  │
│  │  │  ┌─────────────────┐  ┌─────────────────┐  │           │  │
│  │  │  │ Implementation  │  │   Audit         │  │           │  │
│  │  │  └─────────────────┘  └─────────────────┘  │           │  │
│  │  └────────────────────────────────────────────┘           │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

The orchestrator is a **mework sandbox** (interactive session) running Claude Code.
It communicates with the mework daemon via the **mework-mcp** stdio MCP server,
which exposes sandbox lifecycle and notification tools.

---

## MCP Tool Contract

The orchestrator requires these tools from `mework-mcp`:

### Sandbox lifecycle

| Tool | Input | Output | Purpose |
|------|-------|--------|---------|
| `spawn_sandbox` | `{ agent_id, prompt, image?, workspace_path?, timeout_minutes? }` | `{ sandbox_id }` | Create a child agent sandbox |
| `get_sandbox_status` | `{ sandbox_id }` | `{ status, result? }` | Check child status |
| `wait_for_sandbox` | `{ sandbox_id, timeout_seconds? }` | `{ status, result }` | Block until child completes |
| `list_child_sandboxes` | `{}` | `[ { sandbox_id, agent_id, status } ]` | List active children |
| `destroy_sandbox` | `{ sandbox_id }` | `{ ok }` | Terminate a child |

### Notification

| Tool | Input | Output | Purpose |
|------|-------|--------|---------|
| `notify_human` | `{ message, format?, attachments? }` | `{ ok }` | Send message to human |
| `ask_human` | `{ question, options?, timeout_minutes? }` | `{ response }` | Ask human, wait for reply |

### Session context

| Tool | Input | Output | Purpose |
|------|-------|--------|---------|
| `get_session_context` | `{}` | `{ session_id, owner, tenant, workspace_path, provider }` | Discover session identity |
| `write_artifact` | `{ path, content, encoding? }` | `{ path, size }` | Persist to workspace |

### Transport

`mework-mcp` uses **stdio transport** (the standard MCP transport for Claude Code).
The mework daemon injects it into the sandbox's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "mework": {
      "command": "mework-mcp",
      "args": [],
      "env": {
        "MEWORK_SESSION_ID": "auto"
      }
    },
    "github": {
      "command": "gh",
      "args": ["mcp"]
    }
  }
}
```

### Environment variables

The mework daemon must set these in the sandbox for session context tools to work:

| Variable | Description | Required |
|----------|-------------|----------|
| `MEWORK_SESSION_ID` | The session ID | Yes |
| `MEWORK_WORKSPACE_PATH` | Absolute path to bound workspace | No |
| `MEWORK_SESSION_OWNER` | Who initiated the session | No |
| `MEWORK_SESSION_TENANT` | Tenant/org identifier | No |
| `MEWORK_PROVIDER` | Provider type (mello, github, cli) | No |

---

## Agent Catalog Registration

The orchestrator agent bundle lives at `extensions/orchestrator/agent-bundle/`.
Register it in mework's agent catalog:

```bash
# As a definition-form agent (prompt is the payload):
mework agent publish orchestrator 0.1.0 \
  --form definition \
  --payload "$(cat extensions/orchestrator/agent-bundle/definition.md)"

# Or as a bundle (zip with sandbox.yaml + definition.md):
cd extensions/orchestrator/agent-bundle
zip -r /tmp/orchestrator.zip sandbox.yaml definition.md
mework agent publish orchestrator 0.1.0 \
  --form bundle \
  --payload "$(base64 < /tmp/orchestrator.zip)"
```

After registration, the orchestrator can be spawned as a session:

```bash
mework session create --agent orchestrator --workspace /path/to/project
```

---

## Session Lifecycle

### Start

1. Human invokes orchestrator: `mework session create --agent orchestrator`
2. mework daemon creates an interactive sandbox with:
   - Claude Code as the backend
   - `mework-mcp` configured as an MCP server
   - `gh mcp` configured for GitHub access
   - The project workspace mounted
3. The `on-orchestrator-start` prompt hook fires:
   - Verifies MCP tools respond to `tools/list`
   - Checks session context via `get_session_context()`
   - Loads any existing state from `.orchestrator/state.json`
   - Announces readiness via `notify_human()`

### Active

4. Human sends instruction via session input
5. Orchestrator plans and delegates:
   - Calls `spawn_sandbox()` to create child agents
   - Calls `wait_for_sandbox()` to monitor them
   - Calls `notify_human()` for progress updates
   - Calls `ask_human()` when a decision is needed
   - Calls `write_artifact()` to persist state

### End

6. Human closes the session, or the orchestrator completes its work
7. Final state is saved to `.orchestrator/state.json`

---

## Child Agent Spawning

When the orchestrator delegates work, it calls `spawn_sandbox()`:

```
Request:
{
  "agent_id": "impl-user-auth",
  "prompt": "Implement user authentication following...",
  "workspace_path": "/path/to/project",
  "image": "ubuntu:22.04",
  "timeout_minutes": 60
}

Response:
{
  "sandbox_id": "sb_abc123"
}
```

The child sandbox:
1. Is created via mework's sandbox engine (local or docker)
2. Has the project workspace mounted (same as orchestrator)
3. Receives the prompt over stdin (stdin-not-argv invariant)
4. Runs autonomously until completion or timeout
5. The orchestrator monitors via `wait_for_sandbox()` or polling

The three child agent prompts are defined in `agent-templates/`:
- `implementation-agent.prompt.md` — full mzspec pipeline
- `audit-agent.prompt.md` — multi-D code review
- `ideation-agent.prompt.md` — exploration and proposals

---

## Notification Flow

```
notify_human("PR #123 is open")
  ──► mework-mcp publishes to session.{id}.output topic
  ──► mework daemon routes to provider write-back (Mello comment)
  ──► Human sees the message in their session UI


ask_human("Merge PR #123?", ["yes", "no"])
  ──► mework-mcp publishes to session.{id}.input topic
  ──► mework daemon delivers question to human
  ──► Human responds ("yes")
  ──► mework-mcp receives response and returns it to orchestrator
```

The `ask_human` tool is what makes the **human-in-the-loop** pattern work:
the orchestrator stops, asks for a decision, and waits until the human
responds (or the timeout expires).

---

## Deployment Requirements

| Component | Required | Notes |
|-----------|----------|-------|
| mework hub server | Yes | Routes messages, hosts agent catalog |
| mework daemon | Yes | Runs on dev machine, manages sandboxes |
| `mework-mcp` binary | Yes | Built from mework repo, on sandbox PATH |
| `gh` CLI + `gh mcp` | For GitHub ops | Authenticated with GitHub token |
| mzspec | Yes | Installed in project, provides `/opsx` pipeline |
| Claude Code | Yes | The agent backend (`backend: claude`) |

### Consumer project setup

```bash
# In the target project:
./mzspec ext install orchestrator

# Register the orchestrator agent:
mework agent publish orchestrator 0.1.0 --form definition \
  --payload "$(cat .claude/extensions/orchestrator/agent-bundle/definition.md)"

# Start a session:
mework session create --agent orchestrator --workspace .
```
