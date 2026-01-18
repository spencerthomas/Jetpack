# 🚀 Jetpack - Multi-Agent Swarm Development Stack

> An integrated agentic development platform combining the best open-source tools into a unified multi-agent swarm system for software development at scale.

Jetpack combines the **Agentic Coding Tooling Flywheel** from Jeffrey Emanuel with **Steve Yegge's Beads** memory system to create a comprehensive multi-agent development environment.

## 🎯 What is Jetpack?

Jetpack is a **multi-agent orchestration system** that coordinates AI agents to work together on software development tasks. It integrates:

- **Beads** - Git-backed task management with dependency tracking
- **CASS Memory** - Persistent agent memory and learning
- **MCP Mail** - Inter-agent communication and file leasing
- **Agent Farm** - Multi-agent orchestration across tech stacks

## ✨ Key Features

### 🧠 Swarm Intelligence
- Agents autonomously claim tasks based on skills and availability
- Coordinate through message passing to prevent duplicate work
- Share knowledge through a collective memory system
- **NEW:** Dynamic skill acquisition - agents learn new skills at runtime

### 💾 Persistent Memory
- Beads stores task history and dependencies (git-backed)
- CASS stores semantic memory and learned patterns
- Agents learn from past work to improve over time
- **NEW:** Semantic search with vector embeddings for intelligent context retrieval

### 🔒 Safe Execution
- File leasing prevents concurrent modification conflicts
- Task dependencies ensure proper execution order
- Automatic rollback on failures
- **NEW:** Automatic file locking during task execution

### 📊 Visual Oversight
- Real-time task graph visualization
- Agent status monitoring
- Progress tracking and metrics
- **NEW:** TUI dashboard with tmux-style split panes for live agent output
- **NEW:** Quality metrics tracking with regression detection

### 🛠️ Multi-Stack Support
- 34+ tech stacks supported
- Language-specific agents (TypeScript, Python, Rust, Go)
- Extensible adapter architecture
- **NEW:** Auto-detection of project skills from codebase

### 🤖 Always-On Supervisor
- **NEW:** Supervisor starts automatically with background monitoring
- Detects unassigned tasks and notifies idle agents
- Auto-retries failed tasks with retry budget
- Recovers from stalled agents by reassigning work
- Branch-aware task filtering

## 🏗️ Architecture

Jetpack has a layered architecture with three core storage adapters and an optional LangGraph supervisor for intelligent orchestration:

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
│  (SQLite)     │ │  (Pub/Sub)    │ │  (Vector DB)  │
└───────────────┘ └───────────────┘ └───────────────┘
        ▲                 ▲                 ▲
        └─────────────────┼─────────────────┘
                          │
              ┌───────────▼───────────┐
              │   AGENT CONTROLLERS   │
              │  (1-N worker agents)  │
              └───────────────────────┘
```

### Component Overview

| Component | Purpose | Storage |
|-----------|---------|---------|
| **Beads** | Persistent task queue with dependency tracking | `.beads/tasks.jsonl` |
| **MCP Mail** | Pub/sub messaging between agents + file leasing | `.jetpack/mail/` |
| **CASS** | Vector-based semantic memory for context | `.cass/memory.db` |
| **Orchestrator** | Coordinates adapters and agent lifecycle | In-memory |
| **Supervisor** | LLM-powered planning with background monitoring | In-memory |
| **Quality Adapter** | Quality snapshots and regression detection | `.quality/metrics.db` |
| **CLI TUI** | Tmux-style terminal dashboard | In-memory |
| **Skill Registry** | Dynamic skill detection and matching | In-memory |

## 🚦 Quick Start

### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Claude Code CLI** - Agents use Claude Code to execute real work
  ```bash
  # Install Claude Code CLI (requires Anthropic API key)
  npm install -g @anthropic-ai/claude-code
  ```

### Installation

**Option 1: Install from npm (recommended)**

```bash
# Install globally
npm install -g @jetpack-agent/cli

