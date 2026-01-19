# Jetpack Swarm v2 - Implementation Plan

**Version**: 1.0.0
**Date**: 2026-01-19
**Branch**: `feat/swarm-architecture-v2`

---

## Overview

This document details the implementation plan for Jetpack Swarm v2, transitioning from the orchestrator-centric architecture to a decentralized agent swarm model.

### Goals

1. **Stability**: Survive crashes, OOM, and restarts without data loss
2. **Scalability**: Support 1-1000+ agents across multiple machines
3. **Flexibility**: Add new AI models via configuration, not code
4. **Quality**: Built-in quality gates and regression detection
5. **Observability**: Real-time visibility into swarm activity

### Timeline

| Phase | Focus | Packages | Status |
|-------|-------|----------|--------|
| 1 | Data Layer | `@jetpack-agent/data` | Not Started |
| 2 | Agent Protocol & Harness | `@jetpack-agent/protocol`, `@jetpack-agent/harness` | Not Started |
| 3 | Coordinator | `@jetpack-agent/coordinator` | Not Started |
| 4 | CLI & Integration | `@jetpack-agent/cli` updates | Not Started |
| 5 | Quality & Browser Testing | Quality gates, browser agents | Not Started |
| 6 | Dashboard & Observability | Web UI, metrics | Not Started |

---

## Phase 1: Data Layer

**Goal**: Create the durable state foundation that all other components depend on.

### Package: `@jetpack-agent/data`

#### 1.1 Schema Design

**File**: `packages/data/src/schema.sql`

Create SQLite schema for:
- Tasks table with full lifecycle tracking
- Agents table with registration and health
- Messages table for inter-agent communication
- Leases table for file locking
- Quality snapshots and baselines
- Proper indexes for common queries

**Acceptance Criteria**:
- [ ] Schema compiles without errors
- [ ] All foreign key relationships defined
- [ ] Indexes on frequently queried columns
- [ ] Migration system in place

#### 1.2 DataLayer Interface

**File**: `packages/data/src/DataLayer.ts`

Define the abstract interface that both SQLite and Turso implementations will use:

```typescript
interface DataLayer {
  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;

  // Tasks
  tasks: TaskOperations;

  // Agents
  agents: AgentOperations;

  // Messages
  messages: MessageOperations;

  // Leases
  leases: LeaseOperations;

  // Quality
  quality: QualityOperations;

  // Transactions
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}
```

**Acceptance Criteria**:
- [ ] Interface fully typed
- [ ] All operations documented
- [ ] Transaction support defined

#### 1.3 SQLite Implementation

**File**: `packages/data/src/SQLiteDataLayer.ts`

Local SQLite implementation using `better-sqlite3`:

```typescript
import Database from 'better-sqlite3';

class SQLiteDataLayer implements DataLayer {
  private db: Database.Database;

  async initialize(): Promise<void> {
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    await this.runMigrations();
  }

  // Task operations with atomic claims
  tasks = {
    claim: (agentId: string, filter?: TaskFilter): Task | null => {
      return this.db.transaction(() => {
        const task = this.db.prepare(`
          SELECT * FROM tasks
          WHERE status = 'ready'
            AND (? IS NULL OR required_skills LIKE '%' || ? || '%')
          ORDER BY priority_order, created_at
          LIMIT 1
        `).get(filter?.skills?.join(','), filter?.skills?.join(','));

        if (!task) return null;

        this.db.prepare(`
          UPDATE tasks
          SET status = 'claimed', assigned_agent = ?, claimed_at = datetime('now')
          WHERE id = ?
        `).run(agentId, task.id);

        return { ...task, status: 'claimed', assigned_agent: agentId };
      })();
    },
    // ... other operations
  };
}
```

**Acceptance Criteria**:
- [ ] All interface methods implemented
- [ ] Atomic task claiming works
- [ ] WAL mode enabled for concurrent reads
- [ ] Proper error handling
- [ ] Unit tests pass

#### 1.4 Turso Implementation

**File**: `packages/data/src/TursoDataLayer.ts`

