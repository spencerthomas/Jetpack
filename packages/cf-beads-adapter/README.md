# @jetpack-agent/cf-beads-adapter

Cloudflare D1-based task storage adapter for Jetpack multi-agent systems.

## Overview

This package provides a `CloudflareTaskStore` class that implements the `ITaskStore` interface using Cloudflare D1 as the persistence layer. It is designed for deployment in Cloudflare Workers environments.

## Installation

```bash
npm install @jetpack-agent/cf-beads-adapter
# or
pnpm add @jetpack-agent/cf-beads-adapter
```

## Requirements

- **Cloudflare D1**: A D1 database binding configured in your worker
- **Database migrations**: Tasks table must be created via D1 migrations

## Quick Start

```typescript
import { CloudflareTaskStore } from '@jetpack-agent/cf-beads-adapter';

export interface Env {
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const taskStore = new CloudflareTaskStore({ db: env.DB });

    // Create a task
    const task = await taskStore.createTask({
      title: 'Implement feature X',
      description: 'Add the new feature to the dashboard',
      priority: 'high',
      requiredSkills: ['typescript', 'react'],
    });

    // Get ready tasks for processing
    const readyTasks = await taskStore.getReadyTasks();

    // Claim a task for an agent
    const claimed = await taskStore.claimTask(task.id, 'agent-001');

    return Response.json({ task, readyTasks });
  },
};
```

## Wrangler Configuration

Add the D1 binding to your `wrangler.toml`:

```toml
name = "jetpack-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "jetpack-tasks"
database_id = "<your-database-id>"
```

## Database Migration

Create a migration file at `migrations/0001_create_tasks.sql`:

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  dependencies TEXT,
  blockers TEXT,
  required_skills TEXT,
  estimated_minutes INTEGER,
  actual_minutes INTEGER,
  tags TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 2,
  branch TEXT,
  origin_branch TEXT,
  target_branches TEXT,
  assigned_agent TEXT,
  last_error TEXT,
  failure_type TEXT,
  last_attempt_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_assigned_agent ON tasks(assigned_agent);
```

Run the migration:

```bash
wrangler d1 migrations apply jetpack-tasks
```

## API Reference

### Constructor

```typescript
new CloudflareTaskStore(config: CloudflareTaskStoreConfig)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.db` | `D1Database` | Cloudflare D1 database binding |

### Methods

#### Task Management

| Method | Description |
|--------|-------------|
| `createTask(input: TaskInput)` | Create a new task |
| `getTask(id: string)` | Get a task by ID |
| `updateTask(id: string, updates: TaskUpdate)` | Update task properties |
| `deleteTask(id: string)` | Delete a task |
| `listTasks(options?: TaskListOptions)` | List tasks with filtering |

#### Task Workflow

| Method | Description |
|--------|-------------|
| `getReadyTasks()` | Get tasks ready for execution (no blockers, dependencies met) |
| `getTasksByStatus(status: TaskStatus)` | Get tasks by status |
| `getTasksByAgent(agentId: string)` | Get tasks assigned to an agent |
| `claimTask(taskId: string, agentId: string)` | Claim a task for an agent (atomic) |
| `releaseTask(taskId: string)` | Release a claimed task |

#### Statistics

| Method | Description |
|--------|-------------|
| `getStats()` | Get task statistics by status and priority |

### Task Statuses

- `pending` - Task created, waiting to be processed
- `ready` - Task ready for execution
- `claimed` - Task claimed by an agent
- `in_progress` - Task being worked on
- `blocked` - Task blocked by dependencies
- `completed` - Task finished successfully
- `failed` - Task failed after retries

### Task Priorities

- `critical` - Immediate attention required
- `high` - High priority
- `medium` - Normal priority (default)
- `low` - Low priority

## License

MIT
