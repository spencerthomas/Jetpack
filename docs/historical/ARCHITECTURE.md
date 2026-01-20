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

## File Structure (Jan 2026)

```
jetpack/
├── packages/
│   ├── orchestrator/       # Core coordination engine (JetpackOrchestrator)
│   ├── shared/             # Types, utilities, adapter interfaces
│   ├── supervisor/         # LangGraph supervisor (Planner → Monitor)
│   │
│   │── # Local Adapters
│   ├── beads-adapter/      # SQLite task storage (ITaskStore)
│   ├── cass-adapter/       # SQLite memory with embeddings (IMemoryStore)
│   ├── mcp-mail-adapter/   # File-based pub/sub (IMailBus)
│   │
│   │── # Cloudflare Adapters (Hybrid/Edge Mode)
│   ├── cf-beads-adapter/   # D1 task storage (CloudflareTaskStore)
│   ├── cf-cass-adapter/    # D1 + Vectorize memory (CloudflareMemoryStore)
│   ├── cf-mail-adapter/    # Durable Objects messaging (CloudflareMailBus)
│   ├── worker-api/         # Hono-based Cloudflare Worker API gateway
│   │
│   │── # Quality & Validation
│   ├── quality-adapter/    # Quality metrics and regression detection
│   ├── browser-validator/  # Browser-based UI validation
│   │
│   │── # UI & CLI
│   ├── cli-tui/            # Terminal UI components (Ink/React)
│   ├── mcp-server/         # MCP server for external tool integration
│   └── jetpack-agent/      # Core agent implementation
│
├── apps/
│   ├── cli/               # Jetpack CLI entry point
│   └── web/               # Next.js web dashboard
│
├── .beads/                # Local task storage (SQLite + JSONL)
├── .cass/                 # Local memory storage (SQLite)
├── .jetpack/              # Runtime state (agents.json, mail/)
└── docs/                  # Documentation
    ├── HYBRID_ARCHITECTURE.md  # Cloudflare hybrid architecture
    └── JETPACK_COMPLETE_GUIDE.md  # Full user guide
```

## Hybrid Cloudflare Architecture

Jetpack supports three execution modes:

| Mode | State Storage | Execution | Use Case |
|------|---------------|-----------|----------|
| `local` | SQLite (BeadsAdapter, CASSAdapter) | Local | Single machine |
| `hybrid` | Cloudflare (D1, Vectorize, DO) | Local | Shared state, local exec |
| `edge` | Cloudflare (all) | Worker | Full serverless |

```bash
# Local mode (default)
JETPACK_MODE=local jetpack start

# Hybrid mode - state on Cloudflare, execution local
JETPACK_MODE=hybrid \
CLOUDFLARE_API_URL=https://jetpack-api.your-account.workers.dev \
CLOUDFLARE_API_TOKEN=xxx \
jetpack start
```

### HTTP Client Adapters

For hybrid/edge modes, the CLI uses HTTP adapters:
- `HttpTaskStore` - Calls Worker API for task CRUD
- `HttpMailBus` - HTTP publish + WebSocket subscriptions
- `HttpMemoryStore` - Calls Worker API for memory/search

See `docs/HYBRID_ARCHITECTURE.md` for full details.

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
- [x] Beads adapter (task CRUD with SQLite + JSONL storage)
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
- [x] Graceful shutdown with state persistence
- [x] Memory leak prevention (bounded buffers)

### Phase 4: Intelligence & UI ✅
- [x] LangGraph Supervisor (Planner → Assigner → Monitor → Coordinator)
- [x] Multi-page web UI with dark theme
- [x] Memory dashboard with stats and actions
- [x] Agent lifecycle visualization
- [x] Plan management and templates
- [x] TUI dashboard (cli-tui package)

### Phase 5: Hybrid Cloudflare ✅
- [x] Cloudflare adapters (cf-beads, cf-cass, cf-mail)
- [x] Worker API gateway (Hono + D1 + Durable Objects)
- [x] HTTP client adapters for hybrid mode
- [x] Adapter factory with mode selection
- [x] Orchestrator integration (adapterMode)

### Phase 6: Quality & Validation ✅
- [x] Quality adapter (metrics, regressions)
- [x] Browser validator (UI testing)
- [x] Runtime manager (limits, end states)

### Phase 7: Future
- [ ] Docker compose setup
- [ ] Multi-repository support
- [ ] Real-time WebSocket updates
- [ ] Cloud-hosted agent farm

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

### Completed (Jan 2026)
- [x] Memory system dashboard
- [x] Plan management UI
- [x] LangGraph supervisor visualization
- [x] Dark mode with cyan accent
- [x] Agent spawning UI with harness selection
- [x] Hierarchical task tree view
- [x] Hybrid Cloudflare architecture
- [x] Quality metrics and regression detection
- [x] TUI dashboard for terminal
- [x] Graceful shutdown with state persistence
- [x] Memory monitoring and cleanup

### Planned
- [ ] Multi-repository support
- [ ] Cloud-hosted agent farm (full edge mode)
- [ ] Custom agent personas and specializations
- [ ] Integration with GitHub Issues, Jira, Linear
- [ ] Real-time collaboration via WebSocket
- [ ] Agent performance metrics and leaderboards