Cloud SQLite implementation using `@libsql/client`:

```typescript
import { createClient, Client } from '@libsql/client';

class TursoDataLayer implements DataLayer {
  private client: Client;

  async initialize(): Promise<void> {
    this.client = createClient({
      url: this.config.url,
      authToken: this.config.authToken,
    });
    await this.runMigrations();
  }

  // Same operations but using Turso's async API
  tasks = {
    claim: async (agentId: string, filter?: TaskFilter): Promise<Task | null> => {
      const result = await this.client.execute({
        sql: `
          UPDATE tasks
          SET status = 'claimed', assigned_agent = ?, claimed_at = datetime('now')
          WHERE id = (
            SELECT id FROM tasks
            WHERE status = 'ready'
            ORDER BY priority_order, created_at
            LIMIT 1
          )
          RETURNING *
        `,
        args: [agentId],
      });

      return result.rows[0] as Task || null;
    },
  };
}
```

**Acceptance Criteria**:
- [ ] All interface methods implemented
- [ ] Works with Turso cloud database
- [ ] Proper async/await handling
- [ ] Connection pooling/retry
- [ ] Integration tests pass

#### 1.5 Factory Function

**File**: `packages/data/src/index.ts`

```typescript
export function createDataLayer(config: DataLayerConfig): DataLayer {
  if (config.turso) {
    return new TursoDataLayer(config.turso);
  }
  return new SQLiteDataLayer(config.sqlite);
}
```

#### 1.6 Migrations System

**File**: `packages/data/src/migrations/`

```
migrations/
├── 001_initial_schema.sql
├── 002_add_quality_tables.sql
└── index.ts
```

**Acceptance Criteria**:
- [ ] Migrations run in order
- [ ] Migration state tracked in DB
- [ ] Rollback support (optional)

---

## Phase 2: Agent Protocol & Harness

**Goal**: Define the protocol and create the generic agent wrapper.

### Package: `@jetpack-agent/protocol`

#### 2.1 Type Definitions

**File**: `packages/protocol/src/types.ts`

All protocol types:
- Request/Response types for each operation
- Task, Agent, Message types
- Enums for statuses, priorities, phases

**Acceptance Criteria**:
- [ ] All types from AGENT_PROTOCOL.md defined
- [ ] Zod schemas for runtime validation
- [ ] Exported for use by other packages

#### 2.2 Operation Definitions

**File**: `packages/protocol/src/operations.ts`

```typescript
export const Operations = {
  REGISTER: 'REGISTER',
  HEARTBEAT: 'HEARTBEAT',
  CLAIM: 'CLAIM',
  PROGRESS: 'PROGRESS',
  COMPLETE: 'COMPLETE',
  FAIL: 'FAIL',
  SEND_MESSAGE: 'SEND_MESSAGE',
  RECEIVE_MESSAGES: 'RECEIVE_MESSAGES',
  ACQUIRE_LEASE: 'ACQUIRE_LEASE',
  RELEASE_LEASE: 'RELEASE_LEASE',
} as const;
```

### Package: `@jetpack-agent/harness`

#### 2.3 Agent Configuration Schema

**File**: `packages/harness/src/config.ts`

```typescript
interface AgentConfig {
  // Identity
  name: string;
  type: AgentType;

  // Execution
  command: string;
  args: string[];
  workDir?: string;
  env?: Record<string, string>;

  // Capabilities
  capabilities: {
    skills: string[];
    maxTaskMinutes: number;
    canRunTests?: boolean;
    canRunBuild?: boolean;
    canAccessBrowser?: boolean;
  };

  // Prompt template (Handlebars)
  promptTemplate: string;

  // Behavior
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
  maxConsecutiveFailures?: number;

  // Data layer connection
  dataLayer: {
    type: 'sqlite' | 'turso';
    // ... connection details
  };
}
```

#### 2.4 Agent Harness Core

**File**: `packages/harness/src/AgentHarness.ts`

