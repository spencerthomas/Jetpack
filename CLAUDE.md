# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Build all packages (uses Turborepo for caching/parallelization)
pnpm build

# Development mode with watch
pnpm dev

# Run tests
pnpm test

# Run single package tests
cd packages/<package-name> && pnpm test

# Lint
pnpm lint

# Clean build artifacts
pnpm clean

# Run CLI after building
pnpm jetpack <command>

# Web UI development
cd apps/web && pnpm dev  # Runs on localhost:3000

# Web UI with custom project directory
JETPACK_WORK_DIR=/path/to/project pnpm --filter @jetpack/web dev
```

## Architecture Overview

Jetpack is a **multi-agent orchestration system** built as a pnpm monorepo with Turborepo. It coordinates AI agents for software development tasks using three integrated memory/communication systems.

### Core Components

```
JetpackOrchestrator (packages/orchestrator)
├── BeadsAdapter     - Git-backed task management with dependency graphs
├── CASSAdapter      - SQLite-based persistent agent memory (better-sqlite3)
├── MCPMailAdapter   - File-based inter-agent pub/sub messaging + file leasing
└── AgentController  - Individual agent lifecycle (claim tasks, execute, report)
```

### Package Dependencies

- `@jetpack/shared` - Base types (Task, Agent, Message, Memory) using Zod schemas
- `@jetpack/beads-adapter` - Tasks stored in `.beads/tasks.jsonl`, optional git auto-commit
- `@jetpack/cass-adapter` - Memory stored in `.cass/memory.db`, supports semantic search
- `@jetpack/mcp-mail-adapter` - Messages in `.jetpack/mail/{inbox,outbox}/*.json`
- `@jetpack/orchestrator` - Combines adapters, manages agent pool
- `@jetpack/mcp-server` - MCP server for Claude Code integration
- `@jetpack/cli` - Commander-based CLI (`start`, `task`, `status`, `demo`, `mcp`)
- `@jetpack/web` - Next.js 15 Kanban UI with React 19, dnd-kit, Tailwind

### Data Flow

1. **Task Creation**: `JetpackOrchestrator.createTask()` → BeadsAdapter stores in JSONL → broadcasts via MCPMail
2. **Task Claiming**: AgentController polls `getReadyTasks()` (checks dependencies) → `claimTask()` acquires exclusive access
3. **Execution**: Agent updates task status → retrieves CASS memories for context → executes work → stores learnings
4. **Coordination**: MCPMail file leasing prevents concurrent file edits; heartbeats track agent liveness

### Key Types (packages/shared)

- `Task`: id (`bd-XXXX`), status (pending/ready/claimed/in_progress/blocked/completed/failed), dependencies[], requiredSkills[]
- `Agent`: id, name, status (idle/busy/error/offline), skills (typescript/python/react/backend/etc.)
- `Message`: type (task.created/task.claimed/agent.started/heartbeat/etc.), from, to?, payload
- `MemoryEntry`: type (codebase_knowledge/agent_learning/conversation/etc.), content, importance, embedding?

### File Storage Locations

- `.beads/` - Task storage (JSONL, git-backed)
- `.cass/` - SQLite memory database
- `.jetpack/mail/` - Inter-agent message queues
- `.jetpack/plans/` - Plan storage (JSON files)

### Claude Code Integration (MCP Server)

The MCP server allows Claude Code to be a first-class Jetpack client, bidirectionally syncing with the web UI.

**Setup** - Add to `.claude/settings.local.json`:
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

**Available Tools:**
- `jetpack_list_plans` / `jetpack_get_plan` / `jetpack_create_plan` / `jetpack_update_plan`
- `jetpack_list_tasks` / `jetpack_get_task` / `jetpack_create_task`
- `jetpack_claim_task` / `jetpack_start_task` / `jetpack_complete_task` / `jetpack_fail_task`
- `jetpack_status` / `jetpack_sync_todos`

**Workflow:**
1. Create plans in Claude Code or Jetpack UI - both see the same data
2. Claim tasks via Claude Code or let headless agents claim them
3. Progress visible in real-time on Jetpack dashboard (localhost:3000)

### LangGraph Supervisor (packages/supervisor)

The supervisor uses LangGraph to provide intelligent orchestration from high-level requests.

```
packages/supervisor/
├── src/
│   ├── SupervisorAgent.ts          # Main orchestration class
│   ├── graph/
│   │   ├── state.ts                # LangGraph state annotation
│   │   ├── graph.ts                # Graph definition with edges
│   │   └── nodes/
│   │       ├── PlannerNode.ts      # LLM-powered task breakdown
│   │       ├── AssignerNode.ts     # Skill-based agent matching
│   │       ├── MonitorNode.ts      # Progress tracking
│   │       └── CoordinatorNode.ts  # Conflict resolution
│   ├── llm/
│   │   ├── LLMProvider.ts          # Abstract interface
│   │   ├── ClaudeProvider.ts       # Anthropic implementation
│   │   └── OpenAIProvider.ts       # OpenAI implementation
│   └── prompts/                    # LLM prompts for each node
```

**Graph Flow:**
```
START → Planner → Assigner → Monitor ─┬→ END (all complete)
                      ▲               │
                      └── Coordinator ◄┘ (on conflicts)
```

**Usage:**
```typescript
// Programmatic
await jetpack.createSupervisor({ provider: 'claude', model: 'claude-3-5-sonnet-20241022' });
const result = await jetpack.supervise("Build user authentication");

// CLI
jetpack supervise "Build user authentication" --llm claude --agents 5
```

### Web API Routes (apps/web/src/app/api/)

**Tasks:**
- `GET/POST /api/tasks` - List/create tasks
- `PATCH/DELETE /api/tasks/[id]` - Update/delete task

**Agents:**
- `GET /api/agents` - List agents with status
- `POST /api/agents/spawn` - Spawn new agent with config

**Messages:**
- `GET /api/messages` - MCP Mail messages
- `POST /api/messages/[id]/ack` - Acknowledge message
- `POST /api/messages/broadcast` - Broadcast to all agents
- `GET /api/messages/stream` - SSE real-time updates

**Plans:**
- `GET/POST /api/plans` - List/create plans
- `GET/PUT/DELETE /api/plans/[id]` - Plan CRUD
- `POST /api/plans/[id]/execute` - Execute plan
- `POST /api/plans/[id]/complete` - Mark complete

**Memory (CASS):**
- `GET /api/cass/stats` - Memory statistics
- `GET /api/cass/memories` - Memory entries with filtering
- `POST /api/cass/reconfigure` - Hot reload CASS config
- `POST /api/cass/backfill` - Generate embeddings
- `POST /api/cass/compact` - Memory cleanup

**Settings:**
- `GET/POST /api/settings` - System configuration

**System:**
- `GET /api/status` - Full system status
- `POST /api/supervisor` - Submit supervisor request

## Agent Controller Lifecycle

Agents execute real work by spawning Claude Code CLI processes.

```
AgentController.start()
├── Subscribe to MCP Mail (task.created, task.updated)
├── Start heartbeat timer (30s interval)
├── Announce agent.started
└── Begin lookForWork() loop

lookForWork()
├── Return if not idle
├── getReadyTasks() from Beads (dependencies satisfied)
├── Filter by agent.skills matching task.requiredSkills
├── Sort by priority (critical > high > medium > low)
└── claimAndExecuteTask() for best match

claimAndExecuteTask()
├── Atomic claimTask() in Beads (prevents race conditions)
├── Publish task.claimed via MCP Mail
├── Retrieve relevant memories from CASS
├── Execute task via ClaudeCodeExecutor
│   ├── Build prompt from task + memories
│   ├── Spawn: claude --print --dangerously-skip-permissions "<prompt>"
│   ├── Capture stdout/stderr
│   └── Detect success/failure from exit code
├── On success: store learnings in CASS, publish task.completed
├── On failure: publish task.failed with error
└── Return to lookForWork() after 1s delay
```

### ClaudeCodeExecutor (packages/orchestrator/src/ClaudeCodeExecutor.ts)

Spawns Claude Code CLI for each task:

```typescript
// Prompt structure sent to Claude Code
`You are ${agentName}, an AI agent with skills in: ${skills}.

## Task
**Title:** ${task.title}
**Priority:** ${task.priority}
**Description:** ${task.description}

## Relevant Context from Previous Work
${memories.map(m => `- ${m.content}`).join('\n')}

## Instructions
Complete this task by making the necessary code changes...`
```

**Requirements:**
- `claude` CLI in PATH
- Anthropic API key configured for Claude Code

## Common Patterns

### Creating a task with dependencies
```typescript
const task1 = await jetpack.createTask({
  title: 'Set up database',
  priority: 'high',
  requiredSkills: ['database'],
});

const task2 = await jetpack.createTask({
  title: 'Create API',
  priority: 'high',
  requiredSkills: ['backend'],
  dependencies: [task1.id],  // Won't start until task1 completes
});
```

### Extending with custom adapters
```typescript
// All adapters follow initialize/close pattern
class CustomAdapter {
  async initialize(): Promise<void> { /* setup */ }
  async close(): Promise<void> { /* cleanup */ }
}
```

### Environment Variables

```bash
ANTHROPIC_API_KEY=...   # Required for Claude supervisor
OPENAI_API_KEY=...      # Required for OpenAI supervisor
JETPACK_WORK_DIR=...    # Override working directory for all adapters
```

**JETPACK_WORK_DIR** is critical for the web UI:
- Without it, the web UI defaults to the Jetpack repo root (`apps/web/../../`)
- Set it to point to your target project containing `.beads/`, `.cass/`, `.jetpack/`
- All API routes (tasks, plans, CASS memory, status) respect this variable
- The MCP server also uses this to determine where to read/write data

### Plan Item Structure

When creating plans manually (JSON files in `.jetpack/plans/`), items must include:

```typescript
interface PlanItem {
  id: string;           // e.g., "item-1"
  title: string;        // Task title
  description?: string; // Optional details
  status: 'pending' | 'converted' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  priority: 'low' | 'medium' | 'high' | 'critical';
  skills: string[];     // Required: e.g., ["typescript", "react"]
  dependencies: string[]; // Required: IDs of dependent items, or []
  estimatedMinutes?: number;
}
```
