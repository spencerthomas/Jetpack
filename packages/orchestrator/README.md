# @jetpack-agent/orchestrator

Multi-agent orchestration engine for Jetpack swarm development. Coordinates multiple AI agents working in parallel on software development tasks.

## Installation

```bash
npm install @jetpack-agent/orchestrator
# or
pnpm add @jetpack-agent/orchestrator
```

## Quick Start

```typescript
import { JetpackOrchestrator } from '@jetpack-agent/orchestrator';

const orchestrator = new JetpackOrchestrator({
  workDir: '/path/to/your/project',
  numAgents: 3,
  autoStart: true,
});

await orchestrator.initialize();
await orchestrator.startAgents(3);

// Create a task
const task = await orchestrator.createTask({
  title: 'Implement user authentication',
  description: 'Add login/logout functionality',
  priority: 'high',
  requiredSkills: ['typescript', 'backend'],
  estimatedMinutes: 60,
});

// Get system status
const status = await orchestrator.getStatus();
console.log(`Agents: ${status.agents.length}, Tasks pending: ${status.tasks.pending}`);

// Graceful shutdown
await orchestrator.shutdown();
```

## API Reference

### JetpackOrchestrator

The main orchestrator class that manages agents, tasks, and system lifecycle.

#### Constructor Options

```typescript
interface JetpackConfig {
  workDir: string;                    // Project working directory
  numAgents?: number;                 // Number of agents to spawn (default: 3)
  autoStart?: boolean;                // Auto-start agents (default: true)
  enableTuiMode?: boolean;            // Enable TUI dashboard mode
  enableQualityMetrics?: boolean;     // Track build/test/lint metrics

  // Runtime limits for autonomous operation
  runtimeLimits?: {
    maxCycles?: number;               // Max work cycles before shutdown
    maxRuntimeMs?: number;            // Max runtime in milliseconds
    idleTimeoutMs?: number;           // Shutdown after idle period
    maxConsecutiveFailures?: number;  // Stop after N consecutive failures
  };

  // Agent timeout configuration
  agentSettings?: {
    timeoutMultiplier?: number;       // Multiplier for task estimates (default: 2.0)
    minTimeoutMs?: number;            // Minimum timeout (default: 5 min)
    maxTimeoutMs?: number;            // Maximum timeout (default: 2 hours)
    gracefulShutdownMs?: number;      // SIGTERM grace period (default: 30s)
    workPollingIntervalMs?: number;   // Work polling interval (default: 30s)
  };

  // Callbacks
  onEndState?: (state: EndState, stats: RuntimeStats) => void;
  onRuntimeEvent?: (event: RuntimeEvent) => void;
  onAgentOutput?: (event: ExecutionOutputEvent) => void;
  onQualityRegression?: (summary: RegressionSummary) => void;
}
```

#### Core Methods

```typescript
// Lifecycle
await orchestrator.initialize();
await orchestrator.startAgents(count: number);
await orchestrator.stopAgents();
await orchestrator.shutdown();

// Task Management
await orchestrator.createTask({ title, description, priority, requiredSkills, ... });
await orchestrator.getStatus();

// Accessors
orchestrator.getAgents(): AgentController[];
orchestrator.getBeadsAdapter(): BeadsAdapter;
orchestrator.getCASSAdapter(): CASSAdapter;
orchestrator.getRuntimeManager(): RuntimeManager | undefined;
orchestrator.getRuntimeStats(): RuntimeStats | null;
```

### AgentController

Controls individual agent lifecycle and task execution.

```typescript
const controller = orchestrator.getAgents()[0];

controller.getAgent();        // Get agent state
controller.getCurrentTask();  // Get current task
controller.getStats();        // Get agent statistics
await controller.gracefulStop();  // Stop with state saving
```

### RuntimeManager

Manages runtime limits and graceful shutdown for autonomous operation.

```typescript
const rm = orchestrator.getRuntimeManager();

rm.recordCycle();                      // Record a work cycle
rm.recordTaskComplete(taskId);         // Record task completion
rm.recordTaskFailed(taskId, error);    // Record task failure
rm.signalAllTasksComplete();           // Signal queue empty
rm.signalObjectiveComplete();          // Signal objective done

rm.getStats(): RuntimeStats;
rm.getLimits(): RuntimeLimits;
rm.isRunning(): boolean;
rm.getEndState(): EndState | null;
```

### ClaudeCodeExecutor

Executes tasks via Claude Code CLI with timeout protection.

```typescript
import { ClaudeCodeExecutor } from '@jetpack-agent/orchestrator';

const executor = new ClaudeCodeExecutor('/path/to/project', {
  timeoutMs: 30 * 60 * 1000,          // 30 minute default
  gracefulShutdownMs: 30000,          // 30 second grace
  emitOutputEvents: true,             // For TUI mode
  timeoutMultiplier: 2.0,             // 2x task estimate
  minTimeoutMs: 5 * 60 * 1000,        // 5 min minimum
  maxTimeoutMs: 2 * 60 * 60 * 1000,   // 2 hour maximum
});

const result = await executor.execute({
  task,
  memories,
  workDir: '/path/to/project',
  agentId: 'agent-1',
  agentName: 'Agent 1',
  agentSkills: ['typescript', 'backend'],
});

// Control execution
executor.abort();       // 3-stage graceful termination
executor.forceKill();   // Immediate SIGKILL
executor.isExecuting(); // Check if running
executor.destroy();     // Cleanup resources
```

## Events

The orchestrator emits several events:

```typescript
orchestrator.on('agentOutput', (event: ExecutionOutputEvent) => {
  console.log(`[${event.agentName}] ${event.chunk}`);
});

orchestrator.on('memoryUsage', (stats) => {
  console.log(`Heap: ${stats.heapPercent}%`);
});

orchestrator.on('memoryCleanup', ({ level }) => {
  console.log(`Memory cleanup triggered: ${level}`);
});

orchestrator.on('qualityRegression', ({ taskId, summary }) => {
  console.log(`Quality regression in ${taskId}: ${summary.total} issues`);
});
```

## Supervisor Integration

For high-level task orchestration with LLM-based supervision:

```typescript
import { JetpackOrchestrator, SupervisorAgent } from '@jetpack-agent/orchestrator';

const orchestrator = new JetpackOrchestrator({ workDir: '/project' });
await orchestrator.initialize();
await orchestrator.startAgents(3);

// Create supervisor with LLM configuration
const supervisor = await orchestrator.createSupervisor({
  provider: 'anthropic',
  model: 'claude-3-opus-20240229',
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Execute high-level request
const result = await orchestrator.supervise(
  'Add user authentication with OAuth support'
);

console.log(`Completed: ${result.success}`);
console.log(`Tasks created: ${result.tasksCreated}`);
```

## Configuration

Environment variables:

- `JETPACK_WORK_DIR` - Default working directory
- `JETPACK_MODE` - Execution mode: `local`, `hybrid`, or `edge`
- `CLOUDFLARE_API_URL` - Cloudflare Worker URL (for hybrid/edge mode)
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token

## Related Packages

- `@jetpack-agent/shared` - Shared types and utilities
- `@jetpack-agent/beads-adapter` - Git-backed task management
- `@jetpack-agent/cass-adapter` - SQLite-based agent memory
- `@jetpack-agent/mcp-mail-adapter` - Inter-agent messaging
- `@jetpack-agent/supervisor` - LLM-based task supervision
- `@jetpack-agent/quality-adapter` - Quality metrics tracking

## License

MIT
