import type {
  Task,
  TaskCreate,
  TaskFilter,
  TaskProgress,
  TaskResult,
  TaskFailure,
  Agent,
  AgentRegistration,
  AgentHeartbeat,
  AgentFilter,
  Message,
  MessageCreate,
  MessageFilter,
  Lease,
  LeaseRequest,
  QualitySnapshot,
  QualitySnapshotCreate,
  QualityBaseline,
  Regression,
  SwarmStatus,
} from './types.js';

/**
 * Operations for managing tasks in the swarm
 */
export interface TaskOperations {
  /**
   * Create a new task
   */
  create(task: TaskCreate): Promise<Task>;

  /**
   * Get a task by ID
   */
  get(id: string): Promise<Task | null>;

  /**
   * Update a task
   */
  update(id: string, updates: Partial<Task>): Promise<Task | null>;

  /**
   * Delete a task
   */
  delete(id: string): Promise<boolean>;

  /**
   * List tasks with optional filtering
   */
  list(filter?: TaskFilter): Promise<Task[]>;

  /**
   * Count tasks matching filter
   */
  count(filter?: TaskFilter): Promise<number>;

  /**
   * Atomically claim a ready task for an agent
   * Returns null if no matching task is available
   */
  claim(agentId: string, filter?: TaskFilter): Promise<Task | null>;

  /**
   * Release a claimed task back to ready status
   */
  release(taskId: string, reason: string): Promise<boolean>;

  /**
   * Update task progress
   */
  updateProgress(taskId: string, progress: TaskProgress): Promise<boolean>;

  /**
   * Mark task as completed
   */
  complete(taskId: string, result: TaskResult): Promise<Task | null>;

  /**
   * Mark task as failed
   */
  fail(taskId: string, failure: TaskFailure): Promise<Task | null>;

  /**
   * Find tasks eligible for retry (pending_retry with next_retry_at <= now)
   */
  findRetryEligible(now: number): Promise<Task[]>;

  /**
   * Reset a failed task for retry
   */
  resetForRetry(taskId: string): Promise<boolean>;

  /**
   * Update blocked tasks to ready when dependencies are complete
   */
  updateBlockedToReady(): Promise<number>;

  /**
   * Get tasks assigned to a specific agent
   */
  getAgentTasks(agentId: string): Promise<Task[]>;
}

/**
 * Operations for managing agents in the swarm
 */
export interface AgentOperations {
  /**
   * Register a new agent
   */
  register(agent: AgentRegistration): Promise<Agent>;

  /**
   * Get an agent by ID
   */
  get(id: string): Promise<Agent | null>;

  /**
   * Update agent heartbeat and status
   */
  heartbeat(agentId: string, heartbeat: AgentHeartbeat): Promise<boolean>;

  /**
   * Deregister an agent
   */
  deregister(agentId: string): Promise<boolean>;

  /**
   * List agents with optional filtering
   */
  list(filter?: AgentFilter): Promise<Agent[]>;

  /**
   * Count agents matching filter
   */
  count(filter?: AgentFilter): Promise<number>;

  /**
   * Find agents with stale heartbeats (last_heartbeat < threshold)
   */
  findStale(thresholdMs: number): Promise<Agent[]>;

  /**
   * Update agent statistics after task completion
   */
  updateStats(agentId: string, completed: boolean, runtimeMinutes: number): Promise<boolean>;

  /**
   * Set agent's current task
   */
  setCurrentTask(agentId: string, taskId: string | null): Promise<boolean>;
}

/**
 * Operations for inter-agent messaging
 */
export interface MessageOperations {
  /**
   * Send a message
   */
  send(message: MessageCreate): Promise<Message>;

  /**
   * Get a message by ID
   */
  get(id: string): Promise<Message | null>;

  /**
   * Receive messages for an agent
   */
  receive(agentId: string, filter?: MessageFilter): Promise<Message[]>;

  /**
   * Mark messages as delivered
   */
  markDelivered(messageIds: string[], agentId: string): Promise<number>;

  /**
   * Acknowledge a message
   */
  acknowledge(messageId: string, agentId: string): Promise<boolean>;

