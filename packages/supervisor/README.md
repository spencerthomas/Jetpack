# @jetpack-agent/supervisor

LangGraph-based Supervisor Agent for intelligent multi-agent orchestration. Breaks down high-level requests into tasks, assigns them to agents, monitors progress, and handles conflicts.

## Installation

```bash
npm install @jetpack-agent/supervisor
```

## Quick Start

```typescript
import { SupervisorAgent } from '@jetpack-agent/supervisor';
import { BeadsAdapter } from '@jetpack-agent/beads-adapter';
import { CASSAdapter } from '@jetpack-agent/cass-adapter';

const supervisor = new SupervisorAgent({
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  beads: beadsAdapter,
  cass: cassAdapter,
  getAgents: () => orchestrator.getAgents(),
  getAgentMail: (agentId) => orchestrator.getAgentMail(agentId),
});

await supervisor.initialize();

// Execute a high-level request
const result = await supervisor.execute(
  'Add user authentication with login, signup, and password reset'
);

console.log(result.completedTasks); // ['task-1', 'task-2', ...]
console.log(result.finalReport);    // Human-readable summary
```

## Features

- LangGraph-powered orchestration with planning, assignment, and monitoring
- Multi-LLM support (Anthropic Claude, OpenAI)
- Automatic task breakdown with dependency detection
- Conflict resolution and task reassignment
- Background monitoring for proactive supervision
- Continuous mode for objective-driven task generation
- Integration with Beads (task queue) and CASS (memory)

## API

### `SupervisorAgent`

Main supervisor class for orchestrating agents.

```typescript
const supervisor = new SupervisorAgent(config);
```

#### Configuration

```typescript
interface SupervisorAgentConfig {
  /** LLM provider configuration */
  llm: {
    provider: 'anthropic' | 'openai';
    model: string;
    apiKey: string;
    temperature?: number;
    maxTokens?: number;
  };

  /** Beads adapter for task management */
  beads: BeadsAdapter;

  /** CASS adapter for memory storage */
  cass: CASSAdapter;

  /** Function to get current agents */
  getAgents: () => Agent[];

  /** Function to get agent's mail adapter */
  getAgentMail: (agentId: string) => MCPMailAdapter | undefined;

  /** Interval between monitoring checks (default: 15000ms) */
  pollIntervalMs?: number;

  /** Maximum iterations before stopping (default: 100) */
  maxIterations?: number;

  /** Background monitoring interval (default: 30000ms) */
  backgroundMonitorIntervalMs?: number;
}
```

#### Methods

| Method | Description |
|--------|-------------|
| `initialize()` | Initialize the supervisor graph |
| `execute(request)` | Execute a high-level request |
| `isRunning()` | Check if supervisor is executing |
| `getLLMInfo()` | Get LLM provider info |
| `startBackgroundMonitoring()` | Start proactive monitoring |
| `stopBackgroundMonitoring()` | Stop background monitoring |
| `isBackgroundMonitoringActive()` | Check monitoring status |
| `getBackgroundStats()` | Get monitoring statistics |

### Execution Result

```typescript
interface SupervisorResult {
  success: boolean;
  completedTasks: string[];
  failedTasks: string[];
  conflicts: number;
  iterations: number;
  finalReport: string;
  error?: string;
}
```

### LLM Providers

```typescript
import { ClaudeProvider, OpenAIProvider, createLLMProvider } from '@jetpack-agent/supervisor';

// Auto-create based on config
const llm = createLLMProvider({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Or create directly
const claude = new ClaudeProvider({
  model: 'claude-sonnet-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

### Graph Functions

For advanced usage, access the underlying LangGraph components:

```typescript
import {
  createSupervisorGraph,
  createContinuousGraph,
  SupervisorStateAnnotation,
} from '@jetpack-agent/supervisor';

// Standard graph for request execution
const graph = await createSupervisorGraph({
  llm,
  beads,
  getAgentMail,
});

// Continuous graph for objective-driven mode
const continuousGraph = await createContinuousGraph({
  llm,
  beads,
  getAgentMail,
});
```

## Graph Architecture

The supervisor uses a LangGraph state machine with these nodes:

1. **Planner** - Breaks down user request into tasks with dependencies
2. **Assigner** - Matches tasks to available agents based on skills
3. **Monitor** - Tracks progress and detects issues
4. **Coordinator** - Handles conflicts and reassignments

### Continuous Mode

For long-running objectives:

```typescript
// State includes objective tracking
interface Objective {
  id: string;
  title: string;
  userRequest: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  milestones: Milestone[];
  currentMilestoneIndex: number;
  progressPercent: number;
}

// Queue management
interface QueueThresholds {
  lowWatermark: number;   // Trigger generation when below (default: 2)
  highWatermark: number;  // Target queue size (default: 8)
  maxWatermark: number;   // Never exceed this (default: 15)
  cooldownMs: number;     // Min time between generations (default: 30000)
}
```

## Background Monitoring

The supervisor can run background monitoring to:

- Check for unassigned tasks and notify agents
- Auto-retry failed tasks up to maxRetries
- Detect stalled agents and redistribute work
- Unblock tasks when dependencies complete

```typescript
supervisor.startBackgroundMonitoring();

// Get statistics
const stats = supervisor.getBackgroundStats();
console.log(stats.monitoringCycles);
console.log(stats.reassignedTasks);
console.log(stats.detectedStalledAgents);

supervisor.stopBackgroundMonitoring();
```

## Customizing Prompts

All prompts are exported for customization:

```typescript
import {
  PLANNER_PROMPT,
  ASSIGNER_PROMPT,
  COORDINATOR_PROMPT,
  PROGRESS_ANALYZER_PROMPT,
  CONTINUOUS_PLANNER_PROMPT,
  OBJECTIVE_PARSER_PROMPT,
} from '@jetpack-agent/supervisor';
```

## Dependencies

- **@langchain/core** - LangChain core utilities
- **@langchain/langgraph** - LangGraph state machine
- **@langchain/anthropic** - Anthropic Claude integration
- **@langchain/openai** - OpenAI integration
- **@jetpack-agent/shared** - Shared types
- **@jetpack-agent/beads-adapter** - Task queue
- **@jetpack-agent/mcp-mail-adapter** - Agent messaging
- **@jetpack-agent/cass-adapter** - Memory storage
- **zod** - Schema validation

## License

MIT
