# CLAUDE.md

This file provides guidance to Claude Code when working with the Jetpack Cloud codebase.

## Project Overview

Jetpack Cloud is a **decentralized multi-agent swarm** for large-scale software development. It coordinates AI agents using a durable data layer with Turso's cloud database features for persistent state, offline-first operation, and horizontal scaling.

## Quick Reference

### Build & Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run single package tests
pnpm --filter @jetpack-agent/data test
pnpm --filter @jetpack-agent/coordinator test

# Development with watch
pnpm dev
```

### CLI Commands

```bash
# Initialize swarm database
swarm init [path]

# Start coordinator with agents
swarm start                    # Start with 3 agents (default)
swarm start -a 5               # Start with 5 agents
swarm start --mock             # Use mock adapters (no Claude needed)
swarm start -d /path/to/project

# Create tasks
swarm task -t "Task title"
swarm task -t "Title" -p high -s "typescript,react"

# View status
swarm status
swarm agents
swarm tasks
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Jetpack Cloud Architecture               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│   │   Agent 1   │    │   Agent 2   │    │   Agent N   │   │
│   │ (Claude)    │    │ (GPT)       │    │ (Custom)    │   │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘   │
│          │                  │                  │           │
│          └────────────┬─────┴─────────────────┘           │
│                       │                                    │
│              ┌────────▼────────┐                          │
│              │ SwarmCoordinator │                          │
│              │ (Work Distribution)│                        │
│              └────────┬────────┘                          │
│                       │                                    │
│              ┌────────▼────────┐                          │
│              │    DataLayer     │                          │
│              │  (Turso Native)  │                          │
│              └────────┬────────┘                          │
│                       │                                    │
│   ┌───────────────────┴───────────────────┐               │
│   │                 Turso                  │               │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ │               │
│   │  │ Tasks   │ │ Agents  │ │Messages │ │               │
│   │  │ Leases  │ │ Quality │ │Memories │ │               │
│   │  └─────────┘ └─────────┘ └─────────┘ │               │
│   └───────────────────────────────────────┘               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| `@jetpack-agent/data` | Durable data layer with SQLite, Turso, and TursoNative support |
| `@jetpack-agent/agent-harness` | Model-agnostic agent wrapper for participating in the swarm |
| `@jetpack-agent/coordinator` | Work distribution and agent lifecycle management |
| `@jetpack-agent/quality` | Quality metrics collection and regression detection |
| `@jetpack-agent/dashboard` | Dashboard data provider and observability |
| `@jetpack-agent/swarm-cli` | Command-line interface for swarm operations |

### Package Dependencies

```
swarm-cli
├── coordinator
│   ├── agent-harness
│   │   └── data
│   └── data
├── data
quality
└── data
dashboard
└── data
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/data/src/DataLayer.ts` | DataLayer interface definition |
| `packages/data/src/SQLiteDataLayer.ts` | Local SQLite implementation |
| `packages/data/src/TursoDataLayer.ts` | Cloud Turso implementation |
| `packages/data/src/turso-native/TursoNativeDataLayer.ts` | Full-featured Turso with vectors, branching, sync |
| `packages/data/src/types.ts` | Core TypeScript types (Task, Agent, Message, etc.) |
| `packages/data/src/schema.ts` | Embedded SQL schema |
| `packages/agent-harness/src/AgentHarness.ts` | Model-agnostic agent wrapper |
| `packages/agent-harness/src/adapters/ClaudeCodeAdapter.ts` | Claude Code CLI adapter |
| `packages/coordinator/src/SwarmCoordinator.ts` | Main coordinator class |
| `packages/quality/src/QualityCollector.ts` | Quality metrics and regression detection |
| `packages/swarm-cli/src/index.ts` | CLI entry point |

## Data Layer Options

### SQLite (Local Development)
```typescript
import { createLocalDataLayer } from '@jetpack-agent/data';

const db = await createLocalDataLayer('.swarm/data.db');
```

### Turso (Cloud)
```typescript
import { createCloudDataLayer } from '@jetpack-agent/data';

const db = await createCloudDataLayer(
  'libsql://my-db.turso.io',
  process.env.TURSO_AUTH_TOKEN!
);
```

### Turso Native (Full Features)
```typescript
import { createTursoNativeDataLayer } from '@jetpack-agent/data';

const db = await createTursoNativeDataLayer(
  'libsql://my-db.turso.io',
  process.env.TURSO_AUTH_TOKEN!,
  {
    enableEmbeddedReplica: true,    // Offline-first
    localReplicaPath: '.turso/local.db',
    syncIntervalSeconds: 30,
    organization: 'your-org',
    workspaceId: 'your-project',
  }
);
```

## Key Types