# Now use from anywhere
jetpack start --agents 3
```

**Option 2: Build from source**

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

### Getting Started

```bash
# Initialize Jetpack in your project
jetpack init

# Start everything
jetpack start
```

**`jetpack init` creates:**
- `.beads/` - Task storage (git-tracked)
- `.beads/tasks/` - Drop `.md` files here to create tasks
- `.cass/` - Agent memory
- `.jetpack/config.json` - Project configuration
- Updates `CLAUDE.md` with usage instructions

**`jetpack start` launches:**
1. 🚀 Orchestrator - coordinates agent work
2. 🤖 AI Agents - execute tasks (default: 3)
3. 📺 Web UI - http://localhost:3002
4. 👀 File watcher - monitors `.beads/tasks/` for new task files

### Creating Tasks

**Option 1: Drop a markdown file**
```bash
# Create a file in .beads/tasks/my-task.md
```

```markdown
---
title: Implement user authentication
priority: high
skills: [typescript, backend]
estimate: 30
---

Create JWT-based authentication with login/logout endpoints.
```

The file is automatically converted to a task and moved to `processed/`.

**Option 2: CLI command**
```bash
jetpack task -t "Fix the login bug" -p high -s typescript
```

**Option 3: Web UI**
Use the Kanban board at http://localhost:3002

### CLI Commands Reference

| Command | Description | Example |
|---------|-------------|---------|
| `init` | Initialize Jetpack in a project | `jetpack init -a 5 -p 3005` |
| `start` | Start orchestrator + agents + web UI | `jetpack start -a 5` |
| `task` | Create a new task | `jetpack task -t "Fix bug" -p high` |
| `status` | Show system status | `jetpack status` |
| `demo` | Run guided demo workflow | `jetpack demo --agents 5` |
| `supervise` | AI-powered task breakdown | `jetpack supervise "Build auth"` |
| `mcp` | Start MCP server for Claude Code | `jetpack mcp --dir /path` |

### CLI Options

```bash
# Initialize with custom settings
jetpack init -a 5 -p 3005      # 5 agents, port 3005

# Start (reads from .jetpack/config.json)
jetpack start                   # Uses config defaults
jetpack start -a 5              # Override: 5 agents
jetpack start --no-browser      # Don't auto-open browser
jetpack start --no-ui           # CLI-only mode
jetpack start --tui             # Enable tmux-style TUI dashboard
jetpack start --no-supervisor   # Disable always-on supervisor
jetpack start --supervisor-interval 30000  # Supervisor check interval (ms)

# Task management
jetpack task -t "Title" -p high -s typescript,backend
jetpack status

# Run guided demo
jetpack demo --agents 5

# AI supervisor for complex requests
jetpack supervise "Build user authentication" --agents 5
```

### Runtime Modes

Jetpack supports four runtime modes for autonomous operation:

| Mode | Description | Use Case |
|------|-------------|----------|
| `infinite` | Never stops, runs continuously | Long-running dev environments |
| `idle-pause` | Pauses when no work, resumes on new tasks | Interactive development |
| `objective-based` | Runs until objective achieved (LLM-evaluated) | Goal-oriented sprints |
| `iteration-limit` | Stops after N iterations (default: 100) | Bounded execution |

Configure via settings UI at http://localhost:3002/settings or programmatically:

```typescript
const jetpack = new JetpackOrchestrator({
  runtimeSettings: {
    mode: 'objective-based',
    objective: 'Complete the authentication system with tests',
    objectiveCheckIntervalMs: 60000,
  },
});
```

---

## 🔗 Claude Code Integration (MCP Server)

Jetpack includes an MCP server that makes **Claude Code a first-class Jetpack client**. Plans and tasks sync bidirectionally between Claude Code and the web UI.

### Quick Setup

1. **Build Jetpack:**
   ```bash
   pnpm install && pnpm build
   ```

2. **Add to `.claude/settings.local.json`:**
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

3. **Restart Claude Code** and verify with `/mcp`

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `jetpack_list_plans` | List all plans |
| `jetpack_create_plan` | Create plan with task breakdown |
| `jetpack_list_tasks` | List tasks by status |
| `jetpack_claim_task` | Claim a task to work on |
| `jetpack_complete_task` | Mark task completed |
| `jetpack_sync_todos` | Sync Claude Code todos to Jetpack |

### Example Workflow

```
User: "Create a plan for building user authentication"

