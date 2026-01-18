# @jetpack-agent/mcp-server

MCP (Model Context Protocol) server for Claude Code integration with Jetpack.

This allows Claude Code to be a **first-class Jetpack client**, reading/writing plans and tasks that sync bidirectionally with the Jetpack web UI.

## Setup

### 1. Build the MCP server

```bash
# From Jetpack root
pnpm build
```

### 2. Add to Claude Code settings

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

**Alternative: Using the CLI wrapper:**

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

### 3. Restart Claude Code

After adding the MCP server config, restart Claude Code to connect.

**Verify connection:** In Claude Code, type `/mcp` to see connected servers. Jetpack tools should appear.

## Available Tools

### Plan Management

| Tool | Description |
|------|-------------|
| `jetpack_list_plans` | List all plans in Jetpack |
| `jetpack_get_plan` | Get a specific plan by ID |
| `jetpack_create_plan` | Create a new plan with items |
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

## Data Structures

### Plan Structure

Plans are stored in `.jetpack/plans/{plan-id}.json`:

```json
{
  "id": "plan-1736712000000",
  "title": "Build Authentication",
  "description": "Implement JWT-based auth flow",
  "status": "draft",
  "createdAt": "2024-01-13T00:00:00.000Z",
  "items": [
    {
      "id": "item-1",
      "title": "Create user model",
      "description": "Define user schema with email, password hash",
      "status": "pending",
      "priority": "high",
      "skills": ["typescript", "database"],
      "dependencies": [],
      "estimatedMinutes": 15
    },
    {
      "id": "item-2",
      "title": "Implement JWT service",
      "description": "Token generation and verification",
      "status": "pending",
      "priority": "high",
      "skills": ["typescript", "backend"],
      "dependencies": ["item-1"],
      "estimatedMinutes": 30
    }
  ]
}
```

**Plan Statuses:** `draft` | `approved` | `executing` | `completed` | `failed`

**Required PlanItem fields:**
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique item ID (e.g., "item-1") |
| `title` | string | Short description of the work |
| `status` | string | `pending` \| `in_progress` \| `completed` \| `failed` |
| `priority` | string | `low` \| `medium` \| `high` \| `critical` |
| `skills` | string[] | Required skills (e.g., `["typescript", "react"]`) |
| `dependencies` | string[] | IDs of items that must complete first |

**Optional fields:** `description`, `estimatedMinutes`

### Task Structure

Tasks are stored in `.beads/tasks.jsonl` (JSON Lines format):

```json
{
  "id": "bd-a1b2c3d4",
  "title": "Implement login endpoint",
  "description": "POST /api/auth/login with email/password",
  "status": "pending",
  "priority": "high",
  "requiredSkills": ["typescript", "backend"],
  "dependencies": [],
  "estimatedMinutes": 30,
  "createdAt": "2024-01-13T00:00:00.000Z"
}
```

**Task Statuses:** `pending` | `ready` | `claimed` | `in_progress` | `blocked` | `completed` | `failed`

## Example Workflows

### Creating a Plan in Claude Code

```
User: Create a plan for building a REST API

Claude: I'll use jetpack_create_plan to create a plan with tasks for the API...

[Creates plan with items for: database models, endpoints, authentication, tests]

You can view this plan at http://localhost:3002/plans
```

### Working on Tasks

```
# See available tasks
Use jetpack_list_tasks with status="ready"

# Claim a task (prevents other agents from taking it)
Use jetpack_claim_task for task bd-a1b2

# Start working (shows as "in progress" in UI)
Use jetpack_start_task for task bd-a1b2

# ... complete the implementation ...

# Mark as done
Use jetpack_complete_task for task bd-a1b2 with summary "Implemented login endpoint with JWT"
```

### Syncing Claude Code Todos

If you have todos in Claude Code, sync them to Jetpack:

```
Use jetpack_sync_todos to push your todo list to Jetpack tasks
```

## Bidirectional Sync

The MCP server reads and writes the **same files** as the Jetpack web UI:

| Data | Location | Format |
|------|----------|--------|
| Plans | `.jetpack/plans/*.json` | JSON files |
| Tasks | `.beads/tasks.jsonl` | JSON Lines |
| Messages | `.jetpack/mail/` | JSON files |
| Memory | `.cass/memory.db` | SQLite |

**Sync behavior:**
- Plans created in Claude Code appear immediately in the Jetpack UI
- Tasks claimed in the UI won't be claimed by Claude Code agents
- Progress is visible in real-time on both sides (after UI refresh)
- Multiple Claude Code sessions can work on the same project

## Working with the Web UI

1. Start the web UI: `JETPACK_WORK_DIR=/your/project pnpm dev` in `apps/web`
2. Open http://localhost:3000/plans to see plans
3. Open http://localhost:3000/board to see tasks
4. Changes made in Claude Code appear after refresh (SSE real-time coming soon)

## Troubleshooting

### Tools not appearing in Claude Code
1. Verify MCP server is built: `pnpm build` in packages/mcp-server
2. Check settings.local.json path is correct
3. Restart Claude Code after config changes
4. Run `/mcp` in Claude Code to check connection

### Plan not appearing in web UI
1. Ensure `JETPACK_WORK_DIR` matches in both MCP config and web server
2. Check `.jetpack/plans/` directory exists
3. Verify plan JSON has all required fields

### Wrong project data showing
1. The `JETPACK_WORK_DIR` in MCP config determines which project's data is accessed
2. Restart Claude Code after changing `JETPACK_WORK_DIR`
