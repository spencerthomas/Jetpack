# Jetpack: Multi-Agent Swarm Development Stack

## Vision
An integrated agentic development platform that combines the best open-source tools into a unified multi-agent swarm system for software development at scale.

## Core Architecture

### The Flywheel Integration Model

```
┌─────────────────────────────────────────────────────────────┐
│                    JETPACK ORCHESTRATOR                      │
│              (Central Coordination Layer)                    │
└────────────┬────────────────────────────────────┬───────────┘
             │                                    │
    ┌────────▼────────┐                  ┌───────▼──────┐
    │  AGENT MEMORY   │                  │   EXECUTION  │
    │                 │                  │              │
    │ • Beads (Tasks) │◄────────────────►│ • NTM (Tmux) │
    │ • CASS (State)  │                  │ • SLB (Safe) │
    │ • Search (Hist) │                  │ • Scanner    │
    └────────┬────────┘                  └───────┬──────┘
             │                                    │
             │         ┌─────────────┐           │
             └────────►│  MCP MAIL   │◄──────────┘
                       │ (Agent Comm)│
                       └──────┬──────┘
                              │
                    ┌─────────▼──────────┐
                    │   VISUALIZATION    │
                    │                    │
                    │  • Beads Viewer    │
                    │  • Agent Farm UI   │
                    └────────────────────┘
```

## Component Integration

### 1. **Beads** - Task Memory & Dependency Graph
- **Role**: Primary task management and dependency tracking
- **Integration Points**:
  - Git-backed `.beads/` directory for all task state
  - JSON-based task format for agent consumption
  - Dependency DAG for multi-agent task distribution
- **APIs**: CLI + REST API wrapper

### 2. **CASS Memory System** - Agent State Persistence
- **Role**: Long-term agent memory and context
- **Integration Points**:
  - Stores agent personas, learned patterns, codebase knowledge
  - Complements Beads (tasks) with semantic memory (context)
  - Memory decay and compaction strategies
- **APIs**: GraphQL + gRPC

### 3. **MCP Agent Mail** - Inter-Agent Communication
- **Role**: Message passing and file leasing between agents
- **Integration Points**:
  - Publish/subscribe for agent coordination
  - File locking for concurrent work prevention
  - Task claiming and handoff protocols
- **APIs**: MCP (Model Context Protocol) + WebSocket

### 4. **Named Tmux Manager (NTM)** - Command Orchestration
- **Role**: Execute commands across multiple terminal sessions
- **Integration Points**:
  - Named sessions per agent
  - Session sharing for collaboration
  - Command history and replay
- **APIs**: CLI + Socket API

### 5. **Ultimate Bug Scanner** - Multi-Language Quality
- **Role**: Unified linting and code quality checks
- **Integration Points**:
  - ESLint, Ruff, Clippy, golangci-lint, etc.
  - Pre-commit hooks
  - Agent feedback loop for code quality
- **APIs**: REST API

### 6. **Web Dashboard** - Multi-Page Interface
- **Role**: Visual oversight and management of multi-agent system
- **Pages**:
  - Board: Kanban + hierarchical tree view with task types
  - Inbox: 3-panel mail interface with threads
  - Agents: Lifecycle visualization with phase tracking
  - Plans: Workflow creation and template management
  - Memory: CASS dashboard with stats and actions
  - Supervisor: LangGraph node visualization
  - Settings: System configuration
- **Integration Points**:
  - Reads `.beads/tasks.jsonl` for tasks
  - Connects to CASS for memory management
  - Monitors MCP Mail for agent communication
- **UI**: Next.js 15, React 19, Tailwind, dark theme with cyan accent

### 7. **Simultaneous Launch Button (SLB)** - Safe Execution
- **Role**: Cryptographically safe multi-command execution
- **Integration Points**:
  - Command verification before execution
  - Rollback on partial failure
  - Agent safety guardrails
- **APIs**: CLI + REST API

### 8. **Coding Agent Session Search** - Historical Intelligence
- **Role**: Full-text search across all agent conversations
- **Integration Points**:
  - Index all agent sessions (Claude Code, Cursor, Gemini)
  - RAG for agent learning from past work
  - Pattern detection and recommendations
- **APIs**: Elasticsearch/Meilisearch + REST

### 9. **Claude Code Agent Farm** - Multi-Agent Orchestration
- **Role**: Spawn, manage, and coordinate multiple AI agents
- **Integration Points**:
  - 34+ tech stack support
  - Load balancing across agents
  - Skill-based agent assignment
- **APIs**: gRPC + WebSocket

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
    NTM (execute in tmux) ← SLB (safety check)
              ↓
   Bug Scanner (validate) → Beads (update status)
              ↓
    CASS (store learnings)