Claude: I'll use jetpack_create_plan to create a structured plan...

[Plan created with items: user model, JWT service, login endpoint, tests]

View in web UI: http://localhost:3002/plans
```

**Bidirectional sync means:**
- Plans created in Claude Code appear in the Jetpack web UI
- Tasks claimed in the web UI won't be re-claimed by Claude Code
- Progress visible in real-time on both sides

See [packages/mcp-server/README.md](packages/mcp-server/README.md) for full documentation.

### LangGraph Supervisor

The supervisor uses LangGraph to provide intelligent orchestration:

```bash
# With Claude (default)
jetpack supervise "Add a REST API for user management" --llm claude

# With OpenAI
jetpack supervise "Implement dark mode" --llm openai --model gpt-4-turbo

# With Ollama (local)
jetpack supervise "Fix the login bug" --llm ollama --model llama2
```

The supervisor:
1. **Plans** - Breaks down your request into specific tasks with dependencies
2. **Assigns** - Matches tasks to agents based on skills
3. **Monitors** - Tracks progress and detects issues
4. **Coordinates** - Resolves conflicts and reassigns failed tasks

**Environment Variables:**

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

### Web UI (Included with `jetpack start`)

The web UI launches automatically at http://localhost:3002 when you run `jetpack start`.

**Pages:**
- 📊 **Board** - Kanban + hierarchical tree view with task types (Epic/Task/Sub-task/Leaf)
- 📬 **Inbox** - 3-panel mail interface with threads, categories, and search
- 🤖 **Agents** - Lifecycle visualization with phase tracking and harness selection
- 📁 **Plans** - Create, execute, and template plan workflows
- 📂 **Projects** - Project overview and progress tracking
- 🧠 **Memory** - CASS dashboard with stats, filtering, backfill/compact actions
- 🎯 **Supervisor** - LangGraph node visualization and request queue
- ⚙️ **Settings** - CASS embedding config and system preferences
- ⌨️ **Keyboard shortcuts** - Navigate with Cmd+K, G+I, G+B, etc.

**Manual start (if needed):**
```bash
# If you need to start the web UI separately
cd apps/web && pnpm dev -p 3002
```

## 📂 Working with Existing Projects

Jetpack works **on the local machine** in the folder you specify. It creates hidden folders inside your project directory to store tasks, memory, and agent communication.

### How It Works

When you run Jetpack on a project:

```bash
pnpm jetpack start --dir /path/to/your/project --agents 3
```

Jetpack creates **hidden folders inside your project directory**:

```
/your-project/
├── .beads/              # Task storage (JSONL, git-backed)
│   └── tasks.jsonl      # All tasks with dependencies, status, etc.
├── .cass/               # Agent memory (SQLite)
│   └── memory.db        # Learnings, codebase knowledge, embeddings
├── .jetpack/
│   ├── mail/            # Inter-agent messaging
│   │   ├── inbox/       # Messages to specific agents
│   │   ├── outbox/      # Broadcast messages
│   │   ├── archive/     # Processed messages
│   │   └── sent/        # Sent message copies
│   ├── agents.json      # Agent registry (status, heartbeats)
│   └── settings.json    # Configuration
└── src/                 # Your actual code (agents work here)
```

### Key Points

| Aspect | Behavior |
|--------|----------|
| **Code location** | Your local machine, in the specified `--dir` |
| **Data storage** | Hidden folders (`.beads/`, `.cass/`, `.jetpack/`) inside your project |
| **Agent execution** | Local Claude Code CLI processes with `--dangerously-skip-permissions` |
| **Isolation** | Each project has its own task/memory/message stores |
| **Git-friendly** | `.beads/` can be committed to track task history |

### Example: Starting on an Existing Project

```bash
# Navigate to your project
cd /Users/tom/dev/my-app

