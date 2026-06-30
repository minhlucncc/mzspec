# Orchestrator Extension — Start Hook

This prompt hook fires when an orchestrator sandbox session starts.
It loads the orchestrator personality and prepares the environment.

## Precondition
- MCP servers (`mework-mcp`, `gh mcp`) are configured in `.claude/settings.json`
- Workspace is bound and writable
- Session env vars are populated (`MEWORK_SESSION_ID`, etc.)

## Instructions

Before starting work, quickly verify:
1. MCP tools are available — call `tools/list` for both `mework` and `github` servers
2. Session context is populated — call `get_session_context()`
3. The project workspace is accessible — check for the project's manifest file
4. Load any existing state from `.orchestrator/state.json` (if present)

If any of these checks fail, report the issue to the human via `notify_human()` and wait for instructions.

If all checks pass, announce readiness:
- Notify the human that the orchestrator is ready
- Summarize what you can do (implement, review, explore)
- Ask for their first instruction
