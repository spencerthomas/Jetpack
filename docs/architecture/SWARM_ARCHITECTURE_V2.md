# Jetpack Swarm Architecture v2

**Status**: Approved
**Date**: 2026-01-19
**Authors**: Jetpack Team
**Supersedes**: Original orchestrator-centric architecture

---

## Executive Summary

This document describes the architectural redesign of Jetpack from an orchestrator-centric model to a **decentralized agent swarm** architecture. The redesign addresses critical limitations discovered during production testing (277-task mortgage LOS build) and aligns with the vision of:

> Very long running, large agent swarms working to deliver functional software of high complexity, at very high quality. Works with Claude, Codex, Gemini, and other agent harnesses and coding models.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Architectural Principles](#architectural-principles)
3. [System Overview](#system-overview)
4. [Core Components](#core-components)
5. [Agent Protocol](#agent-protocol)
6. [Data Layer](#data-layer)
7. [Scaling Model](#scaling-model)
8. [Quality Assurance](#quality-assurance)
9. [Migration Path](#migration-path)

---

## Problem Statement

### Production Testing Results

During a 2-day production test building a mortgage loan origination system:

| Metric | Value |
|--------|-------|
| Total Tasks | 277 |
| Completed | 75 (27%) |
| Failed | 31 (11%) |
| Remaining | 171 (62%) |
| OOM Crashes | 5 |
| Manual Interventions | 10+ |

### Root Causes Identified

1. **Single Process Bottleneck**: All agents managed by one orchestrator process
2. **Memory-Centric State**: Task state, agent state kept in Node.js heap
3. **Non-Atomic Persistence**: JSONL writes corrupted on crash
4. **Tight Model Coupling**: Each AI model required custom executor code
5. **No Crash Recovery**: Session loss required manual intervention

### Why Incremental Fixes Won't Work

The original architecture has fundamental assumptions that conflict with the vision:

| Original Assumption | Vision Requirement |
|--------------------|--------------------|
| Orchestrator spawns/manages agents | Agents are independent, self-managing |
| Single machine execution | Distributed across multiple machines |
| Memory as coordination mechanism | Durable state survives any crash |
| Model-specific executors | Model-agnostic protocol |
| Hours-long sessions | Days/weeks-long campaigns |

---

## Architectural Principles

### 1. Agents Are Independent Processes

Agents are not "managed" by Jetpack. They are independent processes that:
- Start and stop on their own
- Self-register with the swarm
- Claim work from a shared queue
- Report their own progress and health

**Implication**: No IPC, no child process management, no single point of failure.

### 2. All State Is Durable

Every piece of coordination state persists to disk/database:
- Task definitions and status
- Agent registrations and heartbeats
- Messages between agents
- File leases
- Quality metrics

**Implication**: Any component can crash and restart without losing progress.

### 3. Protocol Over Implementation

Agents implement a protocol, not an interface. The protocol:
- Is language-agnostic (could be implemented in Python, Go, etc.)
- Is AI-model-agnostic (works with any underlying model)
- Is transport-agnostic (file-based, HTTP, or message queue)

**Implication**: New models require configuration, not code.

### 4. Horizontal Scaling By Default

Adding capacity means starting more agent processes:
- No reconfiguration required
- Agents can run on different machines
- Work distribution is automatic via task queue

**Implication**: Scale from 1 to 1000 agents with the same architecture.

### 5. Quality Is Built-In, Not Bolted-On

Quality gates are first-class citizens:
- Tasks don't complete until quality checks pass
- Regressions block the pipeline
- Quality metrics are tracked per-agent

**Implication**: High-quality output is the default, not an option.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         JETPACK SWARM                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    DATA LAYER (SQLite/Turso)                  │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │   │
│  │  │  Tasks   │ │  Agents  │ │ Messages │ │ Quality Metrics  │ │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
│         ▲              ▲              ▲              ▲               │
│         │              │              │              │               │
│  ┌──────┴──────────────┴──────────────┴──────────────┴──────┐       │
│  │                    COORDINATOR (Stateless)                │       │
│  │  • Monitors agent health    • Runs quality gates          │       │
│  │  • Releases stale leases    • Provides API/Dashboard      │       │
│  └───────────────────────────────────────────────────────────┘       │
│                                                                      │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   │
│  │ Agent 1 │  │ Agent 2 │  │ Agent 3 │  │ Agent 4 │  │ Agent N │   │
│  │ Claude  │  │ Codex   │  │ Gemini  │  │ Browser │  │ Custom  │   │
│  │ Code    │  │         │  │         │  │ Test    │  │         │   │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘   │
│       │            │            │            │            │          │
│       └────────────┴────────────┴────────────┴────────────┘          │
│                    All agents: independent processes                  │
│                    Same protocol, different AI backends               │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Task Creation**: Plans/tasks written to database
2. **Agent Registration**: Agent starts, registers capabilities
3. **Task Claiming**: Agent queries for matching tasks, claims one atomically
4. **Execution**: Agent does work, reports progress via heartbeats
5. **Completion**: Agent marks task complete/failed, updates quality metrics
6. **Coordination**: Coordinator monitors health, runs gates, handles stale state

---

## Core Components

### 1. Data Layer (`@jetpack-agent/data`)

The single source of truth for all swarm state.

```typescript
// Data layer interface
interface JetpackDataLayer {
  // Task operations
  tasks: {
    create(task: TaskDefinition): Promise<Task>;
    claim(agentId: string, filter?: TaskFilter): Promise<Task | null>;
    updateProgress(taskId: string, progress: Progress): Promise<void>;
    complete(taskId: string, result: TaskResult): Promise<void>;
    fail(taskId: string, error: FailureInfo): Promise<void>;
    list(filter?: TaskFilter): Promise<Task[]>;
  };

  // Agent registry
  agents: {
    register(agent: AgentRegistration): Promise<void>;
    heartbeat(agentId: string, status: AgentStatus): Promise<void>;
    list(filter?: AgentFilter): Promise<Agent[]>;
    deregister(agentId: string): Promise<void>;
  };

  // Messaging
  messages: {
    send(message: Message): Promise<void>;
    receive(agentId: string): Promise<Message[]>;
    acknowledge(messageId: string): Promise<void>;
    broadcast(message: Message): Promise<void>;
  };

  // File leasing
  leases: {
    acquire(path: string, agentId: string, durationMs: number): Promise<boolean>;
    release(path: string, agentId: string): Promise<void>;
    check(path: string): Promise<LeaseInfo | null>;
  };

  // Quality metrics
  quality: {
    recordSnapshot(snapshot: QualitySnapshot): Promise<void>;
    getBaseline(): Promise<QualityBaseline | null>;
    setBaseline(baseline: QualityBaseline): Promise<void>;
    detectRegressions(taskId: string): Promise<Regression[]>;
  };
}
```

**Implementations**:
- `SQLiteDataLayer` - Local file-based (development, single-machine)
- `TursoDataLayer` - Cloud-hosted SQLite (production, multi-machine)

### 2. Coordinator (`@jetpack-agent/coordinator`)

Lightweight, stateless process that monitors swarm health.

```typescript
class JetpackCoordinator {
  constructor(private data: JetpackDataLayer) {}

  async start(): Promise<void> {
    // All state is in data layer, coordinator is stateless
    await this.runMonitorLoop();
  }

  private async runMonitorLoop(): Promise<void> {
    while (this.running) {
      await this.checkAgentHealth();      // Deregister dead agents
      await this.releaseStaleLeases();    // Free stuck file locks
      await this.unblockReadyTasks();     // Dependencies resolved
      await this.runQualityGates();       // Check pending completions
      await this.emitMetrics();           // Dashboard/monitoring
      await sleep(this.monitorInterval);
    }
  }

  // API for dashboards
  getStatus(): SwarmStatus;
  getAgents(): Agent[];
  getTasks(filter?: TaskFilter): Task[];
}
```

**Key Property**: Coordinator can crash and restart without any impact on running agents.

### 3. Agent Harness (`@jetpack-agent/harness`)

Generic wrapper that turns any AI CLI into a Jetpack agent.

```typescript
// Agent harness - wraps any CLI
class AgentHarness {
  constructor(private config: AgentConfig, private data: JetpackDataLayer) {}

  async start(): Promise<void> {
    // 1. Register with swarm
    await this.data.agents.register({
      id: this.agentId,
      capabilities: this.config.capabilities,
      startedAt: new Date(),
    });

    // 2. Start work loop
    await this.workLoop();
  }

  private async workLoop(): Promise<void> {
    while (this.running) {
      // Heartbeat
      await this.data.agents.heartbeat(this.agentId, { status: 'idle' });

      // Try to claim work
      const task = await this.data.tasks.claim(this.agentId, {
        skills: this.config.capabilities.skills,
      });

      if (!task) {
        await sleep(this.config.pollInterval);
        continue;
      }

      // Execute task using configured CLI
      const result = await this.executeTask(task);

      // Report result
      if (result.success) {
        await this.data.tasks.complete(task.id, result);
      } else {
        await this.data.tasks.fail(task.id, result.error);
      }
    }
  }

  private async executeTask(task: Task): Promise<ExecutionResult> {
    const prompt = this.buildPrompt(task);

    // Spawn the configured CLI
    const proc = spawn(this.config.command, [...this.config.args, prompt], {
      cwd: this.config.workDir,
    });

    // Monitor and capture output
    return this.monitorExecution(proc, task);
  }
}
```

### 4. Agent Configurations

New models supported via configuration, not code:

```yaml
# agents/claude-code.yaml
name: claude-code-agent
command: claude
args:
  - --print
  - --dangerously-skip-permissions
capabilities:
  skills: [typescript, react, nextjs, backend]
  maxTaskMinutes: 60
  canRunTests: true
  canRunBuild: true
promptTemplate: |
  You are {{agent.name}}, working on a software project.

  ## Task
  **Title**: {{task.title}}
  **Priority**: {{task.priority}}
  **Description**: {{task.description}}

  ## Context
  {{#each memories}}
  - {{this.content}}
  {{/each}}

  ## Instructions
  Complete this task. Do not commit changes.
```

```yaml
# agents/codex.yaml
name: codex-agent
command: codex
args:
  - exec
  - --full-auto
capabilities:
  skills: [python, scripting, data-processing]
  maxTaskMinutes: 30
promptTemplate: |
  Task: {{task.title}}
  {{task.description}}
  Working directory: {{workDir}}
```

```yaml
# agents/gemini.yaml
name: gemini-agent
command: gemini-cli
args:
  - run
  - --auto
capabilities:
  skills: [documentation, analysis, research]
  maxTaskMinutes: 20
```

```yaml
# agents/browser.yaml
name: browser-test-agent
command: node
args:
  - ./agents/browser-worker.js
capabilities:
  skills: [e2e-testing, visual-regression, accessibility]
  type: browser
settings:
  headless: true
  targetUrl: ${PREVIEW_URL}
```

---

## Agent Protocol

See [AGENT_PROTOCOL.md](./AGENT_PROTOCOL.md) for full specification.

### Summary

The protocol defines how agents interact with the swarm, independent of implementation:

| Operation | Description |
|-----------|-------------|
| `REGISTER` | Agent announces itself and capabilities |
| `HEARTBEAT` | Agent reports it's alive and current status |
| `CLAIM` | Agent requests a task matching its capabilities |
| `PROGRESS` | Agent reports task progress |
| `COMPLETE` | Agent marks task successfully done |
| `FAIL` | Agent marks task as failed |
| `SEND_MESSAGE` | Agent sends message to another agent or broadcast |
| `RECEIVE_MESSAGES` | Agent retrieves pending messages |
| `ACQUIRE_LEASE` | Agent locks a file for editing |
| `RELEASE_LEASE` | Agent releases file lock |

**Protocol Transports**:
- **Direct DB**: Agent connects directly to SQLite/Turso
- **HTTP API**: Agent calls coordinator's REST API
- **File-based**: Agent reads/writes protocol files (fallback)

---

## Data Layer

### Schema

```sql
-- Tasks table
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  type TEXT NOT NULL DEFAULT 'code',

  -- Assignment
  assigned_agent TEXT,
  claimed_at DATETIME,

  -- Dependencies
  dependencies TEXT, -- JSON array of task IDs
  blockers TEXT,     -- JSON array of task IDs

  -- Skills required
  required_skills TEXT, -- JSON array

  -- Execution tracking
  started_at DATETIME,
  completed_at DATETIME,

  -- Retry handling
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 2,
  last_error TEXT,
  failure_type TEXT,

  -- Metadata
  branch TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- Quality
  quality_snapshot_id TEXT
);

-- Agents table
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'claude-code', 'codex', 'gemini', 'browser', 'custom'
  status TEXT NOT NULL DEFAULT 'idle',

  -- Capabilities
  skills TEXT, -- JSON array
  max_task_minutes INTEGER,

  -- Health
  last_heartbeat DATETIME,
  current_task_id TEXT,
  tasks_completed INTEGER DEFAULT 0,
  tasks_failed INTEGER DEFAULT 0,

  -- Machine info (for distributed)
  machine_id TEXT,
  pid INTEGER,

  -- Timestamps
  registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (current_task_id) REFERENCES tasks(id)
);

-- Messages table
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  from_agent TEXT NOT NULL,
  to_agent TEXT, -- NULL = broadcast
  payload TEXT, -- JSON

  -- Delivery tracking
  ack_required BOOLEAN DEFAULT FALSE,
  acknowledged_at DATETIME,
  acknowledged_by TEXT,

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME
);

-- File leases table
CREATE TABLE leases (
  file_path TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  acquired_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,

  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Quality snapshots
CREATE TABLE quality_snapshots (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  agent_id TEXT,

  -- Metrics
  lint_errors INTEGER,
  lint_warnings INTEGER,
  type_errors INTEGER,
  tests_passing INTEGER,
  tests_failing INTEGER,
  test_coverage REAL,
  build_success BOOLEAN,

  -- Timestamps
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Quality baseline
CREATE TABLE quality_baseline (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton
  lint_errors INTEGER NOT NULL,
  lint_warnings INTEGER NOT NULL,
  type_errors INTEGER NOT NULL,
  tests_passing INTEGER NOT NULL,
  tests_failing INTEGER NOT NULL,
  test_coverage REAL NOT NULL,
  build_success BOOLEAN NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_agent);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_heartbeat ON agents(last_heartbeat);
CREATE INDEX idx_messages_to ON messages(to_agent);
CREATE INDEX idx_leases_expires ON leases(expires_at);
```

### Local vs Cloud

**Local (SQLite)**:
```typescript
import Database from 'better-sqlite3';

const db = new Database('.jetpack/jetpack.db');
```

**Cloud (Turso)**:
```typescript
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
```

**Abstraction**:
```typescript
// Same interface, different backends
const dataLayer = process.env.TURSO_DATABASE_URL
  ? new TursoDataLayer(tursoConfig)
  : new SQLiteDataLayer(sqliteConfig);
```

---

## Scaling Model

### Single Machine (Development)

```
┌─────────────────────────────────────────┐
│            Developer Machine             │
│                                         │
│  .jetpack/jetpack.db (SQLite)           │
│         ▲                               │
│         │                               │
│  ┌──────┴──────┐                       │
│  │ Coordinator │ (optional)            │
│  └─────────────┘                       │
│                                         │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐      │
│  │ A1  │ │ A2  │ │ A3  │ │ A4  │      │
│  └─────┘ └─────┘ └─────┘ └─────┘      │
└─────────────────────────────────────────┘
```

**Start agents**:
```bash
# Terminal 1
jetpack agent start --config agents/claude-code.yaml

# Terminal 2
jetpack agent start --config agents/codex.yaml

# Terminal 3 (optional coordinator)
jetpack coordinator start
```

### Multi-Machine (Production)

```
┌─────────────────────────────────────────┐
│              Turso Cloud DB              │
│         (SQLite edge database)           │
└─────────────────────────────────────────┘
         ▲              ▲              ▲
         │              │              │
┌────────┴────┐  ┌─────┴─────┐  ┌─────┴─────┐
│  Machine A   │  │ Machine B  │  │ Machine C  │
│             │  │            │  │            │
│ Coordinator │  │ 4 Claude   │  │ 4 Codex    │
│ Dashboard   │  │ Agents     │  │ Agents     │
│ 2 Agents    │  │            │  │            │
└─────────────┘  └────────────┘  └────────────┘
```

**Environment**:
```bash
# All machines share these
export TURSO_DATABASE_URL="libsql://jetpack-xxx.turso.io"
export TURSO_AUTH_TOKEN="..."
export JETPACK_WORK_DIR="/shared/project"  # NFS or synced
```

### Agent Pools

Group agents by capability for efficient routing:

```typescript
const pools: AgentPool[] = [
  {
    name: 'claude-pool',
    type: 'claude-code',
    targetCount: 4,
    skills: ['typescript', 'react', 'complex-reasoning'],
    taskFilter: { priorities: ['critical', 'high'] },
  },
  {
    name: 'codex-pool',
    type: 'codex',
    targetCount: 4,
    skills: ['python', 'scripting'],
    taskFilter: { priorities: ['medium', 'low'] },
  },
  {
    name: 'browser-pool',
    type: 'browser',
    targetCount: 2,
    skills: ['e2e-testing'],
    taskFilter: { type: 'browser_test' },
  },
];
```

---

## Quality Assurance

### Quality Gates

Tasks don't complete until quality checks pass:

```typescript
// Quality gate configuration
const qualityGates: QualityGate[] = [
  {
    name: 'build',
    command: 'pnpm build',
    blocking: true,
    required: true,
  },
  {
    name: 'typecheck',
    command: 'pnpm typecheck',
    blocking: true,
    required: true,
  },
  {
    name: 'lint',
    command: 'pnpm lint',
    blocking: true,
    maxErrors: 0,
  },
  {
    name: 'test',
    command: 'pnpm test',
    blocking: true,
    minCoverage: 80,
  },
];

// Gate check flow
async function checkQualityGates(taskId: string): Promise<GateResult> {
  const snapshot = await runQualityChecks();
  const baseline = await data.quality.getBaseline();

  const regressions = detectRegressions(baseline, snapshot);

  if (regressions.length > 0) {
    return {
      passed: false,
      regressions,
      message: 'Quality regression detected',
    };
  }

  return { passed: true };
}
```

### Regression Detection

```typescript
interface Regression {
  metric: string;
  baseline: number;
  current: number;
  delta: number;
  severity: 'warning' | 'error';
}

function detectRegressions(baseline: QualityBaseline, current: QualitySnapshot): Regression[] {
  const regressions: Regression[] = [];

  // Build must succeed
  if (baseline.buildSuccess && !current.buildSuccess) {
    regressions.push({
      metric: 'build',
      baseline: 1,
      current: 0,
      delta: -1,
      severity: 'error',
    });
  }

  // Type errors must not increase
  if (current.typeErrors > baseline.typeErrors) {
    regressions.push({
      metric: 'type_errors',
      baseline: baseline.typeErrors,
      current: current.typeErrors,
      delta: current.typeErrors - baseline.typeErrors,
      severity: 'error',
    });
  }

  // Test coverage must not decrease significantly
  if (current.testCoverage < baseline.testCoverage - 5) {
    regressions.push({
      metric: 'test_coverage',
      baseline: baseline.testCoverage,
      current: current.testCoverage,
      delta: current.testCoverage - baseline.testCoverage,
      severity: 'warning',
    });
  }

  return regressions;
}
```

---

## Migration Path

### From v1 to v2

This is a clean break, not a migration. Users with existing `.beads/` data can:

1. **Export tasks**: `jetpack export --format json > tasks.json`
2. **Initialize v2**: `jetpack init --v2`
3. **Import tasks**: `jetpack import tasks.json`

### Beads Standalone

Users who want just task tracking without the full swarm can use Beads independently:

```bash
npm install @jetpack-agent/beads-adapter

# Use Beads directly
import { BeadsAdapter } from '@jetpack-agent/beads-adapter';
const beads = new BeadsAdapter({ workDir: '.' });
```

---

## File Structure

```
.jetpack/
├── jetpack.db              # SQLite database (local mode)
├── config.yaml             # Swarm configuration
├── agents/                 # Agent configurations
│   ├── claude-code.yaml
│   ├── codex.yaml
│   └── browser.yaml
├── checkpoints/            # State snapshots
├── visual-baselines/       # Browser test baselines
└── logs/                   # Agent logs

packages/
├── data/                   # @jetpack-agent/data
│   ├── src/
│   │   ├── DataLayer.ts
│   │   ├── SQLiteDataLayer.ts
│   │   ├── TursoDataLayer.ts
│   │   └── schema.sql
│   └── package.json
├── coordinator/            # @jetpack-agent/coordinator
│   ├── src/
│   │   ├── Coordinator.ts
│   │   ├── QualityGates.ts
│   │   └── api/
│   └── package.json
├── harness/                # @jetpack-agent/harness
│   ├── src/
│   │   ├── AgentHarness.ts
│   │   ├── PromptBuilder.ts
│   │   └── ProcessMonitor.ts
│   └── package.json
├── protocol/               # @jetpack-agent/protocol
│   ├── src/
│   │   ├── types.ts
│   │   └── operations.ts
│   └── package.json
└── cli/                    # @jetpack-agent/cli (updated)
    └── src/
        └── commands/
            ├── agent.ts    # jetpack agent start/stop
            ├── coord.ts    # jetpack coordinator
            └── status.ts   # jetpack status
```

---

## Next Steps

1. **Phase 1**: Build data layer with SQLite/Turso support
2. **Phase 2**: Implement agent protocol and harness
3. **Phase 3**: Add coordinator and quality gates
4. **Phase 4**: Browser testing integration
5. **Phase 5**: Dashboard and observability

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for detailed breakdown.
