# Hybrid Cloudflare Architecture for Jetpack

## Overview

This document describes the hybrid architecture that enables Jetpack to run with:
- **State management on Cloudflare edge** (tasks, memories, messaging)
- **Execution locally** (Claude CLI spawning, process management)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         LOCAL (Jetpack CLI)                          │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────────────────────┐   │
│  │  AgentController    │  │  ClaudeCodeExecutor                 │   │
│  │  - Process mgmt     │  │  - Spawns claude CLI                │   │
│  │  - Task execution   │  │  - Collects output                  │   │
│  │  - Skill matching   │  │  - Handles timeouts                 │   │
│  └─────────┬───────────┘  └─────────────────────────────────────┘   │
│            │                                                         │
│  ┌─────────▼───────────────────────────────────────────────────┐    │
│  │              Adapter Interfaces (Abstract)                   │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │    │
│  │  │ ITaskStore   │ │ IMailBus     │ │ IMemoryStore         │ │    │
│  │  │ (BeadsAPI)   │ │ (MailAPI)    │ │ (CASSAPI)            │ │    │
│  │  └──────┬───────┘ └──────┬───────┘ └──────────┬───────────┘ │    │
│  └─────────┼────────────────┼────────────────────┼─────────────┘    │
└────────────┼────────────────┼────────────────────┼──────────────────┘
             │                │                    │
             │ HTTPS/WS       │ HTTPS/WS           │ HTTPS/WS
             │                │                    │
┌────────────┼────────────────┼────────────────────┼──────────────────┐
│            ▼                ▼                    ▼                   │
│                      CLOUDFLARE EDGE                                 │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────────────────────┐   │
│  │       D1            │  │      Durable Objects                │   │
│  │  - tasks table      │  │  - MailboxDO (pub/sub)              │   │
│  │  - memories table   │  │  - LeaseDO (file locking)           │   │
│  │                     │  │  - SessionDO (agent state)          │   │
│  └─────────────────────┘  └─────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────┐  ┌─────────────────────────────────────┐   │
│  │     Vectorize       │  │      Workers                        │   │
│  │  - embeddings       │  │  - API Gateway                      │   │
│  │  - semantic search  │  │  - Auth middleware                  │   │
│  └─────────────────────┘  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Interface Abstractions

### 1. ITaskStore (BeadsAdapter replacement)

```typescript
interface ITaskStore {
  // Core CRUD
  createTask(task: Omit<Task, 'id' | 'createdAt'>): Promise<Task>;
  getTask(id: string): Promise<Task | null>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task | null>;
  deleteTask(id: string): Promise<boolean>;

  // Queries
  getReadyTasks(): Promise<Task[]>;
  getTasksByStatus(status: TaskStatus): Promise<Task[]>;
  getTasksByAgent(agentId: string): Promise<Task[]>;

  // Atomic operations
  claimTask(taskId: string, agentId: string): Promise<Task | null>;
  releaseTask(taskId: string): Promise<boolean>;

  // Sync
  sync(): Promise<void>;
  getStats(): Promise<TaskStats>;
}
```

### 2. IMailBus (MCPMailAdapter replacement)

```typescript
interface IMailBus {
  // Pub/Sub
  publish(message: Message): Promise<void>;
  subscribe(type: MessageType, handler: MessageHandler): void;
  unsubscribe(type: MessageType, handler: MessageHandler): void;

  // Direct messaging
  sendTo(agentId: string, message: Message): Promise<void>;

  // File locking
  acquireLease(file: string, ttlMs: number): Promise<boolean>;
  releaseLease(file: string): Promise<void>;
  isLeased(file: string): Promise<LeaseStatus>;

  // Heartbeat
  sendHeartbeat(): Promise<void>;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
```

### 3. IMemoryStore (CASSAdapter replacement)

