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

### 💾 Persistent Memory
- Beads stores task history and dependencies (git-backed)
- CASS stores semantic memory and learned patterns
- Agents learn from past work to improve over time

### 🔒 Safe Execution
- File leasing prevents concurrent modification conflicts
- Task dependencies ensure proper execution order
- Automatic rollback on failures

### 📊 Visual Oversight
- Real-time task graph visualization
- Agent status monitoring
- Progress tracking and metrics

### 🛠️ Multi-Stack Support
- 34+ tech stacks supported
- Language-specific agents (TypeScript, Python, Rust, Go)
- Extensible adapter architecture

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
| **Beads** | Persistent task queue with dependency tracking | `data/beads.db` |
| **MCP Mail** | Pub/sub messaging between agents | `data/mcp-mail.db` |
| **CASS** | Vector-based semantic memory for context | `data/cass.db` |
| **Orchestrator** | Coordinates adapters and agent lifecycle | In-memory |
| **Supervisor** | LLM-powered planning and conflict resolution | In-memory |

## 🚦 Quick Start

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd Jetpack

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### CLI Usage

```bash
# Start Jetpack with 3 agents
jetpack start --agents 3

# Create a task
jetpack task \
  --title "Implement user authentication" \
  --priority high \
  --skills typescript,backend \
  --estimate 30

# Check status
jetpack status

# Run the demo
jetpack demo --agents 5

# Use LangGraph Supervisor for full orchestration
jetpack supervise "Build a user authentication system" \
  --llm claude \
  --model claude-3-5-sonnet-20241022 \
  --agents 5
```

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

**Environment Variables Required:**
```bash
export ANTHROPIC_API_KEY=your_key   # for Claude
export OPENAI_API_KEY=your_key      # for OpenAI
```

### Web UI Usage

```bash
# Start the orchestrator with agents
jetpack start --agents 5

# In another terminal, start the web UI
cd apps/web
pnpm dev

# Visit http://localhost:3000
```

**Features:**
- 📊 **Kanban Board** - Drag-and-drop task management across 6 status columns
- 🤖 **Agent Panel** - Live agent status, current tasks, and skills
- 📬 **MCP Mail Inbox** - Real-time inter-agent communication viewer
- ✨ **Task Creation** - Intuitive modal for creating new tasks
- 🔄 **Auto-refresh** - Updates every 2 seconds for real-time sync

## 📖 Usage Examples

### Starting the System

```bash
# Start with default settings (3 agents)
jetpack start

# Start with 5 specialized agents
jetpack start --agents 5

# Use a custom working directory
jetpack start --dir /path/to/project
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

Each agent is an autonomous worker that claims and executes tasks. The AgentController manages the agent lifecycle.

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
   ├── Execute work (code changes, tests, etc.)
   ├── Store learnings in CASS
   └── Publish completion via MCP Mail

4. Loop back to lookForWork()
```

**Agent Skills:**
```typescript
type AgentSkill =
  | 'typescript' | 'javascript' | 'python' | 'rust' | 'go'
  | 'react' | 'vue' | 'angular' | 'svelte'
  | 'backend' | 'frontend' | 'database' | 'devops'
  | 'testing' | 'documentation' | 'security';
```

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

**Scenario:** You want fine-grained control

```bash
# Start agents
jetpack start --agents 5

# Create tasks manually
jetpack task -t "Set up database schema" -p critical -s database
jetpack task -t "Create API routes" -p high -s backend
jetpack task -t "Build dashboard UI" -p medium -s react,frontend

# Monitor progress
jetpack status
```

---

## 🔧 Programmatic Usage

### TypeScript Example

```typescript
import { JetpackOrchestrator } from '@jetpack/orchestrator';

const jetpack = new JetpackOrchestrator({
  workDir: process.cwd(),
  autoStart: true,
});

// Initialize
await jetpack.initialize();

// Start agents
await jetpack.startAgents(5);

// Create tasks
const task1 = await jetpack.createTask({
  title: 'Implement feature X',
  priority: 'high',
  requiredSkills: ['typescript', 'backend'],
  estimatedMinutes: 30,
});

const task2 = await jetpack.createTask({
  title: 'Test feature X',
  priority: 'medium',
  requiredSkills: ['testing'],
  dependencies: [task1.id],
  estimatedMinutes: 15,
});

// Monitor status
const status = await jetpack.getStatus();
console.log('Agents:', status.agents);
console.log('Tasks:', status.tasks);

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
import { CustomAdapter } from '@jetpack/custom-adapter';

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

- [x] **Kanban Web UI** - Modern drag-and-drop interface ✅
- [x] **MCP Mail Inbox Viewer** - Real-time message monitoring ✅
- [x] **LangGraph Supervisor** - Intelligent full orchestration with multi-LLM support ✅
- [ ] Integration with Named Tmux Manager for command orchestration
- [ ] Ultimate Bug Scanner adapter for quality gates
- [ ] WebSocket support for instant UI updates
- [ ] Task dependency graph visualization
- [ ] Session Search for learning from history
- [ ] Simultaneous Launch Button for safe multi-command execution
- [ ] Cloud-hosted agent farm
- [ ] GitHub Issues / Linear integration
- [ ] Agent performance metrics and leaderboards

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
