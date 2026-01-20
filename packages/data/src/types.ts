import { z } from 'zod';

// ============================================================================
// ENUMS
// ============================================================================

export const TaskStatus = z.enum([
  'pending',
  'ready',
  'claimed',
  'in_progress',
  'completed',
  'failed',
  'pending_retry',
  'blocked',
]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const TaskPriority = z.enum(['low', 'medium', 'high', 'critical']);
export type TaskPriority = z.infer<typeof TaskPriority>;

export const TaskType = z.enum([
  'code',
  'test',
  'browser_test',
  'documentation',
  'review',
  'custom',
]);
export type TaskType = z.infer<typeof TaskType>;

export const FailureType = z.enum([
  'task_error',
  'task_timeout',
  'dependency_error',
  'quality_failure',
  'resource_error',
  'agent_crash',
]);
export type FailureType = z.infer<typeof FailureType>;

export const AgentType = z.enum([
  'claude-code',
  'codex',
  'gemini',
  'browser',
  'custom',
]);
export type AgentType = z.infer<typeof AgentType>;

export const AgentStatus = z.enum([
  'idle',
  'busy',
  'error',
  'offline',
  'shutting_down',
]);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const TaskPhase = z.enum([
  'analyzing',
  'planning',
  'implementing',
  'testing',
  'reviewing',
]);
export type TaskPhase = z.infer<typeof TaskPhase>;

// ============================================================================
// TASK
// ============================================================================

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  status: TaskStatus,
  priority: TaskPriority,
  type: TaskType,

  // Assignment
  assignedAgent: z.string().nullable().optional(),
  claimedAt: z.string().nullable().optional(),

  // Dependencies
  dependencies: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),

  // Skills
  requiredSkills: z.array(z.string()).default([]),

  // Files
  files: z.array(z.string()).default([]),

  // Timing
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  estimatedMinutes: z.number().nullable().optional(),
  actualMinutes: z.number().nullable().optional(),

  // Retry
  retryCount: z.number().default(0),
  maxRetries: z.number().default(2),
  lastError: z.string().nullable().optional(),
  failureType: FailureType.nullable().optional(),
  nextRetryAt: z.string().nullable().optional(),
  previousAgents: z.array(z.string()).default([]),

  // Result
  result: z.unknown().nullable().optional(),

  // Context
  branch: z.string().nullable().optional(),
  qualitySnapshotId: z.string().nullable().optional(),

  // Timestamps
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Task = z.infer<typeof TaskSchema>;

export interface TaskCreate {
  id?: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  type?: TaskType;
  dependencies?: string[];
  requiredSkills?: string[];
  files?: string[];
  estimatedMinutes?: number;
  branch?: string;
}

export interface TaskFilter {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  type?: TaskType | TaskType[];
  skills?: string[];
  assignedAgent?: string;
  branch?: string;
  excludeIds?: string[];
  limit?: number;
  offset?: number;
}

export interface TaskProgress {
  phase: TaskPhase;
  percentComplete: number;
  description: string;
  filesModified?: string[];
}

export interface TaskResult {
  filesCreated: string[];
  filesModified: string[];
  filesDeleted: string[];
  summary: string;
  learnings?: string[];
}

export interface TaskFailure {
  type: FailureType;
  message: string;
  details?: string;
  recoverable: boolean;
  suggestedAction?: string;
}

// ============================================================================
// AGENT
// ============================================================================

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: AgentType,
  status: AgentStatus,

  // Capabilities
  skills: z.array(z.string()).default([]),
  maxTaskMinutes: z.number().default(60),
  canRunTests: z.boolean().default(true),
  canRunBuild: z.boolean().default(true),
  canAccessBrowser: z.boolean().default(false),

  // Health
  lastHeartbeat: z.string().nullable().optional(),
  heartbeatCount: z.number().default(0),

  // Current work
  currentTaskId: z.string().nullable().optional(),
  currentTaskStartedAt: z.string().nullable().optional(),
  currentTaskProgress: z.number().default(0),
  currentTaskPhase: TaskPhase.nullable().optional(),

  // Stats
  tasksCompleted: z.number().default(0),
  tasksFailed: z.number().default(0),
  totalRuntimeMinutes: z.number().default(0),

  // Machine info
  machineId: z.string().nullable().optional(),
  machineHostname: z.string().nullable().optional(),
  pid: z.number().nullable().optional(),

  // Timestamps
  registeredAt: z.string(),
  lastActiveAt: z.string(),
});

export type Agent = z.infer<typeof AgentSchema>;

export interface AgentRegistration {
  id: string;
  name: string;
  type: AgentType;
  capabilities: {
    skills: string[];
    maxTaskMinutes?: number;
    canRunTests?: boolean;
    canRunBuild?: boolean;
    canAccessBrowser?: boolean;
  };
  machine?: {
    id: string;
    hostname: string;
    pid: number;
  };
}

export interface AgentHeartbeat {
  status: AgentStatus;
  currentTask?: {
    id: string;
    progress?: number;
    phase?: TaskPhase;
  };
  metrics?: {
    memoryUsedMB: number;
    tasksCompletedSession: number;
  };
}

export interface AgentFilter {
  status?: AgentStatus | AgentStatus[];
  type?: AgentType | AgentType[];
  skills?: string[];
  machineId?: string;
}

// ============================================================================
// MESSAGE
// ============================================================================

