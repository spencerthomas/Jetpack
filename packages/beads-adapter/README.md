# @jetpack-agent/beads-adapter

Git-backed task management adapter for Jetpack, implementing Steve Yegge's Beads system for persistent, version-controlled task storage.

## Installation

```bash
npm install @jetpack-agent/beads-adapter
# or
pnpm add @jetpack-agent/beads-adapter
```

## Quick Start

```typescript
import { BeadsAdapter } from '@jetpack-agent/beads-adapter';

const beads = new BeadsAdapter({
  beadsDir: '/path/to/project/.beads',
  autoCommit: true,
  gitEnabled: true,
});

await beads.initialize();

// Create a task
const task = await beads.createTask({
  title: 'Implement user authentication',
  description: 'Add login/logout functionality',
  status: 'pending',
  priority: 'high',
  dependencies: [],
  blockers: [],
  requiredSkills: ['typescript', 'backend'],
  tags: ['auth', 'security'],
});

// Get ready tasks (no blockers, dependencies satisfied)
const readyTasks = await beads.getReadyTasks();

// Claim a task for an agent
const claimed = await beads.claimTask(task.id, 'agent-1');

// Update task status
await beads.updateTask(task.id, { status: 'completed' });

// Clean up
await beads.close();
```

## API Reference

### BeadsAdapter

Implements `ITaskStore` interface from `@jetpack-agent/shared`.

#### Constructor Options

```typescript
interface BeadsAdapterConfig {
  beadsDir: string;          // Directory for task storage (e.g., '.beads')
  autoCommit: boolean;       // Auto-commit changes to git
  gitEnabled: boolean;       // Enable git version control
  watchForChanges?: boolean; // Watch for external task file changes (default: true)
}
```

#### Core Methods

```typescript
// Lifecycle
await beads.initialize();
await beads.close();

// CRUD Operations
await beads.createTask(input: TaskInput): Promise<Task>;
await beads.getTask(id: string): Promise<Task | null>;
await beads.updateTask(id: string, updates: TaskUpdate): Promise<Task | null>;
await beads.deleteTask(id: string): Promise<boolean>;

// Queries
await beads.listTasks(options?: TaskListOptions): Promise<Task[]>;
await beads.getReadyTasks(): Promise<Task[]>;
await beads.getTasksByStatus(status: TaskStatus): Promise<Task[]>;
await beads.getTasksByAgent(agentId: string): Promise<Task[]>;

// Atomic Operations (for multi-agent coordination)
await beads.claimTask(taskId: string, agentId: string): Promise<Task | null>;
await beads.releaseTask(taskId: string): Promise<boolean>;

// Statistics
await beads.getStats(): Promise<TaskStats>;
await beads.getExtendedStats(): Promise<ExtendedTaskStats>;
```

#### TaskListOptions

```typescript
interface TaskListOptions {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  assignedAgent?: string;
  branch?: string;
  limit?: number;
  offset?: number;
}
```

### Dependency Management

The adapter provides smart dependency handling for parallel task execution.

```typescript
// Get tasks organized into parallel execution batches
const batches = await beads.getParallelBatches();
// Returns: Task[][] - each inner array can run in parallel

// Analyze the dependency graph
const analysis = await beads.analyzeDependencyGraph();
console.log({
  totalTasks: analysis.totalTasks,
  parallelBatches: analysis.parallelBatches,
  maxParallelism: analysis.maxParallelism,
  avgDependencies: analysis.avgDependencies,
  bottlenecks: analysis.bottlenecks,      // Tasks many others depend on
  isolatedTasks: analysis.isolatedTasks,   // Tasks with no dependencies
  criticalPath: analysis.criticalPath,     // Longest dependency chain
});

// Detect potential bottlenecks
const bottlenecks = await beads.detectBottlenecks(minDependents: 2);
// Returns tasks sorted by dependent count

// Get next batch grouped by skill requirements
const bySkill = await beads.getNextBatchBySkills();
// Returns: Map<string, Task[]> - tasks grouped by primary skill
```

### Task Graph

Build and query the full dependency graph:

```typescript
const graph = await beads.buildTaskGraph();

// graph.tasks: Map<string, Task>
// graph.edges: Map<string, Set<string>> - task -> dependencies
```

## Storage Format

Tasks are stored in JSONL format at `{beadsDir}/tasks.jsonl`:

```json
{"id":"bd-a1b2c3d4","title":"Implement feature","status":"pending","priority":"high",...}
{"id":"bd-e5f6g7h8","title":"Write tests","status":"ready","priority":"medium",...}
```

## Git Integration

When `gitEnabled` and `autoCommit` are true:

- Tasks file is automatically added to git staging
- Changes are committed with timestamp: `Update tasks: 2024-01-15T10:30:00.000Z`
- Git errors are silently ignored (e.g., when nothing to commit)

## File Watching

With `watchForChanges: true` (default), the adapter watches for external changes to `tasks.jsonl`:

- Detects tasks added by CLI or other tools
- Debounces rapid changes (100ms)
- Only reloads when file grows (new tasks added)

## Example: Full Workflow

```typescript
import { BeadsAdapter } from '@jetpack-agent/beads-adapter';

const beads = new BeadsAdapter({
  beadsDir: './.beads',
  autoCommit: true,
  gitEnabled: true,
});

await beads.initialize();

// Create tasks with dependencies
const authTask = await beads.createTask({
  title: 'Implement authentication',
  status: 'pending',
  priority: 'high',
  dependencies: [],
  blockers: [],
  requiredSkills: ['typescript', 'backend'],
  tags: ['auth'],
});

const dashboardTask = await beads.createTask({
  title: 'Build user dashboard',
  status: 'pending',
  priority: 'medium',
  dependencies: [authTask.id],  // Depends on auth
  blockers: [],
  requiredSkills: ['typescript', 'react'],
  tags: ['ui'],
});

// Get tasks ready for execution
const ready = await beads.getReadyTasks();
console.log(`Ready tasks: ${ready.length}`);  // 1 (auth task)

// Agent claims and completes auth task
await beads.claimTask(authTask.id, 'agent-1');
await beads.updateTask(authTask.id, { status: 'in_progress' });
await beads.updateTask(authTask.id, { status: 'completed' });

// Now dashboard task becomes ready
const nowReady = await beads.getReadyTasks();
console.log(`Ready tasks: ${nowReady.length}`);  // 1 (dashboard task)

// Get statistics
const stats = await beads.getStats();
console.log(`Total: ${stats.total}, Completed: ${stats.byStatus.completed}`);

await beads.close();
```

## Related Packages

- `@jetpack-agent/shared` - Shared types and `ITaskStore` interface
- `@jetpack-agent/orchestrator` - Multi-agent orchestration engine
- `@jetpack-agent/cass-adapter` - Agent memory storage
- `@jetpack-agent/mcp-mail-adapter` - Inter-agent messaging

## License

MIT
