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
- `@jetpack/cli` - Commander-based CLI (`start`, `task`, `status`, `demo`)
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

### Web API Routes (apps/web/src/app/api/)

- `GET/POST /api/tasks` - List/create tasks
- `PATCH /api/tasks/[id]` - Update task status
- `GET /api/agents` - List agents with status
- `GET /api/status` - Full system status
- `GET /api/messages` - MCP Mail messages