# Start Jetpack with 3 agents
pnpm jetpack start --agents 3

# Or specify the directory explicitly from anywhere
pnpm jetpack start --dir /Users/tom/dev/my-app --agents 3
```

The agents then work directly on your codebase, creating and editing files just like you would.

### Multiple Projects

Each project maintains its own isolated state:

```bash
# Project A - has its own .beads/, .cass/, .jetpack/
pnpm jetpack start --dir /path/to/project-a --agents 3

# Project B - completely separate state
pnpm jetpack start --dir /path/to/project-b --agents 5
```

---

## 📖 Usage Examples

### Starting the System

```bash
# Start everything (orchestrator + 3 agents + web UI)
jetpack start

# Start with more agents
jetpack start -a 5

# Start in a specific project directory
jetpack start -d /path/to/project

# Start without opening browser
jetpack start --no-browser

# CLI-only mode (no web UI)
jetpack start --no-ui
```

### Creating Tasks

```bash
# Simple task
jetpack task --title "Fix login bug"

# Complex task with dependencies
jetpack task \
  --title "Add dark mode support" \
  --description "Implement theme switching across the app" \
  --priority high \
  --skills react,frontend,typescript \
  --estimate 45
```

### Monitoring Progress

```bash
# Get current status
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

### Demo Workflow

```bash
# Run a complete demo with 5 agents
jetpack demo --agents 5

# This creates interconnected tasks:
# 1. Set up project structure
# 2. Implement API (depends on #1)
# 3. Create UI (depends on #1)
# 4. Write tests (depends on #2, #3)
# 5. Documentation (depends on #2, #3)
```

## 🔍 Deep Dive: How Jetpack Works

This section provides detailed explanations of each component and how they work together.

### Beads (Task Queue)

Beads is the persistent task storage system. It manages the task lifecycle and dependency tracking.

**Key Operations:**
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
```

**Task States:**
```
pending → in_progress → completed
                     ↘ failed
                     ↘ blocked (dependencies not met)
```

---

### MCP Mail (Agent Communication)

MCP Mail provides pub/sub messaging between agents. Agents subscribe to events and publish their own messages.

**Message Types:**
| Type | Description |
|------|-------------|
| `task.created` | New task available for claiming |
| `task.claimed` | Agent claimed a task |
| `task.assigned` | Supervisor assigned task to agent |
| `task.completed` | Task finished successfully |
| `task.failed` | Task execution failed |
| `agent.started` | Agent came online |
| `agent.stopped` | Agent went offline |
| `file.lock` / `file.unlock` | File leasing for concurrent safety |

**Usage:**
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

---

### CASS (Shared Memory)

CASS (Context-Aware Semantic Storage) stores vector embeddings for semantic search. Agents use it to retrieve relevant context from past work.

**Memory Types:**
- `codebase_knowledge` - Understanding of project structure
- `agent_learning` - Patterns learned from completed tasks
- `conversation_history` - Past interactions
- `decision_rationale` - Why certain choices were made

**Usage:**
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

// Get statistics
const stats = await cass.getStats();
// { total: 150, byType: {...}, avgImportance: 0.65 }
```

---

### Agent Controller (Worker)

Each agent is an autonomous worker that claims and executes tasks using **Claude Code CLI**. The AgentController manages the agent lifecycle and spawns Claude Code processes for real work.

**Agent Lifecycle:**
```
1. start()
   ├── Subscribe to MCP Mail events
   ├── Start heartbeat (every 30s)
   └── Begin lookForWork() loop

2. lookForWork()
   ├── Get ready tasks from Beads
   ├── Filter by agent skills
   ├── Sort by priority
   └── Claim highest priority match

3. executeTask()
   ├── Retrieve context from CASS
   ├── Spawn Claude Code CLI with task prompt
   ├── Claude Code makes actual code changes
   ├── Capture output and detect success/failure
   ├── Store learnings in CASS
   └── Publish completion via MCP Mail

4. Loop back to lookForWork()
```