```typescript
interface IMemoryStore {
  // Storage
  store(entry: MemoryInput): Promise<string>;
  retrieve(id: string): Promise<MemoryEntry | null>;
  delete(id: string): Promise<boolean>;

  // Search
  search(query: string, limit?: number): Promise<MemoryEntry[]>;
  semanticSearch(embedding: number[], limit?: number): Promise<MemoryEntry[]>;
  semanticSearchByQuery(query: string, limit?: number): Promise<MemoryEntry[]>;

  // Maintenance
  compact(threshold: number): Promise<number>;
  adaptiveCompact(): Promise<number>;
  updateImportance(id: string, importance: number): Promise<void>;

  // Stats
  getStats(): Promise<MemoryStats>;
  getByType(type: MemoryType, limit?: number): Promise<MemoryEntry[]>;
}
```

## Cloudflare Implementation Details

### D1 Schema

```sql
-- tasks table
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  dependencies TEXT, -- JSON array
  blockers TEXT,     -- JSON array
  required_skills TEXT, -- JSON array
  estimated_minutes INTEGER,
  actual_minutes INTEGER,
  tags TEXT,         -- JSON array
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 2,
  branch TEXT,
  origin_branch TEXT,
  target_branches TEXT, -- JSON array
  assigned_agent TEXT,
  last_error TEXT,
  failure_type TEXT,
  last_attempt_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_agent ON tasks(assigned_agent);
CREATE INDEX idx_tasks_priority ON tasks(priority);

-- memories table
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  importance REAL NOT NULL DEFAULT 0.5,
  metadata TEXT, -- JSON
  has_embedding INTEGER DEFAULT 0, -- 1 if embedding stored in Vectorize
  created_at INTEGER NOT NULL,
  last_accessed INTEGER NOT NULL,
  access_count INTEGER DEFAULT 0
);

CREATE INDEX idx_memories_type ON memories(type);
CREATE INDEX idx_memories_importance ON memories(importance);
CREATE INDEX idx_memories_created_at ON memories(created_at);
CREATE INDEX idx_memories_last_accessed ON memories(last_accessed);
```

### Vectorize Index

```typescript
// Vectorize configuration
const vectorizeConfig = {
  name: 'jetpack-memories',
  dimensions: 1536, // OpenAI ada-002
  metric: 'cosine',
};

// Insert with embedding
await env.VECTORIZE.insert([{
  id: memoryId,
  values: embedding,
  metadata: { type, importance, createdAt }
}]);

// Query
const results = await env.VECTORIZE.query(queryEmbedding, {
  topK: 10,
  filter: { type: { $eq: 'agent_learning' } }
});
```

### Durable Objects

```typescript
// MailboxDO - Pub/Sub messaging
export class MailboxDO {
  private subscribers: Map<string, Set<WebSocket>> = new Map();

  async publish(message: Message): Promise<void> {
    const subs = this.subscribers.get(message.type) || new Set();
    for (const ws of subs) {
      ws.send(JSON.stringify(message));
    }
  }

  async subscribe(type: string, ws: WebSocket): Promise<void> {
    if (!this.subscribers.has(type)) {
      this.subscribers.set(type, new Set());
    }
    this.subscribers.get(type)!.add(ws);
  }
}

// LeaseDO - File locking
export class LeaseDO {
  private leases: Map<string, { agentId: string; expiresAt: number }> = new Map();

  async acquire(file: string, agentId: string, ttlMs: number): Promise<boolean> {
    const existing = this.leases.get(file);
    if (existing && existing.expiresAt > Date.now()) {
      return false; // Already leased
    }
    this.leases.set(file, { agentId, expiresAt: Date.now() + ttlMs });
    return true;
  }
}
```

## Implementation Status

### Packages Created

| Package | Class | Backend | Status |
|---------|-------|---------|--------|
| `@jetpack-agent/shared` | `ITaskStore`, `IMailBus`, `IMemoryStore` | Interfaces | ✅ Complete |
| `@jetpack-agent/beads-adapter` | `BeadsAdapter` | Local SQLite | ✅ Implements ITaskStore |
| `@jetpack-agent/mcp-mail-adapter` | `MCPMailAdapter` | Local file-based | ✅ Implements IMailBus |
| `@jetpack-agent/cass-adapter` | `CASSAdapter` | Local SQLite | ✅ Implements IMemoryStore |
| `@jetpack-agent/cf-beads-adapter` | `CloudflareTaskStore` | Cloudflare D1 | ✅ Complete |
| `@jetpack-agent/cf-mail-adapter` | `CloudflareMailBus` | Durable Objects | ✅ Complete |
| `@jetpack-agent/cf-cass-adapter` | `CloudflareMemoryStore` | D1 + Vectorize | ✅ Complete |
| `@jetpack-agent/worker-api` | Hono Worker | API Gateway | ✅ Complete |

