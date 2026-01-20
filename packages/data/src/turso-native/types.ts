/**
 * Turso-Native Types
 * 
 * Extended types for Turso's advanced features:
 * - Vector embeddings
 * - Database branching
 * - Multi-tenancy
 * - Sync status
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface TursoNativeConfig {
  /** Turso database URL (libsql://...) */
  url: string;
  /** Auth token for database access */
  authToken: string;
  
  // Embedded Replica (Offline-First)
  /** Enable local SQLite replica that syncs with cloud */
  enableEmbeddedReplica?: boolean;
  /** Path for local replica database */
  localReplicaPath?: string;
  /** Sync interval in seconds (0 = manual sync only) */
  syncIntervalSeconds?: number;
  
  // Multi-tenancy
  /** Organization identifier */
  organization?: string;
  /** Workspace/project identifier */
  workspaceId?: string;
  
  // Turso Platform API (for branching/multi-tenancy management)
  /** Turso Platform API token (different from database auth token) */
  platformApiToken?: string;
  
  // Vector search
  /** Embedding dimensions (default: 1536 for OpenAI) */
  embeddingDimensions?: number;
}

// ============================================================================
// MEMORY / VECTOR SEARCH (Replaces CASS)
// ============================================================================

export type MemoryType = 
  | 'codebase_knowledge'
  | 'agent_learning'
  | 'task_context'
  | 'conversation'
  | 'error_pattern'
  | 'solution_pattern'
  | 'general';

export interface Memory {
  id: string;
  agentId?: string;
  taskId?: string;
  workspaceId?: string;
  
  content: string;
  memoryType: MemoryType;
  
  importance: number;
  tags: string[];
  source?: string;
  
  // Vector embedding (stored as Float32Array)
  embedding?: Float32Array;
  
  accessCount: number;
  lastAccessedAt?: string;
  expiresAt?: string;
  
  createdAt: string;
  updatedAt: string;
}

export interface MemoryCreate {
  agentId?: string;
  taskId?: string;
  workspaceId?: string;
  
  content: string;
  memoryType?: MemoryType;
  importance?: number;
  tags?: string[];
  source?: string;
  
  /** Raw embedding vector from your embedding model */
  embedding?: number[] | Float32Array;
  
  expiresAt?: string;
}

export interface MemoryFilter {
  agentId?: string;
  taskId?: string;
  workspaceId?: string;
  memoryType?: MemoryType | MemoryType[];
  minImportance?: number;
  tags?: string[];
  includeExpired?: boolean;
}

export interface VectorSearchOptions {
  /** Maximum number of results */
  limit?: number;
  /** Minimum similarity threshold (0-1, higher = more similar) */
  threshold?: number;
  /** Filter results by memory type */
  memoryType?: MemoryType | MemoryType[];
  /** Filter by agent */
  agentId?: string;
  /** Filter by task */
  taskId?: string;
  /** Include importance weighting in ranking */
  weightByImportance?: boolean;
}

export interface VectorSearchResult {
  memory: Memory;
  similarity: number;
  /** Combined score if importance weighting enabled */
  score?: number;
}

// ============================================================================
// DATABASE BRANCHING
// ============================================================================

export type BranchStatus = 'active' | 'merged' | 'deleted' | 'archived';

export interface Branch {
  id: string;
  name: string;
  description?: string;
  
  parentBranchId?: string;
  parentDatabaseUrl?: string;
  
  status: BranchStatus;
  createdBy?: string;
  purpose?: string;
  
  createdAt: string;
  mergedAt?: string;
  deletedAt?: string;
}

export interface BranchCreate {
  name: string;
  description?: string;
  purpose?: string;
  createdBy?: string;
}

export interface BranchMergeResult {
  success: boolean;
  conflicts?: Array<{
    table: string;
    recordId: string;
    field: string;
    sourceValue: unknown;
    targetValue: unknown;
  }>;
  mergedRecords: number;
}

// ============================================================================
// SYNC STATUS (Embedded Replica)
// ============================================================================

export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'error' | 'offline';

export interface SyncMetadata {
  lastSyncAt?: string;
  syncStatus: SyncStatus;
  pendingChanges: number;
  lastError?: string;
  remoteUrl?: string;
  localPath?: string;
}

export interface SyncResult {
  success: boolean;
  changesUploaded: number;
  changesDownloaded: number;
  durationMs: number;
  error?: string;
}

// ============================================================================
// MULTI-TENANCY
// ============================================================================

export interface Workspace {
  workspaceId: string;
  organization: string;
  name?: string;
  createdAt: string;
  settings: WorkspaceSettings;
  
  // Database info (from Turso API)
  databaseUrl?: string;
  databaseName?: string;
  region?: string;
}

export interface WorkspaceSettings {
  /** Max agents allowed */
  maxAgents?: number;
  /** Max concurrent tasks */
  maxConcurrentTasks?: number;
  /** Retention days for memories */
  memoryRetentionDays?: number;
  /** Retention days for messages */
  messageRetentionDays?: number;
  /** Enable quality gates */
  qualityGatesEnabled?: boolean;
  /** Custom embedding model */
  embeddingModel?: string;
}

export interface WorkspaceCreate {
  workspaceId: string;
  organization: string;
  name?: string;
  settings?: Partial<WorkspaceSettings>;
  /** Turso region for database (default: closest) */
  region?: string;
}

// ============================================================================
// BATCH OPERATIONS (Concurrency)
// ============================================================================

export interface BatchOperation {
  sql: string;
  args?: unknown[];
}

export interface BatchResult {
  success: boolean;
  results: Array<{
    rowsAffected: number;
    lastInsertRowid?: number;
  }>;
  error?: string;
}

// ============================================================================
// EXTENDED TASK (with branch support)
// ============================================================================

export interface TaskWithBranch {
  id: string;
  title: string;
  branchId?: string;
  parentTaskId?: string;
  // ... other task fields inherited from base Task type
}

// ============================================================================
// QUALITY (Extended)
// ============================================================================

export interface QualitySnapshotWithBranch {
  id: string;
  taskId?: string;
  agentId?: string;
  branchId?: string;
  
  buildSuccess?: boolean;
  buildTimeMs?: number;
  typeErrors: number;
  lintErrors: number;
  lintWarnings: number;
  testsPassing: number;
  testsFailing: number;
  testsSkipped: number;
  testCoverage?: number;
  testTimeMs?: number;
  
  browserValidationPassed?: boolean;
  browserValidationErrors?: number;
  
  createdAt: string;
}

// ============================================================================
// EVENT TYPES (for real-time updates)
// ============================================================================

export type TursoEventType =
  | 'sync.started'
  | 'sync.completed'
  | 'sync.failed'
  | 'branch.created'
  | 'branch.switched'
  | 'branch.merged'
  | 'branch.deleted'
  | 'memory.created'
  | 'memory.accessed'
  | 'workspace.created'
  | 'workspace.deleted';

export interface TursoEvent {
  type: TursoEventType;
  timestamp: Date;
  data: unknown;
}
