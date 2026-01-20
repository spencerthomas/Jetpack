# Jetpack Cloud

> Decentralized multi-agent swarm for large-scale software development

Jetpack Cloud is a **production-grade agent coordination system** designed for long-running, large-scale software development tasks. It leverages Turso's cloud database features for persistent state, offline-first operation, and horizontal scaling.

## Key Features

- **Decentralized Architecture**: Agents are independent processes that can run anywhere
- **Crash-Resilient State**: All coordination state persists to Turso database
- **Model Agnostic**: Works with Claude, GPT, Gemini, Codex, or custom models
- **Native Vector Search**: Semantic memory without external services
- **Database Branching**: Instant task versioning via Turso branches
- **Offline-First**: Embedded replicas enable local development with cloud sync

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Jetpack Cloud Architecture                │
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
│              │  SwarmCoordinator │                        │
│              │  (Work Distribution) │                     │
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
| `@jetpack-agent/dashboard` | Real-time observability and monitoring |
| `@jetpack-agent/swarm-cli` | Command-line interface for swarm operations |

## Usage

### 1. Create a Data Layer

```typescript
import { createTursoNativeDataLayer } from '@jetpack-agent/data';

// For production with Turso Cloud
const dataLayer = await createTursoNativeDataLayer(
  'libsql://your-db.turso.io',
  process.env.TURSO_AUTH_TOKEN!,
  {
    enableEmbeddedReplica: true,    // Offline-first
    localReplicaPath: '.turso/local.db',
    syncIntervalSeconds: 30,
    organization: 'your-org',
    workspaceId: 'your-project',
  }
);

// For local development
import { createLocalDataLayer } from '@jetpack-agent/data';
const dataLayer = await createLocalDataLayer('.swarm/data.db');
```

### 2. Create an Agent

```typescript
import { createClaudeCodeAgent } from '@jetpack-agent/agent-harness';

const agent = createClaudeCodeAgent(dataLayer, {
  id: 'agent-1',
  name: 'Developer Agent',
  skills: ['typescript', 'react', 'nodejs'],
  workDir: process.cwd(),
});

// Start the agent (it will claim and execute tasks autonomously)
await agent.start();
```

### 3. Create Tasks

```typescript
// Create a task
const task = await dataLayer.tasks.create({
  title: 'Implement user authentication',
  description: 'Add JWT-based authentication to the API',
  priority: 'high',
  requiredSkills: ['typescript', 'security'],
});

// Task will be automatically claimed by a matching agent
```

### 4. Monitor Quality

```typescript
import { QualityCollector } from '@jetpack-agent/quality';

const quality = new QualityCollector(dataLayer, {
  workDir: process.cwd(),
  runTests: true,
  runLint: true,
  runBuild: true,
});

// Set quality baseline
await quality.setBaseline({
  lintErrors: 0,
  typeErrors: 0,
  testsPassing: 100,
  testsFailing: 0,
  buildSuccess: true,
});

// Quality is automatically checked after each task completion
```

## Data Layer Options

### SQLite (Local Development)
```typescript
const db = await createDataLayer({
  type: 'sqlite',
  sqlite: { dbPath: '.swarm/data.db' }
});
```

### Turso (Cloud)
```typescript
const db = await createDataLayer({
  type: 'turso',
  turso: {
    url: 'libsql://my-db.turso.io',
    authToken: process.env.TURSO_AUTH_TOKEN!
  }
});
```

### Turso Native (Full Features)
```typescript
const db = await createDataLayer({
  type: 'turso-native',
  tursoNative: {
    url: 'libsql://my-db.turso.io',
    authToken: process.env.TURSO_AUTH_TOKEN!,
    enableEmbeddedReplica: true,
    localReplicaPath: '.turso/local.db',
    organization: 'my-org',
    workspaceId: 'my-workspace',
  }
});
```

## Turso Native Features

### Native Vector Search
```typescript
// Store memory with embedding
await db.memories.store({
  content: 'Learned that React hooks must be called at the top level',
  memoryType: 'learning',
  embedding: await generateEmbedding(content),  // 1536-dim vector
});

// Search by semantic similarity
const relevant = await db.memories.vectorSearch({
  embedding: await generateEmbedding('How do React hooks work?'),
  limit: 5,
  threshold: 0.7,
});
```

### Database Branching
```typescript
// Create a branch for a feature
const branch = await db.branches.create({
  name: 'feature/auth',
  description: 'Authentication feature development',
});

// Work on the branch (isolated from main)
// Merge when complete
await db.branches.merge(branch.id);
```

### Offline Sync
```typescript
// Embedded replica syncs automatically
// Force manual sync when needed
await db.sync.syncNow();

// Check sync status
const status = await db.sync.getStatus();
console.log(status.pendingChanges);
```

## CLI Commands

```bash
# Start the swarm coordinator
swarm start

# Create a task
swarm task create --title "Fix login bug" --priority high

# Check swarm status
swarm status

# List agents
swarm agents list
```

## Environment Variables

```bash
# Required for Turso
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token

# Optional for Turso Platform API (branching, multi-tenancy)
TURSO_PLATFORM_API_TOKEN=your-platform-token
TURSO_ORGANIZATION=your-org
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Watch mode
pnpm dev
```

## Documentation

- [Architecture Overview](docs/architecture/SWARM_ARCHITECTURE_V2.md)
- [Agent Protocol](docs/architecture/AGENT_PROTOCOL.md)
- [Implementation Plan](docs/architecture/IMPLEMENTATION_PLAN.md)

## License

MIT
