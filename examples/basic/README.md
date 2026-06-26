# mzspec basic example

Core pipeline + agent-skills extension. No tasks, no schema.

## Install

```bash
# 1. Init OpenSpec project
mkdir -p openspec/specs openspec/changes
echo '{"version":1}' > openspec/.openspec.json

# 2. Install core pipeline
bash path/to/mzspec/scripts/install.sh --dest . --no-openspec --force

# 3. Install agent-skills extension
bash path/to/mzspec/scripts/mzspec install agent-skills --dest . --force
```

## What's installed

| Path | Contents |
|---|---|
| `.claude/workflows/` | 8 pipeline workflows (spec → ship) |
| `.claude/commands/opsx/` | 13 core commands |
| `.claude/skills/` | 12 skills (4 core + 8 agent) |
| `.claude/workflows/lib/hook-engine.js` | Prompt hook engine |
| `.claude/workflows/lib/` | Gate-resolver, discover, load-config, run-hook, templates |
| `openspec/hooks/` | 9 prompt hooks injecting skill guidance per phase |
| `openspec/templates/` | Example template starters |

## Pipeline

```
/opsx:propose → /opsx:spec → /opsx:spec-pr → [human merges] → /opsx:ship
```

Prompt hooks inject TDD, code review, and other skill guidance at each phase — no hardcoded skill names in core.

## No task files

Pure spec → ship pipeline. No task management, no task commands, no task workflow.
