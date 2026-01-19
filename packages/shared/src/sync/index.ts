/**
 * Sync Module - Incremental Synchronization for Jetpack
 *
 * This module provides change tracking, offline support, and bidirectional sync
 * capabilities for syncing data between local and remote adapters.
 *
 * Key components:
 * - StateSync: Main class for bidirectional push/pull sync operations
 * - ChangeTracker: SQLite-based change log for recording entity modifications
 * - OfflineQueue: Queue for offline operations with exponential backoff
 * - ConflictResolver: Conflict resolution strategies (Last-Write-Wins)
 * - Types: Zod schemas and interfaces for sync-related data structures
 *
 * @example
 * ```typescript
 * import { StateSync, ChangeTracker } from '@jetpack-agent/shared';
 *
 * // Setup bidirectional sync
 * const stateSync = new StateSync({
 *   edgeUrl: 'https://api.jetpack.workers.dev/sync',
 *   clientId: 'agent-1',
 *   syncDir: '.jetpack/sync',
 * });
 * await stateSync.initialize();
 *
 * // Push local changes to edge
 * const pushResult = await stateSync.pushToEdge();
 *
 * // Pull changes from edge
 * const pullResult = await stateSync.pullFromEdge();
 *
 * // Or do a full bidirectional sync
 * const result = await stateSync.sync();
 * ```
 */

export * from './types';
export { StateSync, createStateSync, type ISyncableAdapter, type StateSyncEvents } from './StateSync';
export { ChangeTracker } from './ChangeTracker';
// OfflineQueue exports ChangeOperation which conflicts with types.ts
// Export named members to avoid ambiguity
export {
  OfflineQueue,
  type QueuedChangeStatus,
  type QueuedChange,
  type QueuedChangeInput,
  type OfflineQueueConfig,
  type OfflineQueueStats,
  type OfflineQueueEvents,
  type TypedEventEmitter,
  type SyncHandler,
  // Use ChangeOperation from types.ts, not OfflineQueue
} from './OfflineQueue';
export * from './ConflictResolver';