export const MessageTypeEnum = z.enum([
  'task.help_needed',
  'task.handoff',
  'task.claimed',
  'task.completed',
  'task.failed',
  'task.progress',
  'file.lock_request',
  'file.lock_granted',
  'file.lock_denied',
  'coordination.sync',
  'info.discovery',
  'agent.started',
  'agent.stopped',
  'system.shutdown',
  'custom',
]);
export type MessageType = z.infer<typeof MessageTypeEnum>;

export const MessageSchema = z.object({
  id: z.string(),
  type: MessageTypeEnum,
  fromAgent: z.string(),
  toAgent: z.string().nullable().optional(),
  payload: z.unknown().nullable().optional(),
  ackRequired: z.boolean().default(false),
  acknowledgedAt: z.string().nullable().optional(),
  acknowledgedBy: z.string().nullable().optional(),
  deliveredAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type Message = z.infer<typeof MessageSchema>;

export interface MessageCreate {
  type: MessageType;
  fromAgent: string;
  toAgent?: string | null;
  payload?: unknown;
  ackRequired?: boolean;
  expiresIn?: number; // milliseconds
}

export interface MessageFilter {
  type?: MessageType | MessageType[];
  fromAgent?: string;
  toAgent?: string;
  unreadOnly?: boolean;
  unackedOnly?: boolean;
  since?: string;
  limit?: number;
}

// ============================================================================
// LEASE
// ============================================================================

export const LeaseSchema = z.object({
  filePath: z.string(),
  agentId: z.string(),
  taskId: z.string().nullable().optional(),
  acquiredAt: z.string(),
  expiresAt: z.string(),
  renewedCount: z.number().default(0),
});

export type Lease = z.infer<typeof LeaseSchema>;

export interface LeaseRequest {
  filePath: string;
  agentId: string;
  taskId?: string;
  durationMs: number;
}

// ============================================================================
// QUALITY
// ============================================================================

export const QualitySnapshotSchema = z.object({
  id: z.string(),
  taskId: z.string().nullable().optional(),
  agentId: z.string().nullable().optional(),

  buildSuccess: z.boolean().nullable().optional(),
  buildTimeMs: z.number().nullable().optional(),

  typeErrors: z.number().default(0),

  lintErrors: z.number().default(0),
  lintWarnings: z.number().default(0),

  testsPassing: z.number().default(0),
  testsFailing: z.number().default(0),
  testsSkipped: z.number().default(0),
  testCoverage: z.number().nullable().optional(),
  testTimeMs: z.number().nullable().optional(),

  buildOutput: z.string().nullable().optional(),
  typeOutput: z.string().nullable().optional(),
  lintOutput: z.string().nullable().optional(),
  testOutput: z.string().nullable().optional(),

  recordedAt: z.string(),
});

export type QualitySnapshot = z.infer<typeof QualitySnapshotSchema>;

export const QualityBaselineSchema = z.object({
  buildSuccess: z.boolean(),
  typeErrors: z.number(),
  lintErrors: z.number(),
  lintWarnings: z.number(),
  testsPassing: z.number(),
  testsFailing: z.number(),
  testCoverage: z.number(),
  setBy: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type QualityBaseline = z.infer<typeof QualityBaselineSchema>;

export interface QualitySnapshotCreate {
  taskId?: string;
  agentId?: string;
  buildSuccess?: boolean;
  buildTimeMs?: number;
  typeErrors?: number;
  lintErrors?: number;
  lintWarnings?: number;
  testsPassing?: number;
  testsFailing?: number;
  testsSkipped?: number;
  testCoverage?: number;
  testTimeMs?: number;
  buildOutput?: string;
  typeOutput?: string;
  lintOutput?: string;
  testOutput?: string;
}

export interface Regression {
  metric: string;
  baseline: number;
  current: number;
  delta: number;
  severity: 'warning' | 'error';
}

// ============================================================================
// SWARM STATUS
// ============================================================================

export interface SwarmStatus {
  swarm: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    dataLayerType: 'sqlite' | 'turso';
  };
  agents: {
    total: number;
    idle: number;
    busy: number;
    error: number;
    offline: number;
    byType: Record<string, number>;
  };
  tasks: {
    total: number;
    pending: number;
    ready: number;
    claimed: number;
    inProgress: number;
    completed: number;
    failed: number;
    blocked: number;
  };
  quality: {
    baseline: QualityBaseline | null;
    lastSnapshot: QualitySnapshot | null;
    regressionCount: number;
  };
}

// ============================================================================
// DATA LAYER CONFIG
// ============================================================================

export interface SQLiteConfig {
  dbPath: string;
  walMode?: boolean;
  busyTimeout?: number;
}

export interface TursoConfig {
  url: string;
  authToken: string;
}

/**
 * Config for TursoNativeDataLayer with full Turso features
 */
export interface TursoNativeConfigOptions {
  /** Turso database URL (libsql://...) */
  url: string;
  /** Auth token for database access */
  authToken: string;
  /** Enable local SQLite replica that syncs with cloud */
  enableEmbeddedReplica?: boolean;
  /** Path for local replica database */
  localReplicaPath?: string;
  /** Sync interval in seconds (0 = manual sync only) */
  syncIntervalSeconds?: number;
  /** Organization identifier (for multi-tenancy) */
  organization?: string;
  /** Workspace/project identifier */
  workspaceId?: string;
  /** Turso Platform API token (for branching/multi-tenancy) */
  platformApiToken?: string;
  /** Embedding dimensions (default: 1536 for OpenAI) */
  embeddingDimensions?: number;
}

export interface DataLayerConfig {
  type: 'sqlite' | 'turso' | 'turso-native';
  sqlite?: SQLiteConfig;
  turso?: TursoConfig;
  tursoNative?: TursoNativeConfigOptions;
}
