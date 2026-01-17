# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

### CLI Commands

| Command | Description |
|---------|-------------|
| `pnpm jetpack start` | Start orchestrator + agents + web UI + supervisor |
| `pnpm jetpack start -a 5` | Start with 5 agents |
| `pnpm jetpack start --tui` | Start with TUI dashboard (tmux-style) |
| `pnpm jetpack start --no-supervisor` | Disable auto-started supervisor |
| `pnpm jetpack task -t "Title" -p high` | Create a task |
| `pnpm jetpack status` | Show system status |
| `pnpm jetpack demo` | Run guided demo |
| `pnpm jetpack supervise "request"` | AI-powered task breakdown |
| `pnpm jetpack mcp --dir /path` | Start MCP server |

### Key Files to Know

| File | Purpose |
|------|---------|
| `packages/orchestrator/src/JetpackOrchestrator.ts` | Main coordinator |
| `packages/orchestrator/src/AgentController.ts` | Agent lifecycle |
| `packages/orchestrator/src/ClaudeCodeExecutor.ts` | Spawns Claude CLI |
| `packages/orchestrator/src/SkillDetector.ts` | Dynamic skill detection |
| `packages/supervisor/src/SupervisorAgent.ts` | LangGraph supervisor with background monitoring |
| `packages/shared/src/types/` | All TypeScript types |
| `packages/shared/src/services/SkillRegistry.ts` | Skill registry and matching |
| `packages/quality-adapter/src/` | Quality metrics and regression detection |
| `packages/cli-tui/src/` | Terminal UI dashboard |
| `apps/web/src/app/api/` | Next.js API routes |
| `apps/cli/src/commands/` | CLI command implementations |

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

- `@jetpack/shared` - Base types (Task, Agent, Message, Memory), Zod schemas, SkillRegistry
- `@jetpack/beads-adapter` - Tasks stored in `.beads/tasks.jsonl`, optional git auto-commit
- `@jetpack/cass-adapter` - Memory stored in `.cass/memory.db`, supports semantic search
- `@jetpack/mcp-mail-adapter` - Messages in `.jetpack/mail/{inbox,outbox}/*.json`, file leasing
- `@jetpack/orchestrator` - Combines adapters, manages agent pool, quality metrics
- `@jetpack/supervisor` - LangGraph supervisor with background monitoring
- `@jetpack/quality-adapter` - Quality snapshots, regression detection, quality gates
- `@jetpack/cli-tui` - Ink-based terminal UI dashboard (tmux-style panes)
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
- `.jetpack/mail/` - Inter-agent message queues, file leases
- `.jetpack/plans/` - Plan storage (JSON files)
- `.quality/` - Quality metrics database (when enabled)

## New Features (Recent Enhancements)

### Always-On Supervisor with Background Monitoring

The supervisor now starts automatically with `jetpack start` and runs background monitoring:

```typescript
// Supervisor auto-starts (opt-out with --no-supervisor)
jetpack start

// Background monitoring checks every 30s for:
// - Unassigned ready tasks → notifies agents
// - Failed tasks with retries left → resets to ready
// - Stalled agents (busy but no activity for 2min) → reassigns tasks
// - Blocked tasks with completed dependencies → unblocks

// Custom interval
jetpack start --supervisor-interval 60000  // 60 seconds
```

**CLI Options:**
- `--no-supervisor` - Disable supervisor entirely
- `--supervisor-interval <ms>` - Set monitoring interval (default: 30000)
- `-l, --llm <provider>` - LLM provider (claude/openai)
- `-m, --model <model>` - Specific model to use

### TUI Dashboard (Tmux-Style Agent Visibility)

Launch a terminal UI showing live agent output in split panes:

```bash
jetpack start --tui
```