```typescript
class AgentHarness {
  private agentId: string;
  private running = false;
  private currentTask: Task | null = null;

  constructor(
    private config: AgentConfig,
    private data: DataLayer
  ) {
    this.agentId = `${config.name}-${randomUUID().slice(0, 8)}`;
  }

  async start(): Promise<void> {
    await this.register();
    this.startHeartbeatLoop();
    await this.workLoop();
  }

  private async register(): Promise<void> {
    await this.data.agents.register({
      id: this.agentId,
      name: this.config.name,
      type: this.config.type,
      capabilities: this.config.capabilities,
    });
  }

  private async workLoop(): Promise<void> {
    while (this.running) {
      const task = await this.data.tasks.claim(this.agentId, {
        skills: this.config.capabilities.skills,
      });

      if (!task) {
        await sleep(this.config.pollIntervalMs || 30000);
        continue;
      }

      this.currentTask = task;
      const result = await this.executeTask(task);

      if (result.success) {
        await this.data.tasks.complete(task.id, result);
      } else {
        await this.data.tasks.fail(task.id, result.error);
      }

      this.currentTask = null;
    }
  }

  private async executeTask(task: Task): Promise<ExecutionResult> {
    const prompt = this.buildPrompt(task);
    return this.runCommand(prompt, task);
  }
}
```

**Acceptance Criteria**:
- [ ] Registration works
- [ ] Heartbeat loop runs
- [ ] Work loop claims and executes tasks
- [ ] Graceful shutdown releases resources
- [ ] Unit tests pass

#### 2.5 Prompt Builder

**File**: `packages/harness/src/PromptBuilder.ts`

Handlebars-based prompt template rendering:

```typescript
import Handlebars from 'handlebars';

class PromptBuilder {
  private template: HandlebarsTemplateDelegate;

  constructor(templateString: string) {
    this.template = Handlebars.compile(templateString);
  }

  build(context: PromptContext): string {
    return this.template({
      agent: context.agent,
      task: context.task,
      memories: context.memories,
      workDir: context.workDir,
    });
  }
}
```

#### 2.6 Process Monitor

**File**: `packages/harness/src/ProcessMonitor.ts`

Monitor spawned AI CLI process using safe execution:

```typescript
import { spawn } from 'child_process';

// NOTE: Use spawn() with explicit args array - NOT shell exec()
// This prevents command injection vulnerabilities
class ProcessMonitor {
  async run(command: string, args: string[], options: RunOptions): Promise<ProcessResult> {
    // spawn with args array is safe from injection
    const proc = spawn(command, args, {
      cwd: options.workDir,
      env: options.env,
      shell: false, // Explicitly disable shell
    });

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
    }, options.timeoutMs);

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => { stdout += data; });
    proc.stderr?.on('data', (data) => { stderr += data; });

    return new Promise((resolve) => {
      proc.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          success: code === 0,
          exitCode: code,
          stdout,
          stderr,
        });
      });
    });
  }
}
```

#### 2.7 Built-in Agent Configurations

**Files**: `packages/harness/configs/`

```
configs/
├── claude-code.yaml
├── codex.yaml
├── gemini.yaml
└── browser.yaml
```

**Example** (`claude-code.yaml`):
```yaml
name: claude-code
type: claude-code
command: claude
args:
  - --print
  - --dangerously-skip-permissions
capabilities:
  skills:
    - typescript
    - javascript
    - react
    - nextjs
    - backend
    - api
  maxTaskMinutes: 60
  canRunTests: true
  canRunBuild: true
promptTemplate: |
  You are {{agent.name}}, an AI software engineer working on a project.

  ## Current Task
  **ID**: {{task.id}}
  **Title**: {{task.title}}
  **Priority**: {{task.priority}}

  ### Description
  {{task.description}}

  {{#if task.files}}
  ### Files to modify
  {{#each task.files}}
  - {{this}}
  {{/each}}
  {{/if}}

  {{#if memories}}
  ## Relevant Context
  {{#each memories}}
  - {{this.content}}
  {{/each}}
  {{/if}}

  ## Working Directory
  {{workDir}}

  ## Instructions
  1. Read existing code to understand patterns
  2. Implement the required changes
  3. Follow existing code style
  4. Do NOT commit changes
  5. Summarize what you did when complete
pollIntervalMs: 30000
heartbeatIntervalMs: 10000
```