```

### Multi-Agent Coordination
```
Agent A: Beads (claim task) → MCP Mail (notify)
Agent B: MCP Mail (receive) → CASS (check dependencies)
Agent C: Beads Viewer (monitor) → Agent Farm (rebalance)
All: Session Search (learn from history)
```

## Technology Stack

### Core Runtime
- **Language**: TypeScript/Node.js (orchestrator), Go (performance-critical)
- **Framework**: NestJS (backend), Next.js (frontend)
- **Database**: PostgreSQL (metadata), SQLite (local), Redis (cache)
- **Message Queue**: RabbitMQ or NATS
- **Process Management**: PM2, Tmux

### External Tool Integration
- **Beads**: Go binary (subprocess)
- **CASS**: Node.js library
- **MCP Mail**: MCP server
- **Bug Scanner**: CLI wrapper
- **Search**: Meilisearch or Typesense

## File Structure

```
jetpack/
├── packages/
│   ├── orchestrator/       # Core coordination engine
│   ├── beads-adapter/      # Beads integration
│   ├── cass-adapter/       # CASS integration
│   ├── mcp-mail-adapter/   # MCP Mail integration
│   ├── ntm-adapter/        # Named Tmux Manager
│   ├── scanner-adapter/    # Bug Scanner integration
│   ├── slb-adapter/        # Simultaneous Launch Button
│   ├── search-adapter/     # Session search integration
│   └── agent-farm/         # Claude Code Agent Farm
├── apps/
│   ├── cli/               # Jetpack CLI
│   ├── web/               # Web dashboard (Beads Viewer + Farm UI)
│   └── api/               # REST/GraphQL API server
├── libs/
│   ├── shared/            # Common utilities
│   ├── types/             # TypeScript definitions
│   └── protocols/         # Communication protocols
├── tools/
│   ├── beads/             # Beads submodule/vendored
│   ├── cass/              # CASS submodule
│   ├── mcp-mail/          # MCP Mail submodule
│   ├── ntm/               # NTM submodule
│   ├── scanner/           # Bug Scanner submodule
│   ├── slb/               # SLB submodule
│   └── search/            # Search submodule
├── .beads/                # Beads task storage
├── .cass/                 # CASS memory storage
└── docker-compose.yml     # Full stack deployment
```

## Key Features

### 1. **Swarm Intelligence**
- Agents claim tasks from Beads based on skills and availability
- MCP Mail coordinates to prevent duplicate work
- CASS provides shared knowledge base

### 2. **Persistent Memory**
- Beads stores task history and dependencies (git-backed)
- CASS stores semantic memory and learned patterns
- Session Search enables learning from past work

### 3. **Safe Execution**
- SLB verifies commands before execution
- Bug Scanner provides quality gates
- NTM isolates agent workspaces

### 4. **Visual Oversight**
- Beads Viewer shows real-time task graph
- Agent Farm UI displays agent status and metrics
- Integrated dashboard for monitoring swarm

### 5. **Multi-Stack Support**
- 34+ tech stacks via Agent Farm
- Language-specific linting via Bug Scanner
- Extensible adapter architecture

## Development Phases

### Phase 1: Foundation ✅
- [x] Monorepo setup (pnpm workspaces)
- [x] Core orchestrator skeleton
- [x] Beads adapter (task CRUD with JSONL storage)
- [x] MCP Mail adapter (pub/sub messaging)

### Phase 2: Agent Coordination ✅
- [x] Agent Farm integration (AgentController)
- [x] CASS memory integration (SQLite with embeddings)
- [x] Task claiming and assignment logic
- [x] Multi-agent conflict resolution (file leasing)

### Phase 3: Execution & Safety ✅
- [x] Claude Code CLI execution
- [x] File leasing for concurrent safety
- [x] Error recovery and task retry
- [x] Heartbeat monitoring

### Phase 4: Intelligence & UI ✅
- [x] LangGraph Supervisor (Planner → Assigner → Monitor → Coordinator)
- [x] Multi-page web UI with dark theme
- [x] Memory dashboard with stats and actions
- [x] Agent lifecycle visualization
- [x] Plan management and templates

### Phase 5: Polish & Deploy (In Progress)
- [ ] Docker compose setup
- [ ] End-to-end testing
- [x] Documentation
- [x] Example workflows

## Usage Example

```bash
# Start Jetpack swarm
jetpack start --agents 5

# Create a feature request
jetpack task create "Implement user authentication" \
  --stack typescript,postgres,react \
  --agents 3

# Monitor progress
jetpack watch

# Agent A (backend): Claims auth API task
# Agent B (frontend): Claims login UI task
# Agent C (database): Claims migration task

# All agents coordinate via MCP Mail
# All tasks tracked in Beads
# All learnings stored in CASS
# All commands in isolated tmux sessions
# All code scanned for quality

# Review results
jetpack status
jetpack view --task bd-a1b2
```

## Success Metrics

1. **Coordination Efficiency**: Time to distribute and complete multi-agent tasks
2. **Code Quality**: Bug scanner pass rates across agents
3. **Memory Utilization**: CASS memory compaction ratios
4. **Agent Utilization**: % time agents are productively working
5. **Conflict Rate**: File locking conflicts via MCP Mail

## Future Enhancements

- [x] Memory system dashboard ✅
- [x] Plan management UI ✅
- [x] LangGraph supervisor visualization ✅
- [x] Dark mode with cyan accent ✅
- [x] Agent spawning UI with harness selection ✅
- [x] Hierarchical task tree view ✅
- [ ] Multi-repository support
- [ ] Cloud-hosted agent farm
- [ ] Custom agent personas and specializations
- [ ] Integration with GitHub Issues, Jira, Linear
- [ ] Real-time collaboration features
- [ ] Agent performance metrics and leaderboards
- [ ] WebSocket for instant UI updates