```
┌─────────────────────────────────────────────────────────────┐
│ Status Bar: 5 agents | 12 tasks | 3 running | 2h 15m       │
├───────────────┬───────────────┬───────────────┬─────────────┤
│ Agent 1       │ Agent 2       │ Agent 3       │ Agent 4     │
│ [typescript]  │ [backend]     │ [python]      │ [devops]    │
│ ─────────────│───────────────│───────────────│─────────────│
│ Working on:   │ Working on:   │ Idle          │ Working on: │
│ bd-123        │ bd-456        │               │ bd-789      │
│ > Reading...  │ > Writing..   │ Waiting for   │ > Running   │
│ > Analyzing   │ > Testing..   │ ready tasks   │ > tests...  │
└───────────────┴───────────────┴───────────────┴─────────────┘
```

**Programmatic:**
```typescript
const jetpack = new JetpackOrchestrator({
  workDir: '/path/to/project',
  enableTuiMode: true,
  onAgentOutput: (event) => console.log(event.chunk),
});
```

### Dynamic Skills Marketplace

Skills are auto-detected from the codebase and agents can acquire skills at runtime:

```typescript
// Auto-detected from package.json, config files, etc.
const detected = jetpack.projectSkills;  // ['typescript', 'react', 'nextjs']

// Agents acquire missing skills dynamically
// When claiming a task requiring 'react' but agent only has 'typescript':
// → Agent acquires 'react' skill and proceeds

// Skill registry for matching
import { getSkillRegistry } from '@jetpack/shared';
const registry = getSkillRegistry();
const score = registry.calculateMatchScore(agentSkills, taskSkills);
```

**Skill Detection Sources:**
- `package.json` dependencies → typescript, react, vue, next, etc.
- Config files → `tsconfig.json`, `requirements.txt`, `Cargo.toml`
- Directory patterns → `.github/workflows` → ci-cd skill

### Branch-Tagged Projects

Tasks and plans are tagged with the current git branch:

```typescript
// Tasks automatically tagged with current branch
const task = await jetpack.createTask({
  title: 'Fix login bug',
  // branch: 'feature/auth'  // Auto-set from git
});

// Filter tasks by branch
const tasks = await beads.listTasks({ branch: 'feature/auth' });

// Get current branch
const branch = await jetpack.getCurrentBranch();
```

### Rich Agent Messaging

Agents broadcast detailed status with reasoning:

```typescript
// Task claimed message includes reasoning
{
  type: 'task.claimed',
  payload: {
    taskId: 'bd-123',
    agentName: 'agent-1',
    reasoning: {
      matchedSkills: ['typescript', 'react'],
      skillScore: 0.85,
      why: 'Highest priority task matching my skills',
      estimatedDuration: 30,
      alternativesConsidered: 3,
    },
    context: {
      totalReadyTasks: 5,
      busyAgentCount: 2,
      taskPriority: 'high',
    }
  }
}

// Progress updates during execution
{
  type: 'task.progress',
  payload: {
    phase: 'executing',  // analyzing | planning | executing | testing | reviewing
    description: 'Running unit tests',
    percentComplete: 75,
  }
}
```

### Hierarchical Planning (Epic > Task > Subtask)

Plans support hierarchical structure with different item types:

```typescript
interface PlanItem {
  id: string;
  type: 'epic' | 'task' | 'subtask' | 'leaf';  // Hierarchy level
  title: string;
  status: PlanItemStatus;
  priority: TaskPriority;
  skills: string[];
  dependencies: string[];
  children?: PlanItem[];      // Nested items
  parentId?: string;          // Parent reference
  executable: boolean;        // Can agents claim this level?
  autoDecompose: boolean;     // Should agent break down further?
}
```

**Hierarchy Rules:**
- **Epics**: NOT directly claimable (organizational only)
- **Tasks**: Claimable, agent may create internal sub-plan
- **Subtasks**: Claimable, typically atomic execution
- **Leaf**: Smallest unit, always atomic

### Selective Plan Execution

Execute only selected items from a plan:

```typescript
// Via API
POST /api/plans/[id]/execute
{
  selectedItemIds: ['item-1', 'item-3', 'item-5'],
  skipDependencyCheck: false
}

// Via MCP Server
jetpack_execute_plan_items({
  planId: 'plan-123',
  itemIds: ['item-1', 'item-3']
})
```

### Quality Metrics Integration

Track code quality and detect regressions after task completion:

