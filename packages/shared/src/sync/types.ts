/**
 * Sync Types for Incremental Synchronization
 *
 * These types define the change tracking and sync version system
 * used for incremental sync between local and remote adapters.
 */

import { z } from 'zod';

/**
 * Entity types that support incremental sync
 */
export const SyncableEntityTypeSchema = z.enum([
  'task',
  'memory',
  'message',
  'plan',
]);
export type SyncableEntityType = z.infer<typeof SyncableEntityTypeSchema>;

// ============================================================================
// StateSync Configuration and State Types
// ============================================================================

/**
 * Configuration for StateSync bidirectional synchronization
 */
export interface StateSyncConfig {
  /** Edge worker URL endpoint for sync API */
  edgeUrl: string;
  /** API token for authentication (optional) */
  apiToken?: string;
  /** Client identifier for sync operations */
  clientId: string;
  /** Directory for sync state persistence */
  syncDir: string;
  /** Polling interval in milliseconds (default: 30000) */
  pollingIntervalMs?: number;
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Maximum retries for failed requests (default: 3) */
  maxRetries?: number;
  /** Enable automatic polling (default: false) */
  autoSync?: boolean;
  /** Batch size for push operations (default: 50) */
  batchSize?: number;
  /** Entity types to sync (default: all) */
  entityTypes?: SyncableEntityType[];
}

/**
 * Sync status for tracking synchronization state
 */
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

/**
 * Sync state tracking - persisted to track sync progress
 */
export interface SyncState {
  /** Last successful sync timestamp (null if never synced) */
  lastSyncAt: Date | null;
  /** Current sync status */
  status: SyncStatus;
  /** Last error message (null if no error) */
  lastError: string | null;
  /** Number of pending changes to push */
  pendingChanges: number;
  /** Track last sync time per entity type */
  entitySyncTimes: Record<SyncableEntityType, Date | null>;
}

/**
 * Request payload for pushing changes to edge
 */
export interface SyncPushRequest {
  clientId: string;
  changes: ChangeLogEntry[];
  lastSyncAt: Date | null;
}

/**
 * Response from edge after push
 */
export interface SyncPushResponse {
  success: boolean;
  accepted: string[];
  rejected: Array<{
    id: string;
    reason: string;
    conflict?: ChangeLogEntry;
  }>;
  serverTimestamp: Date;
}

/**
 * Request payload for pulling changes from edge
 */
export interface SyncPullRequest {
  clientId: string;
  lastSyncAt: Date | null;
  entityTypes?: SyncableEntityType[];
  sinceVersion?: number;
  limit?: number;
}

/**
 * Response from edge with changes to pull
 */
export interface SyncPullResponse {
  changes: ChangeLogEntry[];
  hasMore: boolean;
  serverTimestamp: Date;
  latestVersion: number;
  nextCursor?: string;
}

/**
 * Events emitted by StateSync
 */
export type StateSyncEventType =
  | 'sync:start'
  | 'sync:complete'
  | 'sync:error'
  | 'sync:conflict'
  | 'sync:offline'
  | 'sync:online'
  | 'push:complete'
  | 'pull:complete';

export interface StateSyncEvent {
  type: StateSyncEventType;
  timestamp: Date;
  data?: unknown;
}

/**
 * Result of a full sync operation (push + pull)
 */
export interface FullSyncResult {
  pushResult: {
    pushed: number;
    accepted: number;
    rejected: number;
  };
  pullResult: {
    pulled: number;
    applied: number;
    conflicts: number;
  };
  duration: number;
  newSyncTimestamp: Date;
}

/**
 * Types of change operations tracked
 */
export const ChangeOperationSchema = z.enum(['create', 'update', 'delete']);
export type ChangeOperation = z.infer<typeof ChangeOperationSchema>;

/**
 * A single change log entry recording a modification to an entity
 */
export const ChangeLogEntrySchema = z.object({
  id: z.string(),
  entityType: SyncableEntityTypeSchema,
  entityId: z.string(),
  operation: ChangeOperationSchema,
  syncVersion: z.number(),
  timestamp: z.number(), // Unix timestamp in milliseconds
  payload: z.record(z.unknown()).optional(), // For create/update, contains the entity data
});
export type ChangeLogEntry = z.infer<typeof ChangeLogEntrySchema>;

/**
 * Sync metadata for tracking synchronization state
 */
export const SyncMetadataSchema = z.object({
  lastSyncVersion: z.number(),
  lastSyncTimestamp: z.number(),
  deviceId: z.string().optional(),
});
export type SyncMetadata = z.infer<typeof SyncMetadataSchema>;

/**
 * Configuration for the ChangeTracker
 */
export interface ChangeTrackerConfig {
  /** Directory to store the change log database */
  syncDir: string;
  /** Maximum number of change entries to keep (for compaction) */
  maxEntries?: number;
  /** Device/instance identifier for multi-device sync */
  deviceId?: string;
}

/**
 * Options for querying changes
 */
export interface GetChangesOptions {
  /** Only include changes after this sync version */
  sinceVersion?: number;
  /** Only include changes of these entity types */
  entityTypes?: SyncableEntityType[];
  /** Maximum number of changes to return */
  limit?: number;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  /** Number of changes applied */
  appliedCount: number;
  /** New sync version after applying changes */
  newSyncVersion: number;
  /** Whether there are more changes to sync */
  hasMore: boolean;
  /** IDs of entities that had conflicts */
  conflictIds?: string[];
}

/**
 * Interface for syncable entities
 * Entities must have a syncVersion field for incremental sync
 */
export interface Syncable {
  syncVersion?: number;
}

/**
 * Statistics about the change log
 */
export interface ChangeLogStats {
  totalEntries: number;
  byEntityType: Record<SyncableEntityType, number>;
  byOperation: Record<ChangeOperation, number>;
  oldestEntry: number | null;
  newestEntry: number | null;
  currentSyncVersion: number;
}