### Usage Examples

```typescript
// Local mode (default)
import { BeadsAdapter } from '@jetpack-agent/beads-adapter';
import { MCPMailAdapter } from '@jetpack-agent/mcp-mail-adapter';
import { CASSAdapter } from '@jetpack-agent/cass-adapter';

const taskStore = new BeadsAdapter({ dbPath: '.beads/beads.db' });
const mailBus = new MCPMailAdapter({ agentId: 'agent-1', mailDir: '.mail' });
const memoryStore = new CASSAdapter({ dbPath: '.cass/memories.db' });

// Edge mode (Cloudflare Workers)
import { CloudflareTaskStore } from '@jetpack-agent/cf-beads-adapter';
import { CloudflareMailBus } from '@jetpack-agent/cf-mail-adapter';
import { CloudflareMemoryStore } from '@jetpack-agent/cf-cass-adapter';

const taskStore = new CloudflareTaskStore({ db: env.D1_DATABASE });
const mailBus = new CloudflareMailBus({
  agentId: 'agent-1',
  mailboxDO: env.MAILBOX_DO,
  leaseDO: env.LEASE_DO,
});
const memoryStore = new CloudflareMemoryStore({
  db: env.D1_DATABASE,
  vectorize: env.VECTORIZE_INDEX,
});
```

## Migration Strategy

### Phase 1: Interface Abstraction ✅ COMPLETE
1. ✅ Define abstract interfaces for all adapters
2. ✅ Refactor existing adapters to implement interfaces
3. ✅ Update shared package exports
4. ✅ Tests pass with local adapters

### Phase 2: Cloudflare Adapters ✅ COMPLETE
1. ✅ Create cf-beads-adapter package (CloudflareTaskStore)
2. ✅ Create cf-mail-adapter package (CloudflareMailBus, MailboxDurableObject, LeaseDurableObject)
3. ✅ Create cf-cass-adapter package (CloudflareMemoryStore)
4. ⏳ Deploy Worker + D1 + Durable Objects

### Phase 3: Hybrid Mode (Next)
1. Add configuration for adapter selection
2. Support mixed mode (some local, some cloud)
3. Add sync between local and cloud states
4. Implement conflict resolution

### Phase 4: Full Edge Mode
1. All state on Cloudflare
2. Local CLI is thin client
3. Multiple CLI instances share state
4. Real-time collaboration support

## Configuration

```typescript
interface JetpackHybridConfig {
  mode: 'local' | 'hybrid' | 'edge';

  // When mode is 'hybrid' or 'edge'
  cloudflare?: {
    accountId: string;
    apiToken: string;
    workerUrl: string;
    d1DatabaseId: string;
    vectorizeIndexName: string;
  };

  // What to keep local in hybrid mode
  localAdapters?: {
    tasks?: boolean;  // Default: false in hybrid
    mail?: boolean;   // Default: false in hybrid
    memory?: boolean; // Default: false in hybrid
  };
}
```

## API Endpoints (Worker)

```
POST   /api/tasks              Create task
GET    /api/tasks              List tasks (with filters)
GET    /api/tasks/:id          Get task
PATCH  /api/tasks/:id          Update task
DELETE /api/tasks/:id          Delete task
POST   /api/tasks/:id/claim    Claim task (atomic)

POST   /api/mail/publish       Publish message
GET    /api/mail/subscribe     WebSocket for subscriptions
POST   /api/mail/lease         Acquire file lease
DELETE /api/mail/lease         Release file lease

POST   /api/memory             Store memory
GET    /api/memory/:id         Retrieve memory
POST   /api/memory/search      Text search
POST   /api/memory/semantic    Semantic search
POST   /api/memory/compact     Trigger compaction
```

## Security

- API token authentication for all endpoints
- Per-project isolation via Worker bindings
- Rate limiting on Worker
- Audit logging for sensitive operations
- Encrypted secrets in Worker environment