```typescript
const jetpack = new JetpackOrchestrator({
  workDir: '/path/to/project',
  enableQualityMetrics: true,
  onQualityRegression: (summary) => {
    console.warn(`Quality regression: ${summary.total} issues`);
    console.warn(summary.descriptions);
  },
});

// Create a baseline
await jetpack.createQualityBaseline({
  lintErrors: 0,
  lintWarnings: 5,
  typeErrors: 0,
  testsPassing: 100,
  testsFailing: 0,
  testCoverage: 85,
  buildSuccess: true,
});

// Snapshots recorded automatically after each task
// Regressions detected against baseline

// Manual snapshot
await jetpack.recordQualitySnapshot(taskId, agentId, {
  lintErrors: 2,
  testsFailing: 1,
});
```

**Quality Gates:**
- `test_pass_rate >= 100%` (blocking)
- `lint_errors == 0` (blocking)
- `type_errors == 0` (blocking)
- `test_coverage >= 80%` (warning)

### File Locking (Automatic)

Agents automatically acquire file leases before editing:

```typescript
// Automatic in AgentController.executeTaskWithLocking()
// 1. Predict files to modify from task description
// 2. Acquire leases (60s default, auto-renew)
// 3. Execute task
// 4. Release leases

// Manual usage
const acquired = await mail.acquireLease('src/Button.tsx', 120000);
if (!acquired) {
  const { agentId } = await mail.isLeased('src/Button.tsx');
  console.log(`Blocked by ${agentId}`);
}

// Leases auto-expire after duration
// Stalled agents' leases recovered by supervisor
```

### Semantic Search for Memory

Agents use vector embeddings for memory retrieval:

```typescript
// Automatic in AgentController when claiming tasks
const queryText = `${task.title} ${task.description}`;
const memories = await cass.semanticSearchByQuery(queryText, 5, 0.7);

// Manual semantic search
const similar = await cass.semanticSearch(embedding, 5);
```

### Message Acknowledgment

Track message delivery and handle unacknowledged messages:

```typescript
// Messages can require acknowledgment
await mail.publish({
  type: 'task.assigned',
  ackRequired: true,
  // ...
});

// Agents acknowledge receipt
await mail.acknowledge(messageId, agentId);

// Supervisor monitors unacknowledged assignments
const unacked = await mail.getUnacknowledgedMessages();
// Stale assignments (>1 min) trigger reassignment
```

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

### Full JetpackConfig Options
```typescript
const jetpack = new JetpackOrchestrator({
  workDir: '/path/to/project',
  numAgents: 5,
  autoStart: true,

  // TUI Dashboard
  enableTuiMode: true,
  onAgentOutput: (event) => { /* handle output */ },

  // Quality Metrics
  enableQualityMetrics: true,
  onQualityRegression: (summary) => {
    console.warn(`Regressions: ${summary.descriptions}`);
  },

  // Runtime Limits
  runtimeLimits: {
    maxTasks: 100,
    maxTimeMs: 3600000,  // 1 hour
    maxCycles: 500,
  },
  onEndState: (state, stats) => { /* handle completion */ },
  onRuntimeEvent: (event) => { /* handle events */ },
});
```

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

### Creating hierarchical plans
```typescript
const plan = await planStore.createPlan({
  id: 'plan-auth',
  title: 'User Authentication',
  items: [
    {
      id: 'epic-1',
      type: 'epic',
      title: 'Authentication System',
      executable: false,  // Epics are not directly claimable
      children: [
        {
          id: 'task-1',
          type: 'task',
          title: 'Create user model',
          executable: true,
          skills: ['database', 'backend'],
        },
        {
          id: 'task-2',
          type: 'task',
          title: 'JWT service',
          executable: true,
          skills: ['backend', 'security'],
          dependencies: ['task-1'],
        },
      ],
    },
  ],
});
```