---

## Phase 3: Coordinator

**Goal**: Build the stateless coordinator that monitors swarm health.

### Package: `@jetpack-agent/coordinator`

#### 3.1 Coordinator Core

**File**: `packages/coordinator/src/Coordinator.ts`

```typescript
class JetpackCoordinator {
  constructor(
    private data: DataLayer,
    private config: CoordinatorConfig
  ) {}

  async start(): Promise<void> {
    console.log('Coordinator starting...');
    await this.runMonitorLoop();
  }

  private async runMonitorLoop(): Promise<void> {
    while (this.running) {
      await this.checkAgentHealth();
      await this.releaseStaleLeases();
      await this.unblockReadyTasks();
      await this.retryEligibleTasks();
      await this.runQualityGates();
      await sleep(this.config.monitorIntervalMs);
    }
  }

  private async checkAgentHealth(): Promise<void> {
    const staleThreshold = Date.now() - (2 * 60 * 1000); // 2 minutes
    const staleAgents = await this.data.agents.findStale(staleThreshold);

    for (const agent of staleAgents) {
      console.log(`Agent ${agent.id} is stale, releasing tasks...`);
      await this.data.agents.deregister(agent.id);

      if (agent.currentTaskId) {
        await this.data.tasks.release(agent.currentTaskId, 'agent_stale');
      }
    }
  }

  private async releaseStaleLeases(): Promise<void> {
    const expiredLeases = await this.data.leases.findExpired();

    for (const lease of expiredLeases) {
      console.log(`Releasing expired lease on ${lease.filePath}`);
      await this.data.leases.forceRelease(lease.filePath);
    }
  }

  private async unblockReadyTasks(): Promise<void> {
    // Find tasks whose dependencies are all complete
    await this.data.tasks.updateBlockedToReady();
  }

  private async retryEligibleTasks(): Promise<void> {
    // Find failed tasks under retry limit, reset to ready
    const now = Date.now();
    const tasks = await this.data.tasks.findRetryEligible(now);

    for (const task of tasks) {
      console.log(`Retrying task ${task.id} (attempt ${task.retryCount + 1})`);
      await this.data.tasks.resetForRetry(task.id);
    }
  }
}
```

**Acceptance Criteria**:
- [ ] Monitor loop runs continuously
- [ ] Stale agents detected and cleaned up
- [ ] Expired leases released
- [ ] Blocked tasks unblocked when ready
- [ ] Retry logic works correctly

#### 3.2 Quality Gates

**File**: `packages/coordinator/src/QualityGates.ts`

```typescript
import { execFileNoThrow } from '../utils/execFileNoThrow.js';

interface QualityGate {
  name: string;
  command: string;
  args: string[];
  blocking: boolean;
  parse: (output: string) => GateResult;
}

class QualityGateRunner {
  private gates: QualityGate[] = [
    {
      name: 'build',
      command: 'pnpm',
      args: ['build'],
      blocking: true,
      parse: (output) => ({ passed: !output.includes('error') }),
    },
    {
      name: 'typecheck',
      command: 'pnpm',
      args: ['typecheck'],
      blocking: true,
      parse: (output) => {
        const errors = (output.match(/error TS/g) || []).length;
        return { passed: errors === 0, errors };
      },
    },
    {
      name: 'lint',
      command: 'pnpm',
      args: ['lint'],
      blocking: true,
      parse: (output) => {
        const errors = parseInt(output.match(/(\d+) errors?/)?.[1] || '0');
        return { passed: errors === 0, errors };
      },
    },
    {
      name: 'test',
      command: 'pnpm',
      args: ['test', '--passWithNoTests'],
      blocking: true,
      parse: (output) => {
        const failed = parseInt(output.match(/(\d+) failed/)?.[1] || '0');
        return { passed: failed === 0, failed };
      },
    },
  ];

  async runGates(taskId: string): Promise<QualityResult> {
    const results: GateResult[] = [];

    for (const gate of this.gates) {
      // Use execFileNoThrow for safe command execution
      const { stdout, stderr } = await execFileNoThrow(gate.command, gate.args);
      const output = stdout + stderr;
      const result = gate.parse(output);
      results.push({ gate: gate.name, ...result });

      if (gate.blocking && !result.passed) {
        return { passed: false, results, blockedBy: gate.name };
      }
    }

    return { passed: true, results };
  }
}
```

