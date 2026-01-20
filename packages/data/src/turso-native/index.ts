/**
 * Turso-Native Module
 *
 * This module provides a data layer that properly leverages Turso's advanced features:
 * - Native vector search (replaces CASS)
 * - Embedded replicas for offline-first operation
 * - Database branching for task versioning
 * - Multi-tenancy workspace management
 * - Better concurrency with batch operations
 */

// Main data layer
export { TursoNativeDataLayer } from './TursoNativeDataLayer.js';

// Operation interfaces
export type {
  MemoryOperations,
  BranchOperations,
  SyncOperations,
} from './TursoNativeDataLayer.js';

// Multi-tenancy helpers
export {
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
} from './TursoNativeDataLayer.js';

// Types
export type {
  TursoNativeConfig,
  Memory,
  MemoryCreate,
  MemoryFilter,
  MemoryType,
  VectorSearchOptions,
  VectorSearchResult,
  Branch,
  BranchCreate,
  BranchMergeResult,
  BranchStatus,
  SyncMetadata,
  SyncResult,
  SyncStatus,
  Workspace,
  WorkspaceCreate,
  WorkspaceSettings,
  BatchOperation,
  BatchResult,
  TaskWithBranch,
  QualitySnapshotWithBranch,
  TursoEvent,
  TursoEventType,
} from './types.js';

// Schema (for reference/debugging)
export { TURSO_NATIVE_SCHEMA } from './schema.js';
