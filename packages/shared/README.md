# @jetpack-agent/shared

Shared types, interfaces, and utilities for the Jetpack multi-agent orchestration system.

## Installation

```bash
npm install @jetpack-agent/shared
# or
pnpm add @jetpack-agent/shared
```

## Quick Start

```typescript
import {
  Task,
  Agent,
  MemoryEntry,
  Logger,
  generateTaskId,
  generateAgentId,
  ITaskStore,
  IMemoryStore,
  IMailBus,
} from '@jetpack-agent/shared';

// Create a logger
const logger = new Logger('MyComponent');
logger.info('Starting up');

// Generate IDs
const taskId = generateTaskId();    // e.g., 'bd-a1b2c3d4'
const agentId = generateAgentId('worker-1');  // e.g., 'agent-worker-1-x7y8z9'

// Use types
const task: Task = {
  id: taskId,
  title: 'Implement feature',
  status: 'pending',
  priority: 'high',
  dependencies: [],
  blockers: [],
  requiredSkills: ['typescript'],
  tags: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};
```

## API Reference

### Types

#### Task Types

```typescript
type TaskStatus = 'pending' | 'ready' | 'claimed' | 'in_progress' | 'blocked' | 'completed' | 'failed';
type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
type FailureType = 'timeout' | 'error' | 'stalled' | 'blocked';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dependencies: string[];
  blockers: string[];
  requiredSkills: string[];
  assignedAgent?: string;
  estimatedMinutes?: number;
  actualMinutes?: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
  retryCount?: number;
  maxRetries?: number;
  lastError?: string;
  failureType?: FailureType;
  branch?: string;
  syncVersion?: number;
}
```

#### Agent Types

```typescript
type AgentStatus = 'idle' | 'busy' | 'error' | 'offline';
type AgentSkill = string;  // Validated via SkillRegistry

interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  skills: AgentSkill[];
  acquiredSkills?: AgentSkill[];
  currentTask?: string;
  createdAt: Date;
  lastActive: Date;
}
```

#### Memory Types

```typescript
type MemoryType = 'agent_learning' | 'codebase_knowledge' | 'task_context' | 'error_pattern' | 'user_preference';

interface MemoryEntry {
  id: string;
  type: MemoryType;
  content: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  importance: number;
  createdAt: Date;
  lastAccessed: Date;
  accessCount: number;
}
```

#### Message Types

```typescript
type MessageType =
  | 'task.created' | 'task.claimed' | 'task.progress'
  | 'task.completed' | 'task.failed' | 'task.assigned'
  | 'agent.started' | 'agent.stopped' | 'agent.status'
  | 'file.lock' | 'file.unlock' | 'heartbeat';

interface Message {
  id: string;
  type: MessageType;
  from: string;
  to?: string;
  payload: Record<string, unknown>;
  timestamp: Date;
  ackRequired?: boolean;
  ackedAt?: Date;
  ackedBy?: string;
}
```

### Adapter Interfaces

These interfaces enable hybrid local/cloud deployments:

#### ITaskStore

```typescript
interface ITaskStore {
  initialize(): Promise<void>;
  close(): Promise<void>;

  createTask(input: TaskInput): Promise<Task>;
  getTask(id: string): Promise<Task | null>;
  updateTask(id: string, updates: TaskUpdate): Promise<Task | null>;
  deleteTask(id: string): Promise<boolean>;

  listTasks(options?: TaskListOptions): Promise<Task[]>;
  getReadyTasks(): Promise<Task[]>;
  getTasksByStatus(status: TaskStatus): Promise<Task[]>;
  getTasksByAgent(agentId: string): Promise<Task[]>;

  claimTask(taskId: string, agentId: string): Promise<Task | null>;
  releaseTask(taskId: string): Promise<boolean>;

  getStats(): Promise<TaskStats>;
}
```

#### IMemoryStore

```typescript
interface IMemoryStore {
  initialize(): Promise<void>;
  close(): void;

  store(entry: MemoryInput): Promise<string>;
  retrieve(id: string): Promise<MemoryEntry | null>;
  delete?(id: string): Promise<boolean>;

  search(query: string, limit?: number): Promise<MemoryEntry[]>;
  semanticSearch(embedding: number[], limit?: number): Promise<MemoryEntry[]>;
  semanticSearchByQuery(query: string, limit?: number): Promise<MemoryEntry[]>;

  compact(threshold: number): Promise<number>;
  adaptiveCompact(): Promise<number>;
  updateImportance(id: string, importance: number): Promise<void>;

  getByType(type: MemoryType, limit?: number): Promise<MemoryEntry[]>;
  getRecentMemories(limit?: number): Promise<MemoryEntry[]>;
  getStats(): Promise<MemoryStats>;
}
```