```typescript
// Task lifecycle: pending → ready → claimed → in_progress → completed/failed
interface Task {
  id: string;              // Format: task-XXXX
  title: string;
  description?: string;
  status: 'pending' | 'ready' | 'claimed' | 'in_progress' | 'blocked' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  type: 'development' | 'review' | 'testing' | 'documentation' | 'bug' | 'feature' | 'refactor' | 'other';
  requiredSkills: string[];
  dependencies: string[];
  assignedAgent?: string;
  retryCount: number;
  maxRetries: number;
}

// Agent states: idle → busy → idle (or error/offline)
interface Agent {
  id: string;
  name: string;
  type: 'claude-code' | 'openai' | 'custom';
  status: 'idle' | 'busy' | 'error' | 'offline';
  skills: string[];
  currentTaskId?: string;
  tasksCompleted: number;
  tasksFailed: number;
}

// Inter-agent messaging
interface Message {
  id: string;
  type: string;  // task.created, task.claimed, agent.heartbeat, etc.
  fromAgent: string;
  toAgent?: string;  // null = broadcast
  payload: Record<string, unknown>;
  ackRequired: boolean;
  acknowledgedAt?: Date;
}
```

## Common Operations

### Creating a Task
```typescript
const task = await dataLayer.tasks.create({
  title: 'Implement user authentication',
  description: 'Add JWT-based auth to the API',
  priority: 'high',
  requiredSkills: ['typescript', 'security'],
});
```

### Creating an Agent
```typescript
import { createClaudeCodeAgent } from '@jetpack-agent/agent-harness';

const agent = createClaudeCodeAgent(dataLayer, {
  id: 'agent-1',
  name: 'Developer Agent',
  skills: ['typescript', 'react', 'nodejs'],
  workDir: process.cwd(),
});

await agent.start();
```

### Using the Coordinator
```typescript
import { SwarmCoordinator } from '@jetpack-agent/coordinator';

const coordinator = new SwarmCoordinator(dataLayer, {
  workDir: '/path/to/project',
  maxAgents: 10,
  claimStrategy: 'best-fit',  // first-fit, best-fit, round-robin, load-balanced
  onEvent: (event) => console.log(event),
});

await coordinator.start();

// Spawn agents
await coordinator.spawnAgent({
  name: 'Agent-1',
  type: 'claude-code',
  adapter: createClaudeCodeAdapter(),
  skills: ['typescript', 'backend'],
  workDir: '/path/to/project',
});

// Get stats
const stats = await coordinator.getStats();
```

### Turso Native Features

**Vector Search (Semantic Memory):**
```typescript
// Store memory with embedding
await db.memories.store({
  content: 'React hooks must be called at the top level',
  memoryType: 'learning',
  embedding: await generateEmbedding(content),
});

// Search by semantic similarity
const results = await db.memories.vectorSearch({
  embedding: queryEmbedding,
  limit: 5,
  threshold: 0.7,
});
```

**Database Branching:**
```typescript
// Create a branch for feature development
const branch = await db.branches.create({
  name: 'feature/auth',
  description: 'Authentication feature development',
});

// Work on the branch (isolated from main)
// Merge when complete
await db.branches.merge(branch.id);
```

**Offline Sync:**
```typescript
// Embedded replica syncs automatically
// Force manual sync when needed
await db.sync.syncNow();

// Check sync status
const status = await db.sync.getStatus();
console.log(status.pendingChanges);
```

## Environment Variables

```bash
# Required for Turso cloud
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token

# Optional for Turso Platform API (branching, workspaces)
TURSO_PLATFORM_API_TOKEN=your-platform-token
TURSO_ORGANIZATION=your-org
```

## File Storage

All data is stored in `.jetpack/`:
- `.jetpack/swarm.db` - SQLite database (when using local data layer)
- `.turso/local.db` - Embedded replica (when using TursoNative)

## Testing

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter @jetpack-agent/data test
pnpm --filter @jetpack-agent/coordinator test

# Run with watch mode
pnpm --filter @jetpack-agent/data test:watch
```

## Troubleshooting

### Build Issues
```bash
# Clean rebuild
pnpm clean && pnpm install && pnpm build

# Build specific package
pnpm --filter @jetpack-agent/data build
```

### Database Issues
```bash
# Re-initialize database
rm -rf .jetpack/swarm.db
swarm init
```

### Agents Not Claiming Tasks
1. Check agent skills match task `requiredSkills`
2. Verify task status is `ready` (not `pending` or `blocked`)
3. Check for dependency chains - tasks with unmet dependencies stay `blocked`

## Documentation

- [Architecture Overview](docs/architecture/SWARM_ARCHITECTURE_V2.md)
- [Historical Docs](docs/historical/) - Previous architecture documentation