#### 3.3 HTTP API

**File**: `packages/coordinator/src/api/`

REST API for protocol operations and dashboard:

```
routes/
├── agents.ts     # Agent registration, heartbeat
├── tasks.ts      # Task operations
├── messages.ts   # Messaging
├── leases.ts     # File leasing
├── status.ts     # Swarm status
└── events.ts     # SSE for real-time updates
```

**Status endpoint example**:
```typescript
// GET /api/status
{
  "swarm": {
    "status": "healthy",
    "uptime": 3600000
  },
  "agents": {
    "total": 8,
    "active": 6,
    "idle": 2,
    "byType": {
      "claude-code": 4,
      "codex": 2,
      "browser": 2
    }
  },
  "tasks": {
    "total": 277,
    "pending": 50,
    "ready": 100,
    "claimed": 6,
    "completed": 100,
    "failed": 21
  },
  "quality": {
    "baseline": { },
    "current": { },
    "regressions": 0
  }
}
```

---

## Phase 4: CLI Integration

**Goal**: Update CLI to support new architecture.

### Package: `@jetpack-agent/cli`

#### 4.1 Agent Command

**File**: `packages/cli/src/commands/agent.ts`

```bash
# Start an agent
jetpack agent start --config agents/claude-code.yaml

# Start with inline config
jetpack agent start --type codex --skills python,scripting

# List running agents
jetpack agent list

# Stop an agent
jetpack agent stop agent-abc123
```

#### 4.2 Coordinator Command

**File**: `packages/cli/src/commands/coordinator.ts`

```bash
# Start coordinator
jetpack coordinator start

# Start with options
jetpack coordinator start --port 3001 --monitor-interval 60000

# Coordinator status
jetpack coordinator status
```

#### 4.3 Status Command

**File**: `packages/cli/src/commands/status.ts`

```bash
# Swarm status
jetpack status

# Detailed output
jetpack status --verbose

# Watch mode
jetpack status --watch
```

Output:
```
JETPACK SWARM STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Agents (8 total)
  ● claude-code-a1b2c3d4  [busy]   task: E3-T1  (15m)
  ● claude-code-e5f6g7h8  [busy]   task: E4-T1  (8m)
  ● codex-i9j0k1l2        [idle]
  ● codex-m3n4o5p6        [busy]   task: E5-T3  (3m)
  ○ browser-q7r8s9t0      [offline]

Tasks (277 total)
  Completed: ████████████░░░░░░░░ 100 (36%)
  Ready:     ████████░░░░░░░░░░░░  80 (29%)
  Claimed:   ██░░░░░░░░░░░░░░░░░░   6 (2%)
  Failed:    ███░░░░░░░░░░░░░░░░░  21 (8%)
  Pending:   ███████░░░░░░░░░░░░░  70 (25%)

Quality
  Build:     ✓ passing
  Types:     ✓ 0 errors
  Lint:      ✓ 0 errors
  Tests:     ✓ 150/150 passing
  Coverage:  85%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### 4.4 Task Commands

**File**: `packages/cli/src/commands/task.ts`

```bash
# Create task
jetpack task create --title "Fix login bug" --priority high

# List tasks
jetpack task list --status ready

# Import tasks from JSON
jetpack task import tasks.json

# Export tasks
jetpack task export --format json > tasks.json
```

#### 4.5 Init Command

**File**: `packages/cli/src/commands/init.ts`

```bash
# Initialize new Jetpack project
jetpack init

# With Turso
jetpack init --turso

# With specific agent configs
jetpack init --agents claude-code,codex
```

Creates:
```
.jetpack/
├── jetpack.db          # SQLite database
├── config.yaml         # Swarm configuration
└── agents/             # Agent configs
    └── claude-code.yaml
