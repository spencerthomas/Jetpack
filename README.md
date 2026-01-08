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

```
┌─────────────────────────────────────────────────────────────┐
│                    JETPACK ORCHESTRATOR                      │
│              (Central Coordination Layer)                    │
└────────────┬────────────────────────────────────┬───────────┘
             │                                    │
    ┌────────▼────────┐                  ┌───────▼──────┐
    │  AGENT MEMORY   │                  │   EXECUTION  │
    │                 │                  │              │
    │ • Beads (Tasks) │◄────────────────►│ • Agents     │
    │ • CASS (State)  │                  │ • MCP Mail   │
    └────────┬────────┘                  └───────┬──────┘
             │                                    │
             └────────────────┬───────────────────┘
                              │
                       Coordinated Work
```

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

### Basic Usage

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
```

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
│   └── cli/               # Command-line interface
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

- [ ] Integration with Named Tmux Manager for command orchestration
- [ ] Ultimate Bug Scanner adapter for quality gates
- [ ] Beads Viewer web dashboard
- [ ] Session Search for learning from history
- [ ] Simultaneous Launch Button for safe multi-command execution
- [ ] Cloud-hosted agent farm
- [ ] GitHub Issues / Linear integration
- [ ] Real-time collaboration features
- [ ] Agent performance leaderboards

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