### Using quality metrics
```typescript
// Enable quality tracking
const jetpack = new JetpackOrchestrator({
  workDir: '/path/to/project',
  enableQualityMetrics: true,
});

// Set baseline before starting work
await jetpack.createQualityBaseline({
  lintErrors: 0,
  typeErrors: 0,
  testsPassing: 50,
  testsFailing: 0,
  testCoverage: 80,
  buildSuccess: true,
});

// Quality checked automatically after each task
// Listen for regressions
jetpack.on('qualityRegression', ({ taskId, summary }) => {
  console.log(`Task ${taskId} caused regressions:`, summary.descriptions);
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

  // Hierarchical planning fields (optional)
  type?: 'epic' | 'task' | 'subtask' | 'leaf';  // Hierarchy level
  children?: PlanItem[];    // Nested items for epics/tasks
  parentId?: string;        // Reference to parent item
  executable?: boolean;     // Can agents claim this level? (default: true for task/subtask)
  autoDecompose?: boolean;  // Should agent break down further? (default: false)
}
```

**Hierarchy Levels:**
- **epic**: High-level feature domain, NOT directly claimable, must have children
- **task**: Concrete work item (15-60 min), claimable by agents
- **subtask**: Atomic step, only created for complex tasks
- **leaf**: Smallest unit, always atomic execution

## Troubleshooting

### Build Issues

```bash
# Clean rebuild
pnpm clean && pnpm install && pnpm build

# Build specific package
pnpm --filter @jetpack/orchestrator build
```

### Web UI Shows Wrong/Old Data

1. Check `JETPACK_WORK_DIR` points to correct project
2. Restart the web server after changing the env var
3. Verify `.beads/`, `.cass/`, `.jetpack/` exist in target directory

### MCP Server Not Connecting

1. Ensure it's built: `pnpm build`
2. Check path in `.claude/settings.local.json`
3. Restart Claude Code after config changes
4. Run `/mcp` in Claude Code to verify

### Plans Not Appearing in UI

1. Check `.jetpack/plans/` directory exists
2. Verify JSON has all required fields: `id`, `title`, `status`, `items`
3. Each item needs: `id`, `title`, `status`, `priority`, `skills`, `dependencies`

### Agents Not Claiming Tasks

1. Check agent skills match task `requiredSkills`
2. Verify task status is `ready` (dependencies satisfied)
3. Look at MCP Mail logs in `.jetpack/mail/`

### Running Jetpack in a Custom Directory

When working on a project outside the Jetpack repo, you need to tell Jetpack where your project is:

**Option 1: Use the `-d` flag (recommended)**
```bash
pnpm jetpack start -d /path/to/your/project
pnpm jetpack status -d /path/to/your/project
```

**Option 2: Set JETPACK_WORK_DIR environment variable**
```bash
# For CLI
JETPACK_WORK_DIR=/path/to/your/project pnpm jetpack start

# For web UI development
JETPACK_WORK_DIR=/path/to/your/project pnpm --filter @jetpack/web dev
```

**Option 3: cd to the directory first**
```bash
cd /path/to/your/project
/path/to/Jetpack/apps/cli/dist/index.js start
```

**Verifying correct directory:**
The CLI displays the working directory at startup:
```
Working directory: /path/to/your/project (from JETPACK_WORK_DIR)
# or
Working directory: /current/dir (from cwd)
```

Ensure it shows your intended project path, not the Jetpack repo.

### Task Failures and Retries

Tasks automatically retry on failure with exponential backoff:

| Retry | Backoff |
|-------|---------|
| 1st   | 30 seconds |
| 2nd   | 60 seconds |
| 3rd+  | Task marked permanently failed |

**Failure types:**
- `timeout`: Task exceeded 30-minute timeout
- `error`: Task threw an error during execution
- `stalled`: No output detected for extended period

**Retry fields on Task:**
```typescript
{
  retryCount: number;           // Current retry attempt (0-indexed)
  maxRetries: number;           // Max retries (default: 2)
  lastError: string;            // Error from last attempt
  lastAttemptAt: Date;          // Timestamp of last attempt
  failureType: 'timeout' | 'error' | 'stalled';
}
```

Failed tasks are released back to `ready` status so any available agent can retry them.

## Testing

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter @jetpack/beads-adapter test

# Run with coverage
pnpm test -- --coverage
```