```

---

## Phase 5: Quality & Browser Testing

**Goal**: Implement quality gates and browser testing agents.

#### 5.1 Quality Snapshot Service

**File**: `packages/coordinator/src/services/QualityService.ts`

```typescript
import { execFileNoThrow } from '../utils/execFileNoThrow.js';

class QualityService {
  async captureSnapshot(taskId: string, agentId: string): Promise<QualitySnapshot> {
    const [build, types, lint, tests] = await Promise.all([
      this.runBuild(),
      this.runTypecheck(),
      this.runLint(),
      this.runTests(),
    ]);

    const snapshot: QualitySnapshot = {
      id: randomUUID(),
      taskId,
      agentId,
      buildSuccess: build.success,
      typeErrors: types.errors,
      lintErrors: lint.errors,
      lintWarnings: lint.warnings,
      testsPassing: tests.passing,
      testsFailing: tests.failing,
      testCoverage: tests.coverage,
      recordedAt: new Date(),
    };

    await this.data.quality.recordSnapshot(snapshot);
    return snapshot;
  }

  private async runBuild(): Promise<BuildResult> {
    const { stdout, stderr, status } = await execFileNoThrow('pnpm', ['build']);
    return { success: status === 0, output: stdout + stderr };
  }

  private async runTypecheck(): Promise<TypecheckResult> {
    const { stdout, stderr } = await execFileNoThrow('pnpm', ['typecheck']);
    const output = stdout + stderr;
    const errors = (output.match(/error TS/g) || []).length;
    return { errors };
  }

  async detectRegressions(snapshot: QualitySnapshot): Promise<Regression[]> {
    const baseline = await this.data.quality.getBaseline();
    if (!baseline) return [];

    const regressions: Regression[] = [];

    if (baseline.buildSuccess && !snapshot.buildSuccess) {
      regressions.push({ metric: 'build', severity: 'error' });
    }

    if (snapshot.typeErrors > baseline.typeErrors) {
      regressions.push({
        metric: 'type_errors',
        baseline: baseline.typeErrors,
        current: snapshot.typeErrors,
        severity: 'error',
      });
    }

    // ... more checks

    return regressions;
  }
}
```

#### 5.2 Browser Agent Worker

**File**: `packages/harness/src/workers/BrowserWorker.ts`

```typescript
import { chromium, Browser, Page } from 'playwright';
import pixelmatch from 'pixelmatch';
import fs from 'fs';

class BrowserWorker {
  private browser: Browser | null = null;

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: this.config.headless ?? true,
    });
  }

  async executeTask(task: BrowserTask): Promise<ExecutionResult> {
    const page = await this.browser!.newPage();

    try {
      await page.goto(task.targetUrl);

      switch (task.testType) {
        case 'e2e':
          return this.runE2ETest(page, task);
        case 'visual':
          return this.runVisualRegression(page, task);
        case 'exploratory':
          return this.runExploratoryTest(page, task);
        case 'accessibility':
          return this.runAccessibilityTest(page, task);
        default:
          return { success: false, message: `Unknown test type: ${task.testType}` };
      }
    } finally {
      await page.close();
    }
  }

  private async runVisualRegression(page: Page, task: BrowserTask): Promise<ExecutionResult> {
    const screenshot = await page.screenshot();
    const baselinePath = `.jetpack/visual-baselines/${task.id}.png`;

    if (!fs.existsSync(baselinePath)) {
      fs.writeFileSync(baselinePath, screenshot);
      return { success: true, message: 'Baseline created' };
    }

    const baseline = fs.readFileSync(baselinePath);
    const { width, height } = await page.viewportSize() || { width: 1280, height: 720 };

    const numDiffPixels = pixelmatch(
      baseline,
      screenshot,
      null,
      width,
      height,
      { threshold: task.diffThreshold ?? 0.1 }
    );

    if (numDiffPixels > 0) {
      return {
        success: false,
        message: `Visual regression: ${numDiffPixels} pixels different`,
      };
    }

    return { success: true };
  }
}
```

#### 5.3 Browser Agent Configuration

**File**: `packages/harness/configs/browser.yaml`

```yaml
name: browser-test
type: browser
command: node
args:
  - ./workers/browser-worker.js
