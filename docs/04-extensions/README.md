# Extensions

Add capabilities on top of the core pipeline. Each extension is self-contained
with its own install and uninstall scripts.

| Guide | What it covers |
|-------|---------------|
| [Extension management](../01-getting-started/01-install.md#installing-extensions) | How to add, list, and remove extensions |
| [task-github](01-task-github.md) | GitHub-backed tasking: `propose-gh`, `task-log`, `task-assign` |
| [Orchestrator](02-orchestrator.md) | Autonomous SDLC agent with human-in-the-loop |

Extensions are installed via `./mzspec ext add <name>`. Run `./mzspec ext list`
to see what's available and what's installed.

→ **Next tier:** [Advanced](../05-reference/README.md)