#### IMailBus

```typescript
interface IMailBus {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;

  publish(message: Message): Promise<void>;
  subscribe(type: MessageType, handler: MessageHandler): void;
  unsubscribe(type: MessageType, handler: MessageHandler): void;

  sendTo?(agentId: string, message: Message): Promise<void>;
  acknowledge?(messageId: string, agentId: string): Promise<void>;

  acquireLease(file: string, ttlMs: number): Promise<boolean>;
  releaseLease(file: string): Promise<void>;
  isLeased(file: string): Promise<LeaseStatus>;

  sendHeartbeat(): Promise<void>;

  readonly agentId: string;
}
```

### Services

#### SkillRegistry

Dynamic skill management for agents:

```typescript
import { getSkillRegistry, SkillDefinition } from '@jetpack-agent/shared';

const registry = getSkillRegistry();

// Register custom skills
registry.registerSkill({
  id: 'kubernetes',
  name: 'Kubernetes',
  category: 'devops',
  description: 'Container orchestration',
  aliases: ['k8s'],
  relatedSkills: ['docker', 'devops'],
});

// Calculate skill match score
const score = registry.calculateMatchScore(
  ['typescript', 'react'],   // agent skills
  ['typescript', 'frontend'] // required skills
);

// Suggest skills to acquire
const suggestions = registry.suggestSkillsToAcquire(
  ['typescript'],           // current skills
  ['typescript', 'react']   // required skills
);

// Validate skills
const isValid = registry.isValid('typescript');
const normalized = registry.normalizeSkills(['ts', 'TS']);
```

### Utilities

#### Logger

```typescript
import { Logger } from '@jetpack-agent/shared';

const logger = new Logger('MyModule');
logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message', error);
```

#### ID Generation

```typescript
import { generateTaskId, generateAgentId, generateMessageId } from '@jetpack-agent/shared';

const taskId = generateTaskId();      // 'bd-a1b2c3d4'
const agentId = generateAgentId('worker');  // 'agent-worker-x7y8z9'
const msgId = generateMessageId();    // 'msg-a1b2c3d4e5f6'
```

#### Hash Utilities

```typescript
import { hashContent } from '@jetpack-agent/shared';

const hash = hashContent('some content');
```

### Sync Module

For offline-first state synchronization (import separately):

```typescript
import { StateSync, ChangeTracker, OfflineQueue, ConflictResolver } from '@jetpack-agent/shared/sync';

const sync = new StateSync({
  onConflict: (local, remote) => ConflictResolver.lastWriteWins(local, remote),
});

await sync.trackChange('task', taskId, 'update', task);
await sync.flush();
```

### Runtime Types

For autonomous operation management:

```typescript
import {
  RuntimeLimits,
  RuntimeStats,
  RuntimeState,
  EndState,
  RuntimeEvent,
  formatDuration,
} from '@jetpack-agent/shared';

const limits: RuntimeLimits = {
  maxCycles: 100,
  maxRuntimeMs: 3600000,  // 1 hour
  idleTimeoutMs: 300000,  // 5 minutes
  maxConsecutiveFailures: 5,
  minQueueSize: 0,
  checkIntervalMs: 5000,
};

console.log(formatDuration(3661000));  // '1h 1m 1s'
```

## Zod Schemas

All types have corresponding Zod schemas for validation:

```typescript
import { TaskSchema, AgentSchema, MemoryEntrySchema } from '@jetpack-agent/shared';

const validatedTask = TaskSchema.parse(untrustedData);
const result = AgentSchema.safeParse(maybeAgent);
if (result.success) {
  console.log(result.data);
}
```

## Related Packages

- `@jetpack-agent/orchestrator` - Multi-agent orchestration engine
- `@jetpack-agent/beads-adapter` - Git-backed task management
- `@jetpack-agent/cass-adapter` - SQLite-based agent memory
- `@jetpack-agent/mcp-mail-adapter` - Inter-agent messaging

## License

MIT