  /**
   * Broadcast a message to all agents
   */
  broadcast(message: Omit<MessageCreate, 'toAgent'>): Promise<Message>;

  /**
   * Get unacknowledged messages requiring acknowledgment
   */
  getUnacknowledged(olderThanMs?: number): Promise<Message[]>;

  /**
   * Delete expired messages
   */
  deleteExpired(): Promise<number>;
}

/**
 * Operations for file leasing (locking)
 */
export interface LeaseOperations {
  /**
   * Attempt to acquire a lease on a file
   * Returns true if acquired, false if already held by another agent
   */
  acquire(request: LeaseRequest): Promise<boolean>;

  /**
   * Release a lease
   */
  release(filePath: string, agentId: string): Promise<boolean>;

  /**
   * Force release a lease (for coordinator cleanup)
   */
  forceRelease(filePath: string): Promise<boolean>;

  /**
   * Check if a file is leased
   */
  check(filePath: string): Promise<Lease | null>;

  /**
   * Extend a lease
   */
  extend(filePath: string, agentId: string, durationMs: number): Promise<boolean>;

  /**
   * Get all leases held by an agent
   */
  getAgentLeases(agentId: string): Promise<Lease[]>;

  /**
   * Find expired leases
   */
  findExpired(): Promise<Lease[]>;

  /**
   * Release all leases held by an agent
   */
  releaseAll(agentId: string): Promise<number>;
}

/**
 * Operations for quality metrics
 */
export interface QualityOperations {
  /**
   * Record a quality snapshot
   */
  recordSnapshot(snapshot: QualitySnapshotCreate): Promise<QualitySnapshot>;

  /**
   * Get a snapshot by ID
   */
  getSnapshot(id: string): Promise<QualitySnapshot | null>;

  /**
   * Get the most recent snapshot
   */
  getLatestSnapshot(): Promise<QualitySnapshot | null>;

  /**
   * Get snapshots for a task
   */
  getTaskSnapshots(taskId: string): Promise<QualitySnapshot[]>;

  /**
   * Get the quality baseline
   */
  getBaseline(): Promise<QualityBaseline | null>;

  /**
   * Set the quality baseline
   */
  setBaseline(baseline: Omit<QualityBaseline, 'createdAt' | 'updatedAt'>): Promise<QualityBaseline>;

  /**
   * Detect regressions between a snapshot and the baseline
   */
  detectRegressions(snapshot: QualitySnapshot): Promise<Regression[]>;
}

/**
 * Main data layer interface for Jetpack Swarm
 *
 * This interface defines all operations needed to coordinate
 * a swarm of agents. Implementations include:
 * - SQLiteDataLayer: Local file-based SQLite database
 * - TursoDataLayer: Cloud-hosted SQLite via Turso
 */
export interface DataLayer {
  /**
   * Initialize the data layer (create tables, run migrations)
   */
  initialize(): Promise<void>;

  /**
   * Close the data layer connection
   */
  close(): Promise<void>;

  /**
   * Check if the data layer is healthy
   */
  isHealthy(): Promise<boolean>;

  /**
   * Get the data layer type
   */
  readonly type: 'sqlite' | 'turso';

  /**
   * Task operations
   */
  tasks: TaskOperations;

  /**
   * Agent operations
   */
  agents: AgentOperations;

  /**
   * Message operations
   */
  messages: MessageOperations;

  /**
   * Lease operations
   */
  leases: LeaseOperations;

  /**
   * Quality operations
   */
  quality: QualityOperations;

  /**
   * Get full swarm status
   */
  getSwarmStatus(): Promise<SwarmStatus>;

  /**
   * Execute a function within a transaction
   * Note: Only available for SQLite (sync), Turso uses separate transaction API
   */
  transaction?<T>(fn: () => T): T;
}

/**
 * Error thrown by data layer operations
 */
export class DataLayerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'DataLayerError';
  }
}

export const DataLayerErrorCodes = {
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',
  LEASE_HELD: 'LEASE_HELD',
  INVALID_STATE: 'INVALID_STATE',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  TRANSACTION_ERROR: 'TRANSACTION_ERROR',
} as const;

export type DataLayerErrorCode = (typeof DataLayerErrorCodes)[keyof typeof DataLayerErrorCodes];
