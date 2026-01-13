# @jetpack/mcp-server

MCP (Model Context Protocol) server for Claude Code integration with Jetpack.

This allows Claude Code to read/write plans and tasks that sync with the Jetpack web UI.

## Setup

### 1. Add to Claude Code settings

Add this to your `.claude/settings.local.json`:

```json
{
  "mcpServers": {
    "jetpack": {
      "command": "node",
      "args": ["/path/to/Jetpack/packages/mcp-server/dist/index.js"],
      "env": {
        "JETPACK_WORK_DIR": "/path/to/your/project"
      }
    }
  }
}
```

Or if using the CLI:

```json
{
  "mcpServers": {
    "jetpack": {
      "command": "node",
      "args": ["/path/to/Jetpack/apps/cli/dist/index.js", "mcp", "--dir", "/path/to/your/project"]
    }
  }
}
```

### 2. Restart Claude Code

After adding the MCP server config, restart Claude Code to connect.

## Available Tools

### Plan Management

| Tool | Description |
|------|-------------|
| `jetpack_list_plans` | List all plans in Jetpack |
| `jetpack_get_plan` | Get a specific plan by ID |
| `jetpack_create_plan` | Create a new plan |
| `jetpack_update_plan` | Update plan title, description, or status |

### Task Management

| Tool | Description |
|------|-------------|
| `jetpack_list_tasks` | List tasks, optionally filtered by status or plan |
| `jetpack_get_task` | Get detailed task information |
| `jetpack_create_task` | Create a new task |
| `jetpack_claim_task` | Claim a task to work on |
| `jetpack_start_task` | Mark a task as in progress |
| `jetpack_complete_task` | Mark a task as completed |
| `jetpack_fail_task` | Mark a task as failed |

### Status & Sync

| Tool | Description |
|------|-------------|
| `jetpack_status` | Get overall system status |
| `jetpack_sync_todos` | Sync Claude Code todos to Jetpack as tasks |

## Example Usage

In Claude Code, you can now:

```
# Create a plan
Use jetpack_create_plan to create a plan titled "Build Authentication"

# List tasks
Use jetpack_list_tasks to see all pending tasks

# Claim and work on a task
Use jetpack_claim_task to claim task bd-123
Use jetpack_start_task to mark it in progress
... do the work ...
Use jetpack_complete_task to mark it done
```

## Bidirectional Sync

The MCP server reads and writes the same files as the Jetpack web UI:

- Plans: `.jetpack/plans/*.json`
- Tasks: `.beads/tasks.jsonl`

This means:
- Plans created in Claude Code appear in the Jetpack UI
- Tasks claimed in the UI won't be claimed by Claude Code
- Progress is visible in real-time on both sides

## Working with the Web UI

1. Start the web UI: `pnpm dev` in `apps/web`
2. Open http://localhost:3000/plans to see plans
3. Open http://localhost:3000/board to see tasks
4. Changes made in Claude Code appear immediately (after refresh)
