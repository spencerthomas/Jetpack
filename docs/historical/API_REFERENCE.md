# Jetpack API Reference

> Centralized API documentation for all Jetpack packages

**Last Updated:** January 2026

---

## Table of Contents

1. [JetpackOrchestrator](#jetpackorchestrator)
2. [BeadsAdapter](#beadsadapter)
3. [CASSAdapter](#cassadapter)
4. [MCPMailAdapter](#mcpmailadapter)
5. [AgentController](#agentcontroller)
6. [LangGraphSupervisor](#langgraphsupervisor)
7. [Cloudflare Adapters](#cloudflare-adapters)
8. [Types & Interfaces](#types--interfaces)

---

## JetpackOrchestrator

**Package:** `@jetpack-agent/orchestrator`

Central coordination layer for multi-agent orchestration.

### Constructor

```typescript
const orchestrator = new JetpackOrchestrator(config: JetpackConfig);

interface JetpackConfig {
  workDir: string;              // Project root directory
  maxAgents?: number;           // Maximum concurrent agents (default: 5)
  pollInterval?: number;        // Task polling interval ms (default: 1000)
  hybridSettings?: HybridSettings;
}

interface HybridSettings {
  mode: 'local' | 'hybrid' | 'edge';
  cloudflare?: {
    workerUrl: string;
    apiToken: string;
  };
}
```

### Lifecycle Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `initialize()` | `Promise<void>` | Initialize all adapters and agents |
| `shutdown()` | `Promise<void>` | Graceful shutdown with resource cleanup |
| `startAgents(count)` | `Promise<void>` | Start N agent controllers |
| `stopAgents()` | `Promise<void>` | Stop all agents |

### Task Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `createTask(input)` | `Promise<Task>` | Create a new task |
| `getTask(id)` | `Promise<Task \| null>` | Get task by ID |
| `updateTask(id, updates)` | `Promise<Task>` | Update task fields |
| `getReadyTasks()` | `Promise<Task[]>` | Get tasks ready for execution |
| `getStatus()` | `Promise<SystemStatus>` | Get full system status |

### Adapter Access

| Method | Returns | Description |
|--------|---------|-------------|
| `getBeadsAdapter()` | `BeadsAdapter` | Task storage adapter |
| `getCASSAdapter()` | `CASSAdapter` | Memory storage adapter |
| `getMCPMailAdapter()` | `MCPMailAdapter` | Messaging adapter |
| `getTaskStore()` | `ITaskStore` | Task store interface |
| `getMemoryStore()` | `IMemoryStore` | Memory store interface |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `adapterMode` | `'local' \| 'hybrid' \| 'edge'` | Current adapter mode |
| `agents` | `AgentController[]` | Active agent controllers |

### Events

```typescript
orchestrator.on('task.created', (task: Task) => {});
orchestrator.on('task.completed', (task: Task) => {});
orchestrator.on('task.failed', (task: Task, error: Error) => {});
orchestrator.on('agent.started', (agent: AgentController) => {});
orchestrator.on('agent.stopped', (agent: AgentController) => {});
```

---

## BeadsAdapter

**Package:** `@jetpack-agent/beads-adapter`

Git-backed task management with dependency tracking.

### Constructor

```typescript
const beads = new BeadsAdapter(config: BeadsConfig);

interface BeadsConfig {
  workDir: string;           // Project root
  tasksFile?: string;        // JSONL file path (default: .beads/tasks.jsonl)
}
```

### Task CRUD

| Method | Returns | Description |
|--------|---------|-------------|
| `createTask(input)` | `Promise<Task>` | Create task with auto-generated ID |
| `getTask(id)` | `Promise<Task \| null>` | Get task by ID |
| `updateTask(id, updates)` | `Promise<Task>` | Update task fields |
| `deleteTask(id)` | `Promise<boolean>` | Delete task |
| `getAllTasks()` | `Promise<Task[]>` | Get all tasks |

### Query Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getReadyTasks()` | `Promise<Task[]>` | Tasks with satisfied dependencies |
| `getTasksByStatus(status)` | `Promise<Task[]>` | Filter by status |
| `getTasksByPriority(priority)` | `Promise<Task[]>` | Filter by priority |
| `getBlockedTasks()` | `Promise<Task[]>` | Tasks with unmet dependencies |

### Workflow Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `claimTask(taskId, agentId)` | `Promise<boolean>` | Atomically claim task |
| `releaseTask(taskId)` | `Promise<boolean>` | Release claimed task |
| `buildTaskGraph()` | `Promise<TaskGraph>` | Build dependency graph |

### Statistics

```typescript
const stats = await beads.getStats();
// { total, pending, ready, inProgress, completed, failed, blocked }
```

---

## CASSAdapter

**Package:** `@jetpack-agent/cass-adapter`

SQLite-based persistent memory with vector embeddings.

### Constructor

```typescript
const cass = new CASSAdapter(config: CASSConfig);

interface CASSConfig {
  workDir: string;
  dbPath?: string;           // SQLite path (default: .cass/memory.db)
  autoGenerateEmbeddings?: boolean;
  embeddingModel?: string;
  maxEntries?: number;
  compactionThreshold?: number;
}
```

### Storage Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `store(entry)` | `Promise<MemoryEntry>` | Store memory entry |
| `get(id)` | `Promise<MemoryEntry \| null>` | Get by ID |
| `update(id, updates)` | `Promise<MemoryEntry>` | Update entry |
| `delete(id)` | `Promise<boolean>` | Delete entry |

### Search Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `search(query, limit?)` | `Promise<MemoryEntry[]>` | Semantic search |
| `semanticSearch(embedding, limit?)` | `Promise<MemoryEntry[]>` | Vector similarity search |
| `getByType(type, limit?)` | `Promise<MemoryEntry[]>` | Filter by memory type |
| `getRecentMemories(limit?)` | `Promise<MemoryEntry[]>` | Most recent entries |

### Maintenance Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `compact(threshold?)` | `Promise<number>` | Remove low-importance entries |
| `backfillEmbeddings(batchSize?)` | `Promise<BackfillResult>` | Generate missing embeddings |
| `reconfigure(options)` | `Promise<void>` | Hot-reload configuration |
| `adaptiveCompact()` | `Promise<void>` | Automatic compaction |

### Statistics

```typescript
const stats = await cass.getStats();
// { total, byType, avgImportance, embeddingCoverage }
```

---

## MCPMailAdapter

**Package:** `@jetpack-agent/mcp-mail-adapter`

File-based pub/sub messaging with file leasing.

### Constructor

```typescript
const mail = new MCPMailAdapter(config: MCPMailConfig);

interface MCPMailConfig {
  mailDir: string;           // Base directory for mail storage
  agentId: string;           // Unique agent identifier
}
```

### Messaging Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `subscribe(type, handler)` | `void` | Subscribe to message type |
| `unsubscribe(type, handler)` | `void` | Remove subscription |
| `publish(message)` | `Promise<void>` | Send to specific agent |
| `broadcast(message)` | `Promise<void>` | Send to all agents |
| `acknowledge(messageId)` | `Promise<void>` | Mark processed |

### File Leasing Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `acquireLease(path, durationMs)` | `Promise<boolean>` | Lock file |
| `releaseLease(path)` | `Promise<void>` | Unlock file |
| `renewLease(path, durationMs)` | `Promise<boolean>` | Extend lease |
| `isLeased(path)` | `Promise<LeaseStatus>` | Check lock status |
| `releaseAllLeases()` | `Promise<void>` | Release all agent's leases |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `agentId` | `string` | Agent's unique identifier |

---

## AgentController

**Package:** `@jetpack-agent/orchestrator`

Individual agent lifecycle management.

### Constructor

```typescript
const agent = new AgentController(config: AgentConfig);

interface AgentConfig {
  id: string;
  name: string;
  skills: AgentSkill[];
  workDir: string;
  beads: BeadsAdapter;
  cass: CASSAdapter;
  mail: MCPMailAdapter;
}
```

### Lifecycle Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `start()` | `Promise<void>` | Start agent and begin polling |
| `stop()` | `Promise<void>` | Stop agent gracefully |
| `lookForWork()` | `Promise<void>` | Check for available tasks |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique agent ID |
| `name` | `string` | Display name |
| `status` | `AgentStatus` | Current status |
| `skills` | `AgentSkill[]` | Agent capabilities |
| `currentTask` | `Task \| null` | Active task |
| `tasksCompleted` | `number` | Completion count |

### Events

```typescript
agent.on('task.claimed', (task: Task) => {});
agent.on('task.completed', (task: Task, result: any) => {});
agent.on('task.failed', (task: Task, error: Error) => {});
agent.on('status.changed', (status: AgentStatus) => {});
```

---

## LangGraphSupervisor

**Package:** `@jetpack-agent/supervisor`

LangGraph-based intelligent orchestration.

### Constructor

```typescript
const supervisor = new LangGraphSupervisor(config: SupervisorConfig);

interface SupervisorConfig {
  provider: 'claude' | 'openai' | 'ollama';
  model?: string;
  orchestrator: JetpackOrchestrator;
}
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `process(request)` | `Promise<SupervisorResult>` | Process high-level request |
| `getState()` | `SupervisorState` | Get current state |
| `cancel()` | `Promise<void>` | Cancel current operation |

### Graph Nodes

| Node | Purpose |
|------|---------|
| `PlannerNode` | Decompose request into tasks |
| `AssignerNode` | Match tasks to agents |
| `MonitorNode` | Track progress |
| `CoordinatorNode` | Handle conflicts |

---

## Cloudflare Adapters

### CloudflareBeadsAdapter

**Package:** `@jetpack-agent/cf-beads-adapter`

```typescript
const beads = new CloudflareBeadsAdapter(config: CloudflareBeadsConfig);

interface CloudflareBeadsConfig {
  db: D1Database;            // D1 binding
}
```

Same API as `BeadsAdapter` but uses D1 storage.

### CloudflareCASSAdapter

**Package:** `@jetpack-agent/cf-cass-adapter`

```typescript
const cass = new CloudflareCASSAdapter(config: CloudflareCASSConfig);

interface CloudflareCASSConfig {
  db: D1Database;            // D1 binding
  vectorize: VectorizeIndex; // Vectorize binding
  ai?: Ai;                   // Workers AI binding (optional)
}
```

Same API as `CASSAdapter` but uses D1 + Vectorize.

### CloudflareMailBus

**Package:** `@jetpack-agent/cf-mail-adapter`

```typescript
const mail = new CloudflareMailBus(config: CloudflareMailConfig);

interface CloudflareMailConfig {
  mailboxDO: DurableObjectNamespace;  // Mailbox DO
  leaseDO: DurableObjectNamespace;    // Lease DO
  agentId: string;
}
```

Same API as `MCPMailAdapter` but uses Durable Objects.

---

## Types & Interfaces

### Task

```typescript
interface Task {
  id: string;                    // "bd-XXXX"
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  requiredSkills: AgentSkill[];
  dependencies: string[];
  estimatedMinutes?: number;
  createdAt: Date;
  claimedBy?: string;
  completedAt?: Date;
  parentId?: string;
  metadata?: Record<string, any>;
}

type TaskStatus =
  | 'pending'
  | 'ready'
  | 'claimed'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'failed';

type Priority = 'low' | 'medium' | 'high' | 'critical';
```

### MemoryEntry

```typescript
interface MemoryEntry {
  id: string;
  type: MemoryType;
  content: string;
  importance: number;          // 0-1 scale
  embedding?: number[];
  metadata?: Record<string, any>;
  accessCount: number;
  createdAt: Date;
  lastAccessed: Date;
}

type MemoryType =
  | 'codebase_knowledge'
  | 'agent_learning'
  | 'pattern_recognition'
  | 'conversation_history'
  | 'decision_rationale';
```

### Message

```typescript
interface Message {
  id: string;
  type: MessageType;
  from: string;
  to?: string;
  payload: any;
  timestamp: Date;
  correlationId?: string;
}

type MessageType =
  | 'task.created'
  | 'task.claimed'
  | 'task.assigned'
  | 'task.completed'
  | 'task.failed'
  | 'agent.started'
  | 'agent.stopped'
  | 'heartbeat'
  | 'file.lock'
  | 'file.unlock'
  | 'coordination.request'
  | 'coordination.response';
```

### Agent

```typescript
interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  skills: AgentSkill[];
  currentTask?: string;
  tasksCompleted: number;
  lastHeartbeat: Date;
}

type AgentStatus = 'idle' | 'busy' | 'error' | 'offline';

type AgentSkill =
  | 'typescript' | 'javascript' | 'python' | 'rust' | 'go'
  | 'react' | 'vue' | 'angular' | 'svelte'
  | 'backend' | 'frontend' | 'database' | 'devops'
  | 'testing' | 'documentation' | 'security';
```

### Interfaces

```typescript
// Task storage interface
interface ITaskStore {
  createTask(input: TaskInput): Promise<Task>;
  getTask(id: string): Promise<Task | null>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task>;
  deleteTask(id: string): Promise<boolean>;
  getAllTasks(): Promise<Task[]>;
  getReadyTasks(): Promise<Task[]>;
  claimTask(taskId: string, agentId: string): Promise<boolean>;
}

// Memory storage interface
interface IMemoryStore {
  store(entry: MemoryInput): Promise<MemoryEntry>;
  get(id: string): Promise<MemoryEntry | null>;
  search(query: string, limit?: number): Promise<MemoryEntry[]>;
  semanticSearch(embedding: number[], limit?: number): Promise<MemoryEntry[]>;
  getByType(type: MemoryType, limit?: number): Promise<MemoryEntry[]>;
  compact(threshold?: number): Promise<number>;
}

// Message bus interface
interface IMailBus {
  agentId: string;
  subscribe(type: MessageType, handler: MessageHandler): void;
  unsubscribe(type: MessageType, handler: MessageHandler): void;
  publish(message: Message): Promise<void>;
  broadcast(message: Message): Promise<void>;
  acquireLease(path: string, durationMs: number): Promise<boolean>;
  releaseLease(path: string): Promise<void>;
}
```

---

## Related Documentation

- [Getting Started Guide](../GUIDE.md) - Quick start guide
- [Complete Guide](./JETPACK_COMPLETE_GUIDE.md) - Comprehensive documentation
- [Architecture](../ARCHITECTURE.md) - System design
- [Hybrid Architecture](./HYBRID_ARCHITECTURE.md) - Cloudflare hybrid mode
