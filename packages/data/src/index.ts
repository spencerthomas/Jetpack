/**
 * @jetpack-agent/data
 *
 * Durable data layer for Jetpack Swarm with SQLite and Turso support.
 * Provides atomic operations for tasks, agents, messages, leases, and quality metrics.
 */

// Types
export type {
  Task,
  TaskCreate,
  TaskFilter,
  TaskProgress,
  TaskResult,
  TaskFailure,
  TaskStatus,
  TaskPriority,
  TaskType,
  TaskPhase,
  FailureType,
  Agent,
  AgentRegistration,
  AgentHeartbeat,
  AgentFilter,
  AgentType,
  AgentStatus,
  Message,
  MessageCreate,
  MessageFilter,
  MessageType,
  Lease,
  LeaseRequest,
  QualitySnapshot,
  QualitySnapshotCreate,
  QualityBaseline,
  Regression,
  SwarmStatus,
  SQLiteConfig,
  TursoConfig,
  TursoNativeConfigOptions,
  DataLayerConfig,
} from './types.js';

// Schemas (for validation)
export {
  TaskSchema,
  TaskStatus as TaskStatusEnum,
  TaskPriority as TaskPriorityEnum,
  TaskType as TaskTypeEnum,
  TaskPhase as TaskPhaseEnum,
  FailureType as FailureTypeEnum,
  AgentSchema,
  AgentType as AgentTypeEnum,
  AgentStatus as AgentStatusEnum,
  MessageSchema,
  MessageTypeEnum,
  LeaseSchema,
  QualitySnapshotSchema,
  QualityBaselineSchema,
} from './types.js';

// Interfaces
export type {
  DataLayer,
  TaskOperations,
  AgentOperations,
  MessageOperations,
  LeaseOperations,
  QualityOperations,
} from './DataLayer.js';

// Errors
export { DataLayerError, DataLayerErrorCodes } from './DataLayer.js';
export type { DataLayerErrorCode } from './DataLayer.js';

// Implementations
export { SQLiteDataLayer } from './SQLiteDataLayer.js';
export { TursoDataLayer } from './TursoDataLayer.js';

// Turso-Native (Full Turso Features)
export { TursoNativeDataLayer } from './turso-native/index.js';
export type {
  MemoryOperations,
  BranchOperations,
  SyncOperations,
} from './turso-native/index.js';
export {
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
} from './turso-native/index.js';
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
} from './turso-native/index.js';
export { TURSO_NATIVE_SCHEMA } from './turso-native/index.js';

// Factory function
import type { DataLayerConfig } from './types.js';
import type { DataLayer } from './DataLayer.js';
import { SQLiteDataLayer } from './SQLiteDataLayer.js';
import { TursoDataLayer } from './TursoDataLayer.js';
import { TursoNativeDataLayer as TursoNativeDataLayerClass } from './turso-native/TursoNativeDataLayer.js';

/**
 * Create a DataLayer instance based on configuration.
 *
 * @example
 * // Local SQLite
 * const db = await createDataLayer({
 *   type: 'sqlite',
 *   sqlite: { dbPath: '.swarm/data.db' }
 * });
 *
 * @example
 * // Cloud Turso (basic)
 * const db = await createDataLayer({
 *   type: 'turso',
 *   turso: {
 *     url: 'libsql://my-db.turso.io',
 *     authToken: process.env.TURSO_AUTH_TOKEN!
 *   }
 * });
 *
 * @example
 * // Turso Native (full features: vectors, branching, offline sync)
 * const db = await createDataLayer({
 *   type: 'turso-native',
 *   tursoNative: {
 *     url: 'libsql://my-db.turso.io',
 *     authToken: process.env.TURSO_AUTH_TOKEN!,
 *     enableEmbeddedReplica: true,
 *     localReplicaPath: '.turso/local.db',
 *     organization: 'my-org',
 *     workspaceId: 'my-workspace',
 *   }
 * });
 */
export async function createDataLayer(config: DataLayerConfig): Promise<DataLayer> {
  let dataLayer: DataLayer;

  if (config.type === 'sqlite') {
    if (!config.sqlite) {
      throw new Error('SQLite configuration required when type is "sqlite"');
    }
    dataLayer = new SQLiteDataLayer(config.sqlite);
  } else if (config.type === 'turso') {
    if (!config.turso) {
      throw new Error('Turso configuration required when type is "turso"');
    }
    dataLayer = new TursoDataLayer(config.turso);
  } else if (config.type === 'turso-native') {
    if (!config.tursoNative) {
      throw new Error('TursoNative configuration required when type is "turso-native"');
    }
    dataLayer = new TursoNativeDataLayerClass(config.tursoNative);
  } else {
    throw new Error(`Unknown data layer type: ${config.type}`);
  }

  // Initialize the database
  await dataLayer.initialize();

  return dataLayer;
}

/**
 * Create a local SQLite DataLayer with sensible defaults.
 *
 * @param dbPath Path to the SQLite database file
 * @param options Optional configuration
 */
export async function createLocalDataLayer(
  dbPath: string,
  options?: { walMode?: boolean; busyTimeout?: number }
): Promise<DataLayer> {
  return createDataLayer({
    type: 'sqlite',
    sqlite: {
      dbPath,
      walMode: options?.walMode ?? true,
      busyTimeout: options?.busyTimeout ?? 5000,
    },
  });
}

/**
 * Create a cloud Turso DataLayer.
 *
 * @param url Turso database URL (e.g., libsql://my-db.turso.io)
 * @param authToken Turso authentication token
 */
export async function createCloudDataLayer(url: string, authToken: string): Promise<DataLayer> {
  return createDataLayer({
    type: 'turso',
    turso: { url, authToken },
  });
}

/**
 * Create a Turso-Native DataLayer with full Turso features.
 *
 * This is the recommended approach for production use, providing:
 * - Native vector search (replaces CASS)
 * - Embedded replicas for offline-first operation
 * - Database branching for task versioning
 * - Multi-tenancy workspace support
 * - Better concurrency with batch operations
 *
 * @param url Turso database URL (e.g., libsql://my-db.turso.io)
 * @param authToken Turso authentication token
 * @param options Additional configuration options
 */
export async function createTursoNativeDataLayer(
  url: string,
  authToken: string,
  options?: {
    /** Enable offline-first with local replica */
    enableEmbeddedReplica?: boolean;
    /** Path for local replica database */
    localReplicaPath?: string;
    /** Sync interval in seconds */
    syncIntervalSeconds?: number;
    /** Organization for multi-tenancy */
    organization?: string;
    /** Workspace ID for multi-tenancy */
    workspaceId?: string;
    /** Platform API token for branching/workspace operations */
    platformApiToken?: string;
  }
): Promise<TursoNativeDataLayerClass> {
  const dataLayer = new TursoNativeDataLayerClass({
    url,
    authToken,
    ...options,
  });
  await dataLayer.initialize();
  return dataLayer;
}