capabilities:
  skills:
    - e2e-testing
    - visual-regression
    - accessibility
    - exploratory-qa
  maxTaskMinutes: 30
  canAccessBrowser: true
settings:
  headless: true
  targetUrl: ${PREVIEW_URL:-http://localhost:3000}
  screenshotOnFailure: true
  videoRecording: false
  diffThreshold: 0.1
```

---

## Phase 6: Dashboard & Observability

**Goal**: Web UI for monitoring and controlling the swarm.

#### 6.1 Dashboard API Routes

**File**: `apps/web/src/app/api/v2/`

New API routes for v2 architecture:
- `/api/v2/status` - Swarm status
- `/api/v2/agents` - Agent list and details
- `/api/v2/tasks` - Task list and operations
- `/api/v2/events` - SSE for real-time updates
- `/api/v2/quality` - Quality metrics

#### 6.2 Dashboard UI Components

**File**: `apps/web/src/components/v2/`

```
components/v2/
├── SwarmStatus.tsx       # Overall health
├── AgentGrid.tsx         # Agent cards with status
├── TaskBoard.tsx         # Kanban or list view
├── QualityDashboard.tsx  # Quality metrics
├── EventLog.tsx          # Real-time events
└── CostTracker.tsx       # Usage/cost tracking
```

#### 6.3 Real-time Updates

**File**: `apps/web/src/hooks/useSwarmEvents.ts`

```typescript
function useSwarmEvents() {
  const [events, setEvents] = useState<SwarmEvent[]>([]);

  useEffect(() => {
    const eventSource = new EventSource('/api/v2/events');

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setEvents((prev) => [...prev.slice(-100), data]);
    };

    return () => eventSource.close();
  }, []);

  return events;
}
```

---

## Testing Strategy

### Unit Tests

Each package has unit tests:
- `packages/data/tests/` - Data layer tests with in-memory SQLite
- `packages/harness/tests/` - Harness tests with mocked CLI
- `packages/coordinator/tests/` - Coordinator tests with mocked data

### Integration Tests

- `tests/integration/` - End-to-end swarm tests
- Spin up SQLite, coordinator, and test agents
- Verify task lifecycle, quality gates, etc.

### Load Tests

- `tests/load/` - Test with many concurrent agents
- Verify atomic claims, no race conditions
- Test with simulated failures

---

## Rollout Plan

### Week 1: Foundation
- [ ] Phase 1 complete (data layer)
- [ ] Phase 2 complete (protocol, harness)

### Week 2: Core Functionality
- [ ] Phase 3 complete (coordinator)
- [ ] Phase 4 complete (CLI)

### Week 3: Quality & Testing
- [ ] Phase 5 complete (quality gates, browser)
- [ ] Integration tests passing

### Week 4: Polish & Release
- [ ] Phase 6 complete (dashboard)
- [ ] Documentation complete
- [ ] Beta release

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Crash recovery | 100% automatic |
| Task file corruption | 0 incidents |
| Agent scaling | 50+ agents tested |
| Quality gate accuracy | 99%+ |
| Dashboard latency | <500ms updates |

---

## Security Considerations

### Command Execution

All command execution MUST use safe patterns:

```typescript
// SAFE: Use spawn with args array or execFileNoThrow
import { execFileNoThrow } from '../utils/execFileNoThrow.js';
await execFileNoThrow('pnpm', ['build']);

// UNSAFE: Never use shell exec with interpolated strings
// exec(`pnpm ${userInput}`) // NEVER DO THIS
```

### Database Security

- Turso auth tokens stored in environment variables
- Database files have restricted permissions
- No SQL injection (use parameterized queries)

### Agent Authentication

In production deployments:
- Agents authenticate with HMAC signatures
- Rate limiting on all API endpoints
- Audit logging of all operations