**Claude Code Execution:**

Each agent spawns a Claude Code process to do real work:

```bash
claude --print --dangerously-skip-permissions "<task prompt>"
```

The prompt includes:
- Task title, description, and priority
- Required skills
- Relevant memories from CASS (past learnings)
- Instructions to follow existing patterns

**Agent Skills:**
```typescript
type AgentSkill =
  | 'typescript' | 'javascript' | 'python' | 'rust' | 'go'
  | 'react' | 'vue' | 'angular' | 'svelte'
  | 'backend' | 'frontend' | 'database' | 'devops'
  | 'testing' | 'documentation' | 'security';
```

**Requirements:**
- Claude Code CLI must be installed (`claude` command available)
- Valid Anthropic API key configured for Claude Code

---

### File Locking (Lease System)

Jetpack uses a **lease-based file locking system** via MCP Mail to prevent agents from overwriting each other's work.

**Storage:**
```
.jetpack/mail/leases.json
```

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

**Key Features:**

| Feature | How It Works |
|---------|--------------|
| **Shared state** | `leases.json` on disk - all agents read/write same file |
| **Auto-expiry** | Leases expire after duration (default 60s) |
| **Cleanup** | Every 60s, expired leases are removed |
| **Renewal** | Long tasks can call `renewLease()` to extend |
| **Graceful shutdown** | Agent releases all its leases on `close()` |

**API Usage:**
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

**Conflict Handling:**
- If an agent tries to edit a file another agent is working on, `acquireLease()` returns `false`
- The blocked agent logs a warning and looks for other work
- If an agent crashes, leases auto-expire after 60s
- Long-running tasks should call `renewLease()` periodically

---

### LangGraph Supervisor (Orchestration)

The Supervisor uses LangGraph to break down high-level requests into tasks and coordinate their execution.

**Graph Structure:**
```
START → PlannerNode → AssignerNode → MonitorNode ─┬→ END (all done)
                            ▲                     │
                            └── CoordinatorNode ◄─┘ (conflicts)
```

**Node Responsibilities:**

| Node | Input | Output | LLM Used |
|------|-------|--------|----------|
| **Planner** | User request | Task breakdown with dependencies | Yes |
| **Assigner** | Tasks + Agents | Task-to-agent assignments | No |
| **Monitor** | Current state | Status updates, blocked tasks | No |
| **Coordinator** | Conflicts/failures | Reassignments, unblock actions | Yes |

**Execution Flow Example:**

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

---

## 🎯 Use Case Examples

### Use Case 1: Feature Development

**Scenario:** Build a complete feature with multiple components

```bash
jetpack supervise "Add user profile page with avatar upload" --agents 5
```

**What happens:**
1. Supervisor breaks into: API endpoint, file upload, UI component, tests
2. Backend agent handles API while frontend agent waits
3. Once API ready, frontend agent builds UI
4. Test agent writes integration tests last
5. All coordinated automatically

---

### Use Case 2: Bug Investigation & Fix

**Scenario:** Fix a bug that spans multiple files

```bash
jetpack supervise "Fix the race condition in checkout flow" --agents 3
```

**What happens:**
1. Supervisor creates investigation task first
2. Agent retrieves context from CASS about checkout code
3. Creates fix tasks based on investigation
4. Assigns to agents with relevant skills
5. Monitors until fix verified

---

### Use Case 3: Parallel Refactoring

**Scenario:** Large-scale code refactoring

```bash
jetpack supervise "Migrate all class components to hooks" --agents 10
```

**What happens:**
1. Supervisor identifies all class components
2. Creates parallel tasks (no dependencies between files)
3. 10 agents work simultaneously
4. File locking prevents conflicts
5. Progress tracked in real-time

