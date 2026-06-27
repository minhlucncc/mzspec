# tasks-local example

Demonstrates the `tasks-local` extension for managing local `.tasks/` folders.

## Install

```bash
bash path/to/mzspec/scripts/mzspec install tasks-local --dest .
```

Or directly:

```bash
bash path/to/mzspec/extensions/tasks-local/install.sh --dest .
```

## Usage

```bash
# Create tasks
node .claude/tasks-local/task create "Add login page"
node .claude/tasks-local/task create "Setup database"

# List tasks (○=todo, ▶=in-progress, ✓=done)
node .claude/tasks-local/task list

# Mark progress
node .claude/tasks-local/task progress T-001
node .claude/tasks-local/task done T-002

# Show details
node .claude/tasks-local/task show T-001
```

Tasks are stored as `.tasks/<id>/task.md` with YAML frontmatter — committed in-repo.
