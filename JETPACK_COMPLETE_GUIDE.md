# Jetpack: Complete Documentation Guide

> The Definitive Reference for the Multi-Agent Swarm Development Stack

**Version:** 1.0
**Last Updated:** January 2025

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Quick Start](#2-quick-start)
3. [Installation](#3-installation)
4. [CLI Commands Reference](#4-cli-commands-reference)
5. [Architecture Deep Dive](#5-architecture-deep-dive)
6. [Web UI Documentation](#6-web-ui-documentation)
7. [Claude Code Integration (MCP Server)](#7-claude-code-integration-mcp-server)
8. [Beads: Task Management](#8-beads-task-management)
9. [MCP Mail: Agent Communication](#9-mcp-mail-agent-communication)
10. [CASS: Memory System](#10-cass-memory-system)
11. [Agent Orchestration](#11-agent-orchestration)
12. [LangGraph Supervisor](#12-langgraph-supervisor)
13. [File Storage & Data Structures](#13-file-storage--data-structures)
14. [API Reference](#14-api-reference)
15. [Code Examples](#15-code-examples)
16. [Troubleshooting](#16-troubleshooting)
17. [Development Guide](#17-development-guide)
18. [Roadmap & Future](#18-roadmap--future)

---

# 1. Introduction

## What is Jetpack?

Jetpack is a **multi-agent orchestration system** that coordinates AI agents to work together on software development tasks. It integrates multiple open-source tools into a unified platform for software development at scale.

### Core Capabilities

| Capability | Description |
|------------|-------------|
| **Swarm Intelligence** | Agents autonomously claim tasks based on skills and availability |
| **Persistent Memory** | Git-backed tasks + SQLite memory for cross-session learning |
| **Safe Execution** | File leasing prevents concurrent modification conflicts |
| **Visual Oversight** | Real-time web dashboard for monitoring progress |
| **Multi-Stack Support** | 34+ tech stacks with language-specific agents |

### The Flywheel Integration

Jetpack combines concepts from the **Agentic Coding Tooling Flywheel** ecosystem:

- **Beads** (Steve Yegge) - Git-backed task management with dependency graphs
- **CASS Memory System** - Persistent agent memory with semantic search
- **MCP Agent Mail** - Inter-agent pub/sub messaging with file leasing
- **Claude Code Agent Farm** - Multi-agent orchestration across tech stacks

---

# 2. Quick Start

## 5-Minute Setup

### Step 1: Prerequisites

```bash
# Check Node.js version (needs >= 20.0.0)
node --version

# Check pnpm (needs >= 9.0.0)
pnpm --version

# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Set API key
export ANTHROPIC_API_KEY=your_key_here
```

### Step 2: Install Jetpack

```bash
# Clone and build
git clone https://github.com/spencerthomas/Jetpack.git
cd Jetpack
pnpm install
pnpm build
```

### Step 3: Initialize Your Project

```bash
cd /path/to/your/project
jetpack init
```

This creates:
```
your-project/
├── .beads/           # Task storage (commit this!)
│   ├── tasks/        # Drop .md files here
│   └── processed/    # Completed task files
├── .cass/            # Agent memory (gitignored)
├── .jetpack/
│   ├── config.json   # Settings
│   ├── plans/        # Plan storage
│   └── mail/         # Agent communication
└── CLAUDE.md         # Updated with Jetpack instructions
```

### Step 4: Start Jetpack

```bash
jetpack start
```

Browser opens to http://localhost:3002 with the Kanban board.

### Step 5: Create Your First Task

**Option A: Drop a markdown file**
```bash
cat > .beads/tasks/my-task.md << 'EOF'
---
title: Add hello world endpoint
priority: medium
skills: [typescript, backend]
---

Create a simple GET /hello endpoint that returns "Hello, World!"
EOF
```

**Option B: Use the CLI**
```bash
jetpack task -t "Add hello world endpoint" -p medium -s typescript,backend
```

**Option C: Use the Web UI**
Click "New Task" in the Kanban board.

---

# 3. Installation

## Option 1: Install from npm (Recommended)

```bash
# Install globally
npm install -g @jetpack/cli

# Use from anywhere
jetpack start --agents 3
```

## Option 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/spencerthomas/Jetpack.git
cd Jetpack

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run via pnpm
pnpm jetpack start --agents 3
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | For Claude | Claude API key for supervisor and agents |
| `OPENAI_API_KEY` | For OpenAI | OpenAI API key (supervisor or embeddings) |
| `JETPACK_WORK_DIR` | For external projects | **Critical:** Points to target project directory |

```bash
export ANTHROPIC_API_KEY=your_key   # for Claude
export OPENAI_API_KEY=your_key      # for OpenAI
export JETPACK_WORK_DIR=/path       # target project directory
```

**Note:** `JETPACK_WORK_DIR` is essential when:
- Running the web UI on a different project
- Using the MCP server with Claude Code
- Agents should work on an external codebase

---

# 4. CLI Commands Reference

## Command Overview

| Command | Description | Example |
|---------|-------------|---------|
| `init` | Initialize Jetpack in a project | `jetpack init -a 5 -p 3005` |
| `start` | Start orchestrator + agents + web UI | `jetpack start -a 5` |
| `task` | Create a new task | `jetpack task -t "Fix bug" -p high` |
| `status` | Show system status | `jetpack status` |
| `demo` | Run guided demo workflow | `jetpack demo --agents 5` |
| `supervise` | AI-powered task breakdown | `jetpack supervise "Build auth"` |
| `mcp` | Start MCP server for Claude Code | `jetpack mcp --dir /path` |

## Detailed Command Usage

### `jetpack init`

Initialize Jetpack in a project directory.

```bash
jetpack init                    # Use defaults
jetpack init -a 5 -p 3005      # 5 agents, port 3005
```

**Creates:**
- `.beads/` - Task storage (git-tracked)
- `.beads/tasks/` - Drop `.md` files here to create tasks
- `.cass/` - Agent memory
- `.jetpack/config.json` - Project configuration
- Updates `CLAUDE.md` with usage instructions

### `jetpack start`

Start the full Jetpack system.

```bash
jetpack start                   # Uses config defaults
jetpack start -a 5              # Override: 5 agents
jetpack start --no-browser      # Don't auto-open browser
jetpack start --no-ui           # CLI-only mode
jetpack start -d /path/to/project  # Specify project directory
```

**Launches:**
1. Orchestrator - coordinates agent work
2. AI Agents - execute tasks (default: 3)
3. Web UI - http://localhost:3002
4. File watcher - monitors `.beads/tasks/` for new task files

### `jetpack task`

Create a new task.

```bash
# Simple task
jetpack task --title "Fix login bug"

# Complex task
jetpack task \
  --title "Add dark mode support" \
  --description "Implement theme switching across the app" \
  --priority high \
  --skills react,frontend,typescript \
  --estimate 45
```

### `jetpack status`

Get current system status.

```bash
jetpack status

# Output example:
# === Jetpack Status ===
#
# Agents:
#   agent-1: busy
#     Working on: bd-a1b2
#   agent-2: idle
#   agent-3: busy
#     Working on: bd-c3d4
#
# Tasks:
#   Total: 10
#   Pending: 3
#   In Progress: 2
#   Completed: 5
#   Failed: 0
```

### `jetpack supervise`

Use AI supervisor for complex requests.

```bash
# With Claude (default)
jetpack supervise "Add a REST API for user management" --llm claude

# With OpenAI
jetpack supervise "Implement dark mode" --llm openai --model gpt-4-turbo

# With Ollama (local)
jetpack supervise "Fix the login bug" --llm ollama --model llama2
```

### `jetpack demo`

Run a guided demo with interconnected tasks.

```bash
jetpack demo --agents 5

# Creates:
# 1. Set up project structure
# 2. Implement API (depends on #1)
# 3. Create UI (depends on #1)
# 4. Write tests (depends on #2, #3)
# 5. Documentation (depends on #2, #3)
```

---

# 5. Architecture Deep Dive

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    LANGGRAPH SUPERVISOR                      │
│              (Optional - for high-level requests)            │
│  Planner → Assigner → Monitor → Coordinator (loop)          │
└──────────────────────────┬──────────────────────────────────┘
                           │ creates tasks, monitors progress
┌──────────────────────────▼──────────────────────────────────┐
│                   JETPACK ORCHESTRATOR                       │
│         Coordinates adapters and agent lifecycle             │
└───────┬─────────────────┬─────────────────┬─────────────────┘
        │                 │                 │
┌───────▼───────┐ ┌───────▼───────┐ ┌───────▼───────┐
│     BEADS     │ │   MCP MAIL    │ │     CASS      │
│  Task Queue   │ │  Agent Inbox  │ │ Shared Memory │
│  (JSONL)      │ │  (Pub/Sub)    │ │  (SQLite)     │
└───────────────┘ └───────────────┘ └───────────────┘
        ▲                 ▲                 ▲
        └─────────────────┼─────────────────┘
                          │
              ┌───────────▼───────────┐
              │   AGENT CONTROLLERS   │
              │  (1-N worker agents)  │
              └───────────────────────┘
```

## Core Components

### JetpackOrchestrator

The central coordination layer that manages all adapters and agent lifecycle.

```
JetpackOrchestrator (packages/orchestrator)
├── BeadsAdapter     - Git-backed task management with dependency graphs
├── CASSAdapter      - SQLite-based persistent agent memory (better-sqlite3)
├── MCPMailAdapter   - File-based inter-agent pub/sub messaging + file leasing
└── AgentController  - Individual agent lifecycle (claim tasks, execute, report)
```

### Component Responsibilities

| Component | Purpose | Storage |
|-----------|---------|---------|
| **Beads** | Persistent task queue with dependency tracking | `.beads/tasks.jsonl` |
| **MCP Mail** | Pub/sub messaging between agents | `.jetpack/mail/` |
| **CASS** | Vector-based semantic memory for context | `.cass/memory.db` |
| **Orchestrator** | Coordinates adapters and agent lifecycle | In-memory |
| **Supervisor** | LLM-powered planning and conflict resolution | In-memory |

## Package Structure

```
jetpack/
├── packages/
│   ├── shared/             # Common types and utilities (Zod schemas)
│   ├── beads-adapter/      # Git-backed task management
│   ├── mcp-mail-adapter/   # Inter-agent communication
│   ├── cass-adapter/       # Persistent memory system
│   ├── orchestrator/       # Core coordination engine
│   ├── mcp-server/         # MCP server for Claude Code
│   ├── supervisor/         # LangGraph-based orchestration
│   └── quality-adapter/    # Regression detection
├── apps/
│   ├── cli/               # Command-line interface
│   └── web/               # Next.js Kanban UI
└── .beads/                # Task storage (git-backed)
    .cass/                 # Memory database
    .jetpack/              # Agent communication + plans
```

## Data Flow

### Task Lifecycle

```
User Request → Jetpack Orchestrator
              ↓
         Beads (create tasks)
              ↓
    CASS (load context) → MCP Mail (broadcast)
              ↓
   Agent Farm (assign agents)
              ↓
    Execute via Claude Code CLI
              ↓
   Validate output → Beads (update status)
              ↓
    CASS (store learnings)
```

### Multi-Agent Coordination

```
Agent A: Beads (claim task) → MCP Mail (notify)
Agent B: MCP Mail (receive) → CASS (check dependencies)
Agent C: Monitor progress → Rebalance if needed
All: Learn from history via CASS
```

---

# 6. Web UI Documentation

The web UI at http://localhost:3002 provides visual oversight of the multi-agent system.

## Features Overview

- **8 Pages**: Board, Inbox, Agents, Plans, Projects, Memory, Supervisor, Settings
- **Dark Theme**: Default dark mode with cyan accent (`rgb(79, 255, 238)`)
- **Real-time Updates**: Auto-refresh every 2 seconds
- **Responsive Design**: Optimized for desktop with sidebar navigation

## Pages

### Board (/board)

Dual-view task management interface with Kanban and hierarchical tree views.

**Kanban View:**
- 6 status columns: Pending, Ready, Claimed, In Progress, Completed, Failed
- Drag-and-drop between columns to update task status
- Priority badges (low/medium/high/critical) with color coding
- Skill tags for task requirements

**Tree View:**
- Hierarchical task display with ASCII connectors (│├└)
- Task type labels with colors:
  - **Epic** (purple) - Top-level parent tasks
  - **Task** (blue) - Mid-level tasks with children
  - **Sub-task** (gray) - Nested tasks
  - **Leaf** (green) - Bottom-level tasks without children
- Progress bars with completion percentages
- Expand/collapse subtask hierarchies
- Hierarchical IDs (e.g., `bd-a1b2.1.1`)

### Inbox (/inbox)

3-panel mail interface for agent communication.

**Left Panel - Categories:**
- All messages
- Unread only
- Task events (created, claimed, completed, failed)
- Agent status (started, stopped, heartbeat)
- Coordination messages
- Threads (grouped conversations)

**Middle Panel - Message List:**
- Type badges: Completed (green), Failed (red), Claimed (yellow), Started (blue)
- Agent attribution with avatar initials
- Relative timestamps (e.g., "2m ago")
- Full-text search functionality
- Read/unread state tracking

**Right Panel - Message Detail:**
- Full message content and metadata
- JSON payload viewer with formatting
- Reply and archive actions
- Correlation ID for thread tracking

### Agents (/agents)

Agent lifecycle visualization and management.

**Agent Cards:**
- Status indicators: idle (gray), busy (cyan), offline (red), error (orange)
- Current task display with ID and title
- Skills badges (typescript, react, backend, etc.)
- Tasks completed counter
- Last heartbeat timestamp

**Lifecycle Phases:**
```
idle → looking → claiming → retrieving → executing → storing → publishing → complete
```
- Visual phase progress bar
- Terminal-style execution logs
- Real-time phase updates

**Agent Spawning:**
- Harness selection: Claude Code, Codex CLI, Gemini CLI
- Skills configuration checkboxes
- Real-time spawn feedback

### Plans (/plans)

Plan creation, template management, and workflow execution.

**Features:**
- Plan list with status filters (all/active/templates)
- Create new plans with task breakdown
- Set dependencies between planned tasks
- Estimated duration calculations
- Tag-based organization
- Template system for reusable workflows
- Execute plans to create actual tasks

**Plan Statuses:**
- `draft` - Plan being created
- `approved` - Ready for execution
- `executing` - Tasks being created
- `completed` - All tasks finished
- `failed` - Execution error

### Projects (/projects)

Project overview and progress tracking.

- Project cards with status badges
- Task completion progress bars
- Link to associated plans
- Connection status indicator

### Memory (/memory)

CASS memory system dashboard for viewing and managing agent memories.

**Statistics Cards:**
- Total entries count
- Type distribution breakdown (bar chart)
- Average importance score (0-1)
- Total access count
- Embedding coverage percentage

**Memory Types (with colors):**
- `codebase_knowledge` (cyan) - Project structure understanding
- `agent_learning` (green) - Patterns from completed tasks
- `pattern_recognition` (purple) - Recognized code patterns
- `conversation_history` (blue) - Past interactions
- `decision_rationale` (orange) - Why choices were made

**Actions:**
- **Backfill Embeddings**: Generate vector embeddings for entries without them
- **Compact Memory**: Remove low-importance entries below threshold

**Memory Browser:**
- Filter by type with toggle buttons
- Selected memory detail view
- Content preview with full expansion
- Importance score, access count, timestamps

### Supervisor (/supervisor)

LangGraph supervisor execution monitor for intelligent orchestration.

**LangGraph Visualization:**
```
Planner → Assigner → Monitor → Coordinator (loop back)
```
- Node diagram with real-time highlighting
- Active node indicator during execution
- Feedback loop visualization for conflict resolution

**Request Queue:**
- Submit new requests with text input
- Priority selection: low, medium, high, critical
- Queue status display: pending/processing/completed/failed
- Execution history with timestamps

**Metrics Dashboard:**
- Current iteration count
- Tasks created/completed/failed
- Conflicts resolved
- Final report display

### Settings (/settings)

System configuration interface.

**CASS Embedding Configuration:**
- Auto-generate embeddings toggle (on/off)
- Embedding model selection:
  - `text-embedding-3-small` (default, fastest)
  - `text-embedding-3-large` (highest quality)
  - `text-embedding-ada-002` (legacy)
- OpenAI API key management (masked input)
- Dimensions configuration

**Memory Settings:**
- Compaction threshold (0.0-1.0 slider)
- Max entries limit
- **Hot Reload**: Changes apply immediately without restart

## Color Scheme

**Theme:** Dark mode default with cyan accent

**Primary Colors:**
| Name | Value | Usage |
|------|-------|-------|
| Accent | `rgb(79, 255, 238)` | Primary actions, highlights |
| Background | `#09090b` | Page background |
| Card | `#18181b` | Card backgrounds |
| Border | `#27272a` | Borders, dividers |

**Task Type Colors:**
| Type | Color | Hex |
|------|-------|-----|
| Epic | Purple | `#a855f7` |
| Task | Blue | `#3b82f6` |
| Sub-task | Gray | `#8b8b8e` |
| Leaf | Green | `#22c55e` |

**Status Colors:**
| Status | Color |
|--------|-------|
| Pending | Gray |
| Ready | Blue |
| Claimed | Yellow |
| In Progress | Cyan |
| Completed | Green |
| Failed | Red |

## Starting the Web UI

### With Jetpack CLI (Recommended)

```bash
jetpack start
# Browser opens automatically to http://localhost:3002
```

### Standalone Development

```bash
cd apps/web
pnpm dev
# Visit http://localhost:3000
```

### With External Project

```bash
# Point to your project (critical for correct data loading)
JETPACK_WORK_DIR=/path/to/your/project pnpm dev

# Example
JETPACK_WORK_DIR=/Users/tom/dev/my-app pnpm dev -p 3002
```

**Important:** The `JETPACK_WORK_DIR` environment variable tells all API routes where to find:
- `.beads/tasks.jsonl` - Task storage
- `.cass/memory.db` - Agent memory database
- `.jetpack/plans/` - Plan files
- `.jetpack/mail/` - Agent messages

---

# 7. Claude Code Integration (MCP Server)

Jetpack includes an MCP server that makes **Claude Code a first-class Jetpack client**. Plans and tasks sync bidirectionally between Claude Code and the web UI.

## Quick Setup

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

## Available MCP Tools

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

---

# 8. Beads: Task Management

Beads is the persistent task storage system with dependency tracking and git-backed storage.

## Key Concepts

### Task States

```
pending → ready → claimed → in_progress → completed
                                        ↘ failed
                                        ↘ blocked (dependencies not met)
```

### Task Structure

```json
{
  "id": "bd-a1b2c3d4",
  "title": "Implement authentication",
  "description": "Add JWT-based auth system",
  "status": "in_progress",
  "priority": "high",
  "requiredSkills": ["typescript", "backend"],
  "dependencies": [],
  "estimatedMinutes": 45,
  "createdAt": "2024-01-13T00:00:00Z",
  "claimedBy": "agent-1"
}
```

## API Usage

```typescript
const beads = jetpack.getBeadsAdapter();

// Create a task
const task = await beads.createTask({
  title: 'Implement login',
  description: 'Add JWT-based authentication',
  priority: 'high',
  requiredSkills: ['typescript', 'backend'],
  dependencies: [],  // IDs of tasks that must complete first
});

// Get tasks ready for execution (dependencies satisfied)
const readyTasks = await beads.getReadyTasks();

// Atomically claim a task (prevents race conditions)
const claimed = await beads.claimTask(taskId, agentId);

// Update task status
await beads.updateTask(taskId, {
  status: 'completed',
  completedAt: new Date(),
});

// Build task dependency graph
const graph = await beads.buildTaskGraph();
```

## Creating Tasks via Files

Drop a markdown file in `.beads/tasks/`:

```markdown
---
title: Implement user authentication
priority: high
skills: [typescript, backend]
estimate: 30
---

Create JWT-based authentication with login/logout endpoints.

## Requirements
- Use bcrypt for password hashing
- JWT tokens expire after 24 hours
- Include refresh token mechanism
```

The file is automatically:
1. Detected by the file watcher
2. Converted to a task
3. Moved to `processed/`

## Task Dependencies

```typescript
// Create tasks with dependencies
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

---

# 9. MCP Mail: Agent Communication

MCP Mail provides pub/sub messaging between agents with file leasing for concurrent safety.

## Message Types

| Type | Description |
|------|-------------|
| `task.created` | New task available for claiming |
| `task.claimed` | Agent claimed a task |
| `task.assigned` | Supervisor assigned task to agent |
| `task.completed` | Task finished successfully |
| `task.failed` | Task execution failed |
| `agent.started` | Agent came online |
| `agent.stopped` | Agent went offline |
| `heartbeat` | Agent liveness signal |
| `file.lock` / `file.unlock` | File leasing for concurrent safety |

## API Usage

```typescript
const mail = jetpack.getMCPMailAdapter();

// Subscribe to events
mail.subscribe('task.created', async (message) => {
  console.log('New task:', message.payload.title);
});

// Publish a message
await mail.publish({
  type: 'task.claimed',
  from: agentId,
  payload: { taskId, agentName: 'Agent-1' },
  timestamp: new Date(),
});

// Send heartbeat (keeps agent registered as alive)
await mail.sendHeartbeat();
```

## File Leasing System

Prevents agents from overwriting each other's work.

**Storage:** `.jetpack/mail/leases.json`

**Lease Format:**
```json
[
  {
    "path": "src/components/Button.tsx",
    "agentId": "agent-1",
    "timestamp": "2024-01-11T19:00:00Z",
    "expiresAt": "2024-01-11T19:01:00Z"
  }
]
```

**How It Works:**

```
Agent-1 wants to edit Button.tsx
    │
    ▼
acquireLease("src/components/Button.tsx", 60000)
    │
    ├─► Load leases.json from disk
    ├─► Check if file already leased by another agent
    │      └─► If yes: RETURN FALSE (blocked)
    │      └─► If no: Continue
    ├─► Create lease with 60s expiry
    ├─► Save to leases.json
    └─► RETURN TRUE (acquired)

Agent-1 edits file...
    │
    ▼
releaseLease("src/components/Button.tsx")
    │
    └─► Remove from leases.json
```

**API:**

```typescript
const mail = jetpack.getMCPMailAdapter();

// Acquire a lease (blocks other agents)
const acquired = await mail.acquireLease("src/Button.tsx", 60000);
if (!acquired) {
  // File is locked by another agent - skip or wait
}

// Check if file is leased
const { leased, agentId } = await mail.isLeased("src/Button.tsx");

// Extend lease for long operations
await mail.renewLease("src/Button.tsx", 60000);

// Release when done
await mail.releaseLease("src/Button.tsx");
```

**Key Features:**

| Feature | How It Works |
|---------|--------------|
| **Shared state** | `leases.json` on disk - all agents read/write same file |
| **Auto-expiry** | Leases expire after duration (default 60s) |
| **Cleanup** | Every 60s, expired leases are removed |
| **Renewal** | Long tasks can call `renewLease()` to extend |
| **Graceful shutdown** | Agent releases all its leases on `close()` |

---

# 10. CASS: Memory System

CASS (Context-Aware Semantic Storage) stores vector embeddings for semantic search. Agents use it to retrieve relevant context from past work.

## Memory Types

| Type | Description |
|------|-------------|
| `codebase_knowledge` | Understanding of project structure |
| `agent_learning` | Patterns learned from completed tasks |
| `pattern_recognition` | Recognized code patterns |
| `conversation_history` | Past interactions |
| `decision_rationale` | Why certain choices were made |

## API Usage

```typescript
const cass = jetpack.getCASSAdapter();

// Store a memory
await cass.store({
  type: 'agent_learning',
  content: 'Implemented auth using JWT with 24h expiry',
  importance: 0.8,  // 0-1 scale
  metadata: { taskId, skills: ['backend', 'security'] },
});

// Semantic search for relevant context
const memories = await cass.search('authentication patterns', 5);
// Returns top 5 most relevant memories

// Get memories by type
const patterns = await cass.getByType('pattern_recognition', 10);

// Get recent memories
const recent = await cass.getRecentMemories(20);

// Get statistics
const stats = await cass.getStats();
// { total: 150, byType: {...}, avgImportance: 0.65 }

// Compact low-importance memories
const removed = await cass.compact(0.4); // Remove below 0.4 importance

// Backfill embeddings
const result = await cass.backfillEmbeddings(10); // Batch size 10
```

## Configuration

```typescript
// Hot-reload configuration (no restart needed)
await cass.reconfigure({
  autoGenerateEmbeddings: true,
  embeddingModel: 'text-embedding-3-large',
  maxEntries: 10000,
  compactionThreshold: 0.4,
});
```

---

# 11. Agent Orchestration

## Agent Controller Lifecycle

Each agent is an autonomous worker that claims and executes tasks using Claude Code CLI.

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

## ClaudeCodeExecutor

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

**Command:**
```bash
claude --print --dangerously-skip-permissions "<task prompt>"
```

## Agent Skills

```typescript
type AgentSkill =
  | 'typescript' | 'javascript' | 'python' | 'rust' | 'go'
  | 'react' | 'vue' | 'angular' | 'svelte'
  | 'backend' | 'frontend' | 'database' | 'devops'
  | 'testing' | 'documentation' | 'security';
```

---

# 12. LangGraph Supervisor

The Supervisor uses LangGraph to break down high-level requests into tasks and coordinate their execution.

## Graph Structure

```
START → PlannerNode → AssignerNode → MonitorNode ─┬→ END (all done)
                            ▲                     │
                            └── CoordinatorNode ◄─┘ (conflicts)
```

## Node Responsibilities

| Node | Input | Output | LLM Used |
|------|-------|--------|----------|
| **Planner** | User request | Task breakdown with dependencies | Yes |
| **Assigner** | Tasks + Agents | Task-to-agent assignments | No |
| **Monitor** | Current state | Status updates, blocked tasks | No |
| **Coordinator** | Conflicts/failures | Reassignments, unblock actions | Yes |

## Execution Flow Example

```bash
jetpack supervise "Build user authentication" --agents 3
```

1. **PlannerNode** calls Claude to decompose:
   ```
   Request: "Build user authentication"

   Planned Tasks:
   1. "Create user model and database schema" (skills: database)
   2. "Implement JWT token generation" (skills: backend, security)
   3. "Build login/register API endpoints" (skills: backend) [depends: 1, 2]
   4. "Create login form component" (skills: react, frontend) [depends: 3]
   5. "Write authentication tests" (skills: testing) [depends: 3, 4]
   ```

2. **AssignerNode** matches tasks to agents:
   ```
   Agent-1 (skills: backend, database) → Task 1
   Agent-2 (skills: backend, security) → Task 2
   Agent-3 (skills: react, frontend)   → [waiting for Task 3]
   ```

3. **MonitorNode** polls for progress:
   - Task 1 completed → Task 3 still blocked (needs Task 2)
   - Task 2 completed → Task 3 now ready!
   - Assigns Task 3 to Agent-1 (now idle)

4. **CoordinatorNode** handles issues:
   - If Task 3 fails → reassign to different agent
   - If agent goes offline → redistribute tasks
   - If deadlock detected → replan dependencies

## Programmatic Usage

```typescript
const jetpack = new JetpackOrchestrator({ workDir: process.cwd() });
await jetpack.initialize();

// Create a supervisor with Claude
const supervisor = await jetpack.createSupervisor({
  provider: 'claude',
  model: 'claude-3-5-sonnet-20241022',
});

// Submit a high-level request
const result = await jetpack.supervise(
  "Build a user authentication system with login, logout, and password reset"
);

console.log('Tasks created:', result.tasksCreated);
console.log('Execution time:', result.executionTime);
console.log('Final report:', result.report);
```

---

# 13. File Storage & Data Structures

## Directory Structure

```
your-project/
├── .beads/                    # Task storage (git-backed)
│   ├── tasks.jsonl           # All tasks in JSON Lines format
│   ├── tasks/                # Drop .md files to create tasks
│   └── processed/            # Processed task files
├── .cass/                     # Agent memory (gitignored)
│   └── memory.db             # SQLite database with embeddings
├── .jetpack/
│   ├── config.json           # Project configuration
│   ├── settings.json         # CASS and system settings
│   ├── agents.json           # Agent registry
│   ├── plans/                # Plan JSON files
│   │   └── plan-{id}.json
│   └── mail/                 # Inter-agent messaging
│       ├── inbox/            # Messages to specific agents
│       ├── outbox/           # Broadcast messages
│       ├── archive/          # Processed messages
│       ├── sent/             # Sent message copies
│       └── leases.json       # File leases
└── src/                       # Your actual code
```

## Plan Structure

Plans stored in `.jetpack/plans/{plan-id}.json`:

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

## Task Structure

Tasks stored in `.beads/tasks.jsonl`:

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

## Key Types (packages/shared)

```typescript
// Task
interface Task {
  id: string;                    // "bd-XXXX"
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  requiredSkills: AgentSkill[];
  dependencies: string[];
  estimatedMinutes?: number;
  createdAt: Date;
  claimedBy?: string;
  completedAt?: Date;
}

// Agent
interface Agent {
  id: string;
  name: string;
  status: 'idle' | 'busy' | 'error' | 'offline';
  skills: AgentSkill[];
  currentTask?: string;
  tasksCompleted: number;
  lastHeartbeat: Date;
}

// Message
interface Message {
  id: string;
  type: MessageType;
  from: string;
  to?: string;
  payload: any;
  timestamp: Date;
  correlationId?: string;
}

// MemoryEntry
interface MemoryEntry {
  id: string;
  type: MemoryType;
  content: string;
  importance: number;        // 0-1
  embedding?: number[];
  metadata?: Record<string, any>;
  accessCount: number;
  createdAt: Date;
  lastAccessed: Date;
}
```

---

# 14. API Reference

## Web API Routes

### Tasks

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/tasks` | List all tasks |
| POST | `/api/tasks` | Create new task |
| PATCH | `/api/tasks/[id]` | Update task |
| DELETE | `/api/tasks/[id]` | Delete task |

### Agents

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/agents` | List all agents |
| POST | `/api/agents/spawn` | Spawn new agent with config |

### Messages

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/messages` | List MCP Mail messages |
| POST | `/api/messages/[id]/ack` | Acknowledge message |
| POST | `/api/messages/broadcast` | Broadcast to all agents |
| GET | `/api/messages/stream` | SSE real-time updates |

### Plans

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/plans` | List plans |
| POST | `/api/plans` | Create plan |
| GET | `/api/plans/[id]` | Get plan details |
| PUT | `/api/plans/[id]` | Update plan |
| DELETE | `/api/plans/[id]` | Delete plan |
| POST | `/api/plans/[id]/execute` | Execute plan |
| POST | `/api/plans/[id]/complete` | Mark complete |

### Memory (CASS)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/cass/stats` | Memory statistics |
| GET | `/api/cass/memories` | List memories with filtering |
| POST | `/api/cass/reconfigure` | Hot reload config |
| POST | `/api/cass/backfill` | Generate embeddings |
| POST | `/api/cass/compact` | Remove low-importance entries |

### Settings

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/settings` | Get current settings |
| POST | `/api/settings` | Update settings |

### System

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/status` | Full system status |
| POST | `/api/supervisor` | Submit supervisor request |

---

# 15. Code Examples

## Basic Workflow

### Simple Task Execution

```bash
# Start Jetpack
jetpack start --agents 2

# Create a simple task
jetpack task \
  --title "Add logging to API endpoints" \
  --priority medium \
  --skills typescript,backend

# Monitor progress
jetpack status
```

## Feature Development with Dependencies

```typescript
import { JetpackOrchestrator } from '@jetpack/orchestrator';

async function developFeature() {
  const jetpack = new JetpackOrchestrator({
    workDir: process.cwd(),
  });

  await jetpack.initialize();
  await jetpack.startAgents(5);

  // Step 1: Design & Planning
  const designTask = await jetpack.createTask({
    title: 'Design user profile feature',
    description: 'Create API spec and UI mockups',
    priority: 'high',
    requiredSkills: ['documentation'],
    estimatedMinutes: 20,
  });

  // Step 2: Database Schema (depends on design)
  const schemaTask = await jetpack.createTask({
    title: 'Create user profile database schema',
    priority: 'high',
    requiredSkills: ['database'],
    dependencies: [designTask.id],
    estimatedMinutes: 15,
  });

  // Step 3: Backend API (depends on schema)
  const apiTask = await jetpack.createTask({
    title: 'Implement user profile API endpoints',
    priority: 'high',
    requiredSkills: ['backend', 'typescript'],
    dependencies: [schemaTask.id],
    estimatedMinutes: 45,
  });

  // Step 4: Frontend Component (depends on design)
  const uiTask = await jetpack.createTask({
    title: 'Build user profile UI component',
    priority: 'medium',
    requiredSkills: ['frontend', 'react'],
    dependencies: [designTask.id],
    estimatedMinutes: 60,
  });

  // Step 5: Integration (depends on API and UI)
  const integrationTask = await jetpack.createTask({
    title: 'Integrate profile UI with API',
    priority: 'medium',
    requiredSkills: ['frontend', 'backend'],
    dependencies: [apiTask.id, uiTask.id],
    estimatedMinutes: 30,
  });

  // Step 6: Testing (depends on integration)
  const testTask = await jetpack.createTask({
    title: 'Write tests for user profile feature',
    priority: 'high',
    requiredSkills: ['testing'],
    dependencies: [integrationTask.id],
    estimatedMinutes: 45,
  });

  console.log('Feature development pipeline created!');
  console.log('6 tasks with proper dependencies');

  // Monitor until complete
  while (true) {
    const status = await jetpack.getStatus();
    if (status.tasks.completed === 6) {
      console.log('Feature development complete!');
      break;
    }
    console.log(`Progress: ${status.tasks.completed}/6 tasks completed`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  await jetpack.shutdown();
}
```

## File Leasing for Concurrent Safety

```typescript
import { MCPMailAdapter } from '@jetpack/mcp-mail-adapter';

async function fileLeasingExample() {
  const agent1Mail = new MCPMailAdapter({
    mailDir: './.jetpack/mail',
    agentId: 'agent-1',
  });

  const agent2Mail = new MCPMailAdapter({
    mailDir: './.jetpack/mail',
    agentId: 'agent-2',
  });

  await agent1Mail.initialize();
  await agent2Mail.initialize();

  // Agent 1 tries to lease a file
  const leased1 = await agent1Mail.acquireLease('src/utils/auth.ts', 60000);
  console.log('Agent 1 lease:', leased1); // true

  // Agent 2 tries to lease the same file
  const leased2 = await agent2Mail.acquireLease('src/utils/auth.ts', 60000);
  console.log('Agent 2 lease:', leased2); // false - already leased

  // Agent 1 does work...
  console.log('Agent 1 is editing the file...');

  // Agent 1 releases the lease
  await agent1Mail.releaseLease('src/utils/auth.ts');

  // Now Agent 2 can lease it
  const leased2Again = await agent2Mail.acquireLease('src/utils/auth.ts', 60000);
  console.log('Agent 2 lease (retry):', leased2Again); // true

  await agent1Mail.shutdown();
  await agent2Mail.shutdown();
}
```

## Using the Memory System

```typescript
import { JetpackOrchestrator } from '@jetpack/orchestrator';

async function memoryExample() {
  const jetpack = new JetpackOrchestrator({
    workDir: process.cwd(),
  });

  await jetpack.initialize();
  const cass = jetpack.getCASSAdapter();

  // Store knowledge about the codebase
  await cass.store({
    type: 'codebase_knowledge',
    content: 'The authentication system uses JWT tokens with 24-hour expiry',
    importance: 0.9,
    metadata: {
      module: 'auth',
      technology: 'jwt',
    },
  });

  await cass.store({
    type: 'pattern_recognition',
    content: 'All API endpoints follow RESTful conventions with /api/v1 prefix',
    importance: 0.8,
    metadata: {
      pattern: 'api-design',
    },
  });

  // Search for relevant memories
  const authMemories = await cass.search('authentication', 5);
  console.log('Auth-related memories:', authMemories);

  // Get memories by type
  const patterns = await cass.getByType('pattern_recognition', 10);
  console.log('Recognized patterns:', patterns);

  // Memory compaction (remove low-importance entries)
  const removed = await cass.compact(0.4);
  console.log(`Removed ${removed} low-importance memories`);

  await jetpack.shutdown();
}
```

## Using the Supervisor

```typescript
import { JetpackOrchestrator } from '@jetpack/orchestrator';

async function supervisorExample() {
  const jetpack = new JetpackOrchestrator({
    workDir: process.cwd(),
  });

  await jetpack.initialize();

  // Create a supervisor with Claude
  const supervisor = await jetpack.createSupervisor({
    provider: 'claude',
    model: 'claude-3-5-sonnet-20241022',
  });

  // Submit a high-level request
  const result = await jetpack.supervise(
    "Build a user authentication system with login, logout, and password reset"
  );

  console.log('Tasks created:', result.tasksCreated);
  console.log('Execution time:', result.executionTime);
  console.log('Final report:', result.report);

  await jetpack.shutdown();
}
```

---

# 16. Troubleshooting

## Build Issues

```bash
# Clean rebuild
pnpm clean && pnpm install && pnpm build

# Build specific package
pnpm --filter @jetpack/orchestrator build
```

## Web UI Shows Wrong/Old Data

1. Check `JETPACK_WORK_DIR` points to correct project
2. Restart the web server after changing the env var
3. Verify `.beads/`, `.cass/`, `.jetpack/` exist in target directory

## MCP Server Not Connecting

1. Ensure it's built: `pnpm build`
2. Check path in `.claude/settings.local.json`
3. Restart Claude Code after config changes
4. Run `/mcp` in Claude Code to verify

## Plans Not Appearing in UI

1. Check `.jetpack/plans/` directory exists
2. Verify JSON has all required fields: `id`, `title`, `status`, `items`
3. Each item needs: `id`, `title`, `status`, `priority`, `skills`, `dependencies`

## Agents Not Claiming Tasks

1. Check agent skills match task `requiredSkills`
2. Verify task status is `ready` (dependencies satisfied)
3. Look at MCP Mail logs in `.jetpack/mail/`

## No Tasks Showing

1. Ensure Jetpack backend is running (`jetpack start`)
2. Check `.beads/tasks.jsonl` exists in target project
3. Verify API is accessible at `/api/tasks`
4. If using standalone mode, ensure `JETPACK_WORK_DIR` is set correctly

## No Agents Showing

1. Confirm agents started with `jetpack start --agents N`
2. Check agent status with `jetpack status`
3. Note: Agent page shows "Click 'Spawn Agent' to start" when no agents exist

## Memory Page Shows No Data

1. Confirm `.cass/memory.db` exists in target project
2. **Critical:** Set `JETPACK_WORK_DIR` if working on external project
3. Check if any memories have been stored with `jetpack status`
4. Restart the web server after changing `JETPACK_WORK_DIR`

## "Claude CLI not found"

```bash
npm install -g @anthropic-ai/claude-code
```

## "ANTHROPIC_API_KEY not set"

```bash
export ANTHROPIC_API_KEY=your_key_here
# Add to ~/.bashrc or ~/.zshrc for persistence
```

## "Port 3002 already in use"

```bash
jetpack start -p 3005  # Use different port
# Or kill existing process:
lsof -i :3002 | awk 'NR>1 {print $2}' | xargs kill
```

---

# 17. Development Guide

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

# Run with coverage
pnpm test -- --coverage

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

## Key Files to Know

| File | Purpose |
|------|---------|
| `packages/orchestrator/src/JetpackOrchestrator.ts` | Main coordinator |
| `packages/orchestrator/src/AgentController.ts` | Agent lifecycle |
| `packages/orchestrator/src/ClaudeCodeExecutor.ts` | Spawns Claude CLI |
| `packages/shared/src/types/` | All TypeScript types |
| `apps/web/src/app/api/` | Next.js API routes |
| `apps/cli/src/commands/` | CLI command implementations |

## Extending with Custom Adapters

```typescript
// All adapters follow initialize/close pattern
class CustomAdapter {
  async initialize(): Promise<void> { /* setup */ }
  async close(): Promise<void> { /* cleanup */ }
}

// In JetpackOrchestrator
import { CustomAdapter } from '@jetpack/custom-adapter';

const custom = new CustomAdapter(config);
await custom.initialize();
```

## Tech Stack

- **Framework:** Next.js 15 with App Router
- **UI Library:** React 19
- **Styling:** Tailwind CSS with custom animations
- **Drag & Drop:** @dnd-kit/core, @dnd-kit/sortable
- **State:** Zustand
- **Icons:** lucide-react
- **Dates:** date-fns
- **TypeScript:** Strict mode
- **Build:** Turborepo with pnpm workspaces
- **Testing:** Vitest

---

# 18. Roadmap & Future

## Completed Features

- [x] **Kanban Web UI** - Modern drag-and-drop interface
- [x] **MCP Mail Inbox Viewer** - Real-time message monitoring
- [x] **LangGraph Supervisor** - Intelligent full orchestration with multi-LLM support
- [x] **Memory Dashboard** - CASS stats, visualization, and management
- [x] **Plan Management** - Create, execute, and template plan workflows
- [x] **Supervisor UI** - LangGraph node visualization and request queue
- [x] **Dark Mode** - Default dark theme with cyan accent
- [x] **Agent Spawning UI** - Multi-harness support (Claude Code, Codex, Gemini)
- [x] **Inbox Redesign** - 3-panel layout with threads and categories
- [x] **Hierarchical Tasks** - Tree view with Epic/Task/Sub-task/Leaf types
- [x] **Claude Code MCP Integration** - Bidirectional sync with web UI

## In Progress / Planned

- [ ] Integration with Named Tmux Manager for command orchestration
- [ ] Ultimate Bug Scanner adapter for quality gates
- [ ] WebSocket support for instant UI updates
- [ ] Task dependency graph visualization
- [ ] Session Search for learning from history
- [ ] Simultaneous Launch Button for safe multi-command execution
- [ ] Cloud-hosted agent farm
- [ ] GitHub Issues / Linear integration
- [ ] Agent performance metrics and leaderboards
- [ ] Mobile responsive design improvements

## Success Metrics

1. **Coordination Efficiency**: Time to distribute and complete multi-agent tasks
2. **Code Quality**: Bug scanner pass rates across agents
3. **Memory Utilization**: CASS memory compaction ratios
4. **Agent Utilization**: % time agents are productively working
5. **Conflict Rate**: File locking conflicts via MCP Mail

---

# Acknowledgments

This project integrates and builds upon amazing open-source work:

- **Jeffrey Emanuel** - Agentic Coding Tooling Flywheel ecosystem
  - Claude Code Agent Farm
  - Ultimate MCP Client
  - MCP Agent Mail
  - CASS Memory System
  - Beads Viewer
  - Named Tmux Manager
  - Simultaneous Launch Button
  - Ultimate Bug Scanner
  - Coding Agent Session Search

- **Steve Yegge** - Beads memory system for coding agents

## Links

- [Jeffrey Emanuel's Projects](https://www.jeffreyemanuel.com/projects)
- [Beads by Steve Yegge](https://github.com/steveyegge/beads)
- [Model Context Protocol](https://modelcontextprotocol.io)

---

**Built with love for the multi-agent development future**

*Last Updated: January 2025*