---

### Use Case 4: Manual Task Queue

**Scenario:** You want fine-grained control over tasks

```bash
# Start Jetpack (web UI opens automatically)
jetpack start -a 5

# In another terminal, create tasks manually
jetpack task -t "Set up database schema" -p critical -s database
jetpack task -t "Create API routes" -p high -s backend
jetpack task -t "Build dashboard UI" -p medium -s react,frontend

# Or use the web UI at http://localhost:3002 to create/manage tasks

# Check progress via CLI
jetpack status
```

---

## 🔧 Programmatic Usage

### TypeScript Example

```typescript
import { JetpackOrchestrator } from '@jetpack-agent/orchestrator';

const jetpack = new JetpackOrchestrator({
  workDir: process.cwd(),
  autoStart: true,

  // New: Always-on supervisor (enabled by default)
  enableSupervisor: true,
  supervisorConfig: {
    provider: 'claude',
    model: 'claude-sonnet-4-20250514',
    monitorIntervalMs: 30000,  // Check every 30s
    maxRetries: 3,
  },

  // New: Quality metrics tracking
  enableQualityMetrics: true,
  onQualityRegression: (summary) => {
    console.warn('Quality regression detected:', summary.overallStatus);
    // Could trigger alerts, block merges, etc.
  },

  // New: Branch-aware task filtering
  branch: 'feature/auth',  // Or auto-detect from git
});

// Initialize
await jetpack.initialize();

// Start agents with dynamic skill detection
await jetpack.startAgents(5);

// Create hierarchical tasks
const epic = await jetpack.createTask({
  title: 'User Authentication System',
  type: 'epic',
  priority: 'high',
  requiredSkills: ['backend', 'security'],
});

const task1 = await jetpack.createTask({
  title: 'Implement JWT service',
  type: 'task',
  parentId: epic.id,
  priority: 'high',
  requiredSkills: ['typescript', 'backend'],
  estimatedMinutes: 30,
});

const task2 = await jetpack.createTask({
  title: 'Write authentication tests',
  type: 'task',
  parentId: epic.id,
  priority: 'medium',
  requiredSkills: ['testing'],
  dependencies: [task1.id],
  estimatedMinutes: 15,
});

// Monitor status
const status = await jetpack.getStatus();
console.log('Agents:', status.agents);
console.log('Tasks:', status.tasks);

// Get quality metrics (if enabled)
const quality = jetpack.getQualityAdapter();
if (quality) {
  const baseline = await quality.getBaseline();
  console.log('Quality baseline:', baseline);
}

// Shutdown gracefully
await jetpack.shutdown();
```

## 📦 Package Structure

```
jetpack/
├── packages/
│   ├── shared/             # Common types and utilities
│   ├── beads-adapter/      # Git-backed task management
│   ├── mcp-mail-adapter/   # Inter-agent communication
│   ├── cass-adapter/       # Persistent memory system
│   └── orchestrator/       # Core coordination engine
├── apps/
│   ├── cli/               # Command-line interface
│   └── web/               # Next.js Kanban UI
└── .beads/                # Task storage (git-backed)
    .cass/                 # Memory database
    .jetpack/              # Agent communication
```

## 🧩 Integration Points

### Flywheel Components

Jetpack integrates with the following tools from the Agentic Coding Tooling Flywheel:

1. **Beads** (Steve Yegge)
   - Task management with dependency graphs
   - Git-backed storage for versioning
   - Hash-based IDs for conflict-free merging

2. **CASS Memory System**
   - Persistent agent memory
   - Semantic search capabilities
   - Memory compaction strategies

3. **MCP Agent Mail**
   - Publish/subscribe messaging
   - File leasing for concurrent safety
   - Heartbeat monitoring

### Extending Jetpack

Add custom adapters for additional tools:

```typescript
// packages/custom-adapter/src/CustomAdapter.ts
export class CustomAdapter {
  async initialize(): Promise<void> {
    // Integration logic
  }
}
```

