# Orchestrator Extension

**Extension ID:** `orchestrator`
**Version:** 0.1.0
**Requires:** mzspec >= 0.11.0, mework >= 0.x (with mework-mcp)

The orchestrator extension enables a **Claude Code agent running in a mework sandbox**
to act as an autonomous SDLC orchestrator — receiving human instructions, delegating
work to child agent sandboxes, and reporting results back to the human.

## What this extension provides

| Asset | Path | Purpose |
|-------|------|---------|
| Orchestrator skill | `core/skills/orchestrator/SKILL.md` | The orchestrator's behavior definition, decision framework, MCP tool usage |
| Start hook | `Hooks/on-orchestrator-start.prompt.md` | Injected at orchestrator sandbox start |
| Agent templates | `agent-templates/implementation-agent.prompt.md` | Prompt template for implementation child agents |
| Agent templates | `agent-templates/audit-agent.prompt.md` | Prompt template for audit child agents |
| Agent templates | `agent-templates/ideation-agent.prompt.md` | Prompt template for ideation child agents |
| Agent bundle | `agent-bundle/sandbox.yaml` | mework bundle metadata for the orchestrator agent |
| Agent bundle | `agent-bundle/definition.md` | Orchestrator system prompt (mework bundle format) |

## How to use

### Step 1: Install the extension

```bash
./mzspec ext install orchestrator
```

### Step 2: Set up mework-mcp

Build the mework-mcp server from the mework repo:

```bash
cd <mework-repo> && go build -o bin/mework-mcp ./mcp-server/
```

Ensure `mework-mcp` is on your PATH.

### Step 3: Create an orchestrator sandbox

```bash
# Using mework CLI:
mework session create --orchestrator --workspace /path/to/project

# Or manually:
mework sandbox start --agent claude \
  --workspace /path/to/project \
  --settings-template orchestrator
```

### Step 4: Send instructions

Instructions are sent via the session. The orchestrator will:
1. Receive your instruction
2. Plan and delegate to specialized child agents
3. Report progress and ask for decisions
4. Deliver the final result

## MCP configuration

The orchestrator requires these MCP servers in its `.claude/settings.json`:

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

The extension's start hook generates this automatically.
