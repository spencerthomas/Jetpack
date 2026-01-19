# jetpack-agent

Multi-Agent Swarm Development Stack - the complete Jetpack package including orchestrator, adapters, and tools.

## Installation

```bash
npm install jetpack-agent
```

This meta-package includes all Jetpack components:

- **@jetpack-agent/orchestrator** - Core agent orchestration
- **@jetpack-agent/supervisor** - LangGraph-based intelligent supervision
- **@jetpack-agent/beads-adapter** - Task queue management
- **@jetpack-agent/cass-adapter** - Contextual memory storage
- **@jetpack-agent/mcp-mail-adapter** - Agent messaging
- **@jetpack-agent/quality-adapter** - Quality metrics and regression detection
- **@jetpack-agent/mcp-server** - MCP server for external integrations
- **@jetpack-agent/cli-tui** - Terminal dashboard
- **@jetpack-agent/browser-validator** - UI validation
- **@jetpack-agent/shared** - Shared types and utilities

## Quick Start

```typescript
import {
  JetpackOrchestrator,
  BeadsAdapter,
  CASSAdapter,
  MCPMailAdapter,
  SupervisorAgent,
} from 'jetpack-agent';

// Initialize the orchestrator
const orchestrator = new JetpackOrchestrator({
  workDir: process.cwd(),
  agentCount: 3,
});

await orchestrator.initialize();
await orchestrator.start();

// Or access individual components via namespaces
import { Orchestrator, Beads, CASS, MCPMail, Quality, Supervisor } from 'jetpack-agent';

const beads = new Beads.BeadsAdapter({ workDir: process.cwd() });
const cass = new CASS.CASSAdapter({ workDir: process.cwd() });
```

## Usage Patterns

### Full Orchestration

```typescript
import { JetpackOrchestrator, SupervisorAgent } from 'jetpack-agent';

const orchestrator = new JetpackOrchestrator({
  workDir: process.cwd(),
  agentCount: 5,
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
});

await orchestrator.initialize();

// Add a high-level task via supervisor
const result = await orchestrator.executeRequest(
  'Build a REST API with user authentication'
);

console.log(result.completedTasks);
```

### Individual Components

```typescript
import { Beads, CASS, Quality } from 'jetpack-agent';

// Task queue management
const beads = new Beads.BeadsAdapter({ workDir: '.' });
await beads.initialize();
await beads.createTask({
  title: 'Implement login',
  description: 'Add login endpoint',
  priority: 'high',
  requiredSkills: ['backend', 'auth'],
});

// Memory storage
const cass = new CASS.CASSAdapter({ workDir: '.' });
await cass.initialize();
await cass.store({
  type: 'agent_learning',
  content: 'JWT tokens should include expiry claims',
  importance: 0.8,
});

// Quality tracking
const quality = new Quality.QualityMetricsAdapter({ workDir: '.' });
await quality.initialize();
await quality.saveSnapshot({
  id: quality.generateSnapshotId(),
  timestamp: new Date(),
  isBaseline: true,
  metrics: {
    lintErrors: 0,
    typeErrors: 0,
    testsPassing: 100,
    testsFailing: 0,
    testCoverage: 85,
    lintWarnings: 3,
    buildSuccess: true,
  },
  tags: [],
});
```

### Supervisor Mode

```typescript
import { SupervisorAgent, Beads, CASS, MCPMail, Shared } from 'jetpack-agent';

const beads = new Beads.BeadsAdapter({ workDir: '.' });
const cass = new CASS.CASSAdapter({ workDir: '.' });

await beads.initialize();
await cass.initialize();

const supervisor = new SupervisorAgent({
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  beads,
  cass,
  getAgents: () => agents,
  getAgentMail: (id) => mailAdapters.get(id),
});

await supervisor.initialize();
supervisor.startBackgroundMonitoring();

const result = await supervisor.execute('Add dark mode to the dashboard');
```

## Namespaces

All packages are available both as direct exports and namespaced exports:

```typescript
// Direct exports (main classes)
import {
  JetpackOrchestrator,
  BeadsAdapter,
  CASSAdapter,
  MCPMailAdapter,
  SupervisorAgent,
} from 'jetpack-agent';

// Namespaced exports (full package access)
import {
  Orchestrator,  // @jetpack-agent/orchestrator
  Shared,        // @jetpack-agent/shared
  Beads,         // @jetpack-agent/beads-adapter
  CASS,          // @jetpack-agent/cass-adapter
  MCPMail,       // @jetpack-agent/mcp-mail-adapter
  Quality,       // @jetpack-agent/quality-adapter
  Supervisor,    // @jetpack-agent/supervisor
} from 'jetpack-agent';
```

## Package Overview

| Package | Description |
|---------|-------------|
| `orchestrator` | Core orchestration engine, agent lifecycle, task distribution |
| `supervisor` | LangGraph-based AI supervisor for intelligent planning |
| `beads-adapter` | SQLite-based task queue with priorities and dependencies |
| `cass-adapter` | Contextual memory with semantic search |
| `mcp-mail-adapter` | Pub/sub messaging between agents |
| `quality-adapter` | Quality metrics, baselines, regression detection |
| `mcp-server` | MCP protocol server for external tool integration |
| `cli-tui` | Terminal dashboard for monitoring |
| `browser-validator` | Playwright-based UI validation |
| `shared` | Common types, schemas, and utilities |

## Requirements

- Node.js >= 20.0.0
- TypeScript >= 5.0 (for development)

## License

MIT