Update the orchestrator to use your adapter:

```typescript
import { CustomAdapter } from '@jetpack-agent/custom-adapter';

// In JetpackOrchestrator
const custom = new CustomAdapter(config);
await custom.initialize();
```

## 🎓 Core Concepts

### Tasks & Dependencies

Tasks are stored in `.beads/tasks.jsonl` with dependency tracking:

```json
{
  "id": "bd-a1b2",
  "title": "Implement authentication",
  "status": "in_progress",
  "dependencies": [],
  "requiredSkills": ["typescript", "backend"]
}
```

### Agent Coordination

Agents communicate via MCP Mail:

1. **Task Created** → Broadcast to all agents
2. **Agent Claims** → Notify others to prevent duplication
3. **File Lock** → Coordinate on shared resources
4. **Task Complete** → Trigger dependent tasks

### Memory System

CASS stores learnings for agent improvement:

- **Codebase Knowledge**: Understanding of the project
- **Agent Learning**: Patterns from completed tasks
- **Conversation History**: Past interactions
- **Decision Rationale**: Why certain choices were made

## 🔬 Advanced Usage

### Skill-Based Task Assignment

```typescript
// Create a backend-specific task
await jetpack.createTask({
  title: 'Optimize database queries',
  requiredSkills: ['database', 'backend'],
  priority: 'critical',
});

// Only agents with 'database' or 'backend' skills will claim it
```

### Task Priority & Dependencies

```typescript
// High-priority task that must complete first
const setupTask = await jetpack.createTask({
  title: 'Initialize project',
  priority: 'critical',
});

// Dependent task waits for setup
const buildTask = await jetpack.createTask({
  title: 'Build application',
  dependencies: [setupTask.id],
  priority: 'high',
});
```

### Memory Queries

```typescript
const cass = jetpack.getCASSAdapter();

// Search for relevant memories
const memories = await cass.search('authentication', 10);

// Semantic search with embeddings
const similar = await cass.semanticSearch(embedding, 5);

// Get recent learnings
const recent = await cass.getRecentMemories(20);
```

## 📊 Monitoring & Metrics

### Task Statistics

```typescript
const beads = jetpack.getBeadsAdapter();
const stats = await beads.getStats();

console.log('Total tasks:', stats.total);
console.log('By status:', stats.byStatus);
console.log('Avg completion time:', stats.avgCompletionTime, 'minutes');
```

### Memory Statistics

```typescript
const cass = jetpack.getCASSAdapter();
const stats = await cass.getStats();

console.log('Total memories:', stats.total);
console.log('By type:', stats.byType);
console.log('Avg importance:', stats.avgImportance);
```

## 🛠️ Development

### Building from Source

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run in development mode
pnpm dev
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific package tests
cd packages/beads-adapter
pnpm test
```

### Project Structure

- **Monorepo**: Managed with pnpm workspaces
- **Build System**: Turborepo for caching and parallelization
- **TypeScript**: Strict mode enabled across all packages
- **Testing**: Jest for unit and integration tests

## 🤝 Integration with Existing Tools

### With Beads (Steve Yegge)

Jetpack's Beads adapter is compatible with the original Beads format:

```bash
# You can use Beads CLI alongside Jetpack
beads list
beads show bd-a1b2
```

### With Claude Code Agent Farm

```typescript
// Jetpack can coordinate Claude Code agents
const jetpack = new JetpackOrchestrator({
  workDir: process.cwd(),
});

// Each agent can be a Claude Code instance
// with specialized skills and tech stack support
```

### With MCP Servers

```typescript
// Jetpack uses MCP for inter-agent communication
// Can integrate with any MCP-compatible tool
```

## 🚀 Roadmap

### ✅ Completed

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
- [x] **Always-On Supervisor** - Background monitoring with auto-recovery
- [x] **TUI Dashboard** - Tmux-style split panes for live agent output
- [x] **Dynamic Skills Marketplace** - Auto-detection and runtime skill acquisition
- [x] **Rich Agent Messaging** - Detailed status with reasoning payloads
- [x] **Smart Dependency Handling** - Parallel-first planning, bottleneck prevention
- [x] **Branch-Tagged Projects** - Branch-aware task filtering
- [x] **Selective Plan Execution** - Choose which plan items to convert to tasks
- [x] **Hierarchical Planning** - Epic > Task > Subtask > Leaf structure
- [x] **File Locking Integration** - Automatic lease acquisition during execution
- [x] **Semantic Search for CASS** - Vector embedding-based memory retrieval
- [x] **Quality Metrics Integration** - Regression detection and quality snapshots
- [x] **Message Acknowledgment** - Reliable delivery tracking for messages
- [x] **Long-Running Autonomous Modes** - Infinite, idle-pause, objective-based, iteration-limit
- [x] **Periodic Work Polling** - Agents poll every 30s to catch missed events (BUG-5 fix)
- [x] **Dynamic Timeout Calculation** - 2x estimated time for complex tasks (BUG-6 fix)
- [x] **Three-Stage Graceful Shutdown** - SIGINT → SIGTERM → SIGKILL (BUG-7 fix)
- [x] **Browser Validator** - Playwright-based validation for UI tasks
- [x] **TDD-Biased Agent Instructions** - Test-first guidance in prompts
- [x] **Ollama LLM Support** - Local models via Ollama
- [x] **Interactive Config Wizard** - Guided `jetpack init` setup
- [x] **File Watching** - Drop `.md` files in `.beads/tasks/` to create tasks

### 🔜 Planned

- [ ] Integration with Named Tmux Manager for command orchestration
- [ ] Ultimate Bug Scanner adapter for quality gates
- [ ] WebSocket support for instant UI updates
- [ ] Task dependency graph visualization
- [ ] Session Search for learning from history
- [ ] Simultaneous Launch Button for safe multi-command execution
- [ ] Cloud-hosted agent farm
- [ ] GitHub Issues / Linear integration
- [ ] Agent performance metrics and leaderboards

## 🏆 Stress Test Showcase

### Node Banana Multi-Agent Sprint (Jan 17, 2026)

**Setup:**
- 10 agents working in parallel
- Node Banana visual workflow editor (Next.js, React Flow, Konva.js)
- Tasks: Build 7 new node types, template gallery, undo/redo system

**Results:**
| Metric | Value |
|--------|-------|
| Tasks completed | 9/9 (100%) |
| Failures | 0 |
| Runtime | 1 hour |
| Code generated | ~8,159 lines |
| New files | 11 |

**Tasks Completed:**
| Task | Agent | Duration |
|------|-------|----------|
| Workflow Template Gallery | agent-7c8a80f7 | 10m |
| Color Palette Extraction | agent-6ff3b3bd | 17m |
| Undo/Redo System | agent-7c8a80f7 | 18m |
| Batch Variations Node | agent-fd88f466 | 19m |
| Loop/Iterator Node | agent-30f89159 | 19m |
| Image Filter Effects | agent-eeddacd8 | 19m |
| Image Comparison Node | agent-b4d76485 | 20m |
| Conditional Branch Node | agent-7c8a80f7 | 20m |
| Mask/Inpainting Node | agent-52904c0e | 23m |

**Key Observations:**
- File locking prevented conflicts between parallel agents
- Dynamic timeout calculation allowed complex tasks to complete
- Periodic work polling caught all tasks (no missed events)
- Graceful shutdown preserved progress on termination

---

## 📄 License

MIT

## 🙏 Acknowledgments

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

## 🔗 Links

- [Jeffrey Emanuel's Projects](https://www.jeffreyemanuel.com/projects)
- [Beads by Steve Yegge](https://github.com/steveyegge/beads)
- [Model Context Protocol](https://modelcontextprotocol.io)

---

**Built with ❤️ for the multi-agent development future**
