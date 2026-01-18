/**
 * Adapter Interfaces for Hybrid Cloudflare Architecture
 *
 * These interfaces abstract the storage and messaging layer, enabling:
 * - Local SQLite/file-based adapters (current)
 * - Cloudflare D1/Durable Objects/Vectorize adapters (future)
 * - Mixed mode with some adapters local and others on edge
 *
 * @see docs/HYBRID_ARCHITECTURE.md for full architecture details
 */

import { Task, TaskStatus, TaskPriority } from '../types/task';
import { MemoryEntry, MemoryType } from '../types/memory';
import { Message, MessageType } from '../types/message';

// ============================================================================
// ITaskStore - Task storage and management abstraction
// ============================================================================

/**
 * Statistics about task storage
 */
export interface TaskStats {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
}

/**
 * Options for listing tasks
 */
export interface TaskListOptions {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  assignedAgent?: string;
  branch?: string;
  limit?: number;
  offset?: number;
}

/**
 * Task creation input (without auto-generated fields)
 */
export type TaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string; // Optional - will be generated if not provided
};

/**
 * Task update input (partial updates allowed)
 */
export type TaskUpdate = Partial<Omit<Task, 'id' | 'createdAt'>>;

/**
 * ITaskStore - Abstract interface for task storage
 *
 * Implementations:
 * - BeadsAdapter (local SQLite)
 * - CloudflareTaskStore (D1)
 */
export interface ITaskStore {
  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;

  // Core CRUD
  createTask(input: TaskInput): Promise<Task>;
  getTask(id: string): Promise<Task | null>;
  updateTask(id: string, updates: TaskUpdate): Promise<Task | null>;
  deleteTask(id: string): Promise<boolean>;

  // Queries
  listTasks(options?: TaskListOptions): Promise<Task[]>;
  getReadyTasks(): Promise<Task[]>;
  getTasksByStatus(status: TaskStatus): Promise<Task[]>;
  getTasksByAgent(agentId: string): Promise<Task[]>;

  // Atomic operations for multi-agent coordination
  /**
   * Atomically claim a task for an agent.
   * Returns the claimed task if successful, null if already claimed.
   */
  claimTask(taskId: string, agentId: string): Promise<Task | null>;

  /**
   * Release a task back to ready state.
   * Used when an agent stops or a task times out.
   */
  releaseTask(taskId: string): Promise<boolean>;

  // Sync (for adapters that support remote sync)
  sync?(): Promise<void>;

  // Statistics
  getStats(): Promise<TaskStats>;
}

// ============================================================================
// IMailBus - Messaging and coordination abstraction
// ============================================================================

/**
 * Message handler function type
 */
export type MessageHandler = (message: Message) => void | Promise<void>;

/**
 * File lease status
 */
export interface LeaseStatus {
  isLeased: boolean;
  agentId?: string;
  expiresAt?: number;
}

/**
 * IMailBus - Abstract interface for inter-agent messaging
 *
 * Implementations:
 * - MCPMailAdapter (local file-based pub/sub)
 * - CloudflareMailBus (Durable Objects WebSocket)
 */
export interface IMailBus {
  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;

  // Pub/Sub messaging
  /**
   * Publish a message to all subscribers of the message type
   */
  publish(message: Message): Promise<void>;

  /**
   * Subscribe to messages of a specific type
   */
  subscribe(type: MessageType, handler: MessageHandler): void;

  /**
   * Unsubscribe from messages of a specific type
   */
  unsubscribe(type: MessageType, handler: MessageHandler): void;

  // Direct messaging
  /**
   * Send a message directly to a specific agent
   */
  sendTo?(agentId: string, message: Message): Promise<void>;

  // Message acknowledgment
  /**
   * Acknowledge receipt of a message
   */
  acknowledge?(messageId: string, agentId: string): Promise<void>;

  // File locking for coordinated access
  /**
   * Acquire a lease on a file for exclusive access
   * @param file - File path to lock
   * @param ttlMs - Time-to-live in milliseconds
   * @returns true if lease acquired, false if already leased
   */
  acquireLease(file: string, ttlMs: number): Promise<boolean>;

  /**
   * Release a previously acquired lease
   */
  releaseLease(file: string): Promise<void>;

  /**
   * Check if a file is currently leased
   */
  isLeased(file: string): Promise<LeaseStatus>;

  // Heartbeat
  /**
   * Send a heartbeat to indicate agent is alive
   */
  sendHeartbeat(): Promise<void>;

  // Agent identity
  readonly agentId: string;
}

// ============================================================================
// IMemoryStore - Memory/knowledge storage abstraction
// ============================================================================

/**
 * Memory entry input (without auto-generated fields)
 */
export type MemoryInput = Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessed' | 'accessCount'>;

/**
 * Memory storage statistics
 */
export interface MemoryStats {
  total: number;
  byType: Record<MemoryType, number>;
  avgImportance: number;
  totalAccesses: number;
  withEmbedding?: number;
  withoutEmbedding?: number;
}

/**
 * Embedding generation result
 */
export interface EmbeddingResult {
  embedding: number[];
  tokensUsed: number;
}

/**
 * IMemoryStore - Abstract interface for memory/knowledge storage
 *
 * Implementations:
 * - CASSAdapter (local SQLite + optional embeddings)
 * - CloudflareMemoryStore (D1 + Vectorize)
 */
export interface IMemoryStore {
  // Lifecycle
  initialize(): Promise<void>;
  close(): void;

  // Core CRUD
  /**
   * Store a new memory entry
   * @returns The generated memory ID
   */
  store(entry: MemoryInput): Promise<string>;

  /**
   * Retrieve a memory by ID, updating access statistics
   */
  retrieve(id: string): Promise<MemoryEntry | null>;

  /**
   * Delete a memory entry
   */
  delete?(id: string): Promise<boolean>;

  // Text search
  /**
   * Search memories by text content
   */
  search(query: string, limit?: number): Promise<MemoryEntry[]>;

  // Semantic/vector search
  /**
   * Search memories by embedding similarity
   */
  semanticSearch(embedding: number[], limit?: number): Promise<MemoryEntry[]>;

  /**
   * Search memories using a text query (generates embedding internally)
   */
  semanticSearchByQuery(query: string, limit?: number): Promise<MemoryEntry[]>;

  // Maintenance
  /**
   * Remove memories below importance threshold
   * @returns Number of entries removed
   */
  compact(threshold: number): Promise<number>;

  /**
   * Adaptive compaction - remove bottom entries when at capacity
   * @returns Number of entries removed
   */
  adaptiveCompact(): Promise<number>;

  /**
   * Update the importance score of a memory
   */
  updateImportance(id: string, importance: number): Promise<void>;

  // Queries
  /**
   * Get memories by type
   */
  getByType(type: MemoryType, limit?: number): Promise<MemoryEntry[]>;

  /**
   * Get most recently created memories
   */
  getRecentMemories(limit?: number): Promise<MemoryEntry[]>;

  // Statistics
  getStats(): Promise<MemoryStats>;

  // Embedding support (optional)
  /**
   * Check if embedding generation is available
   */
  hasEmbeddingGenerator?(): boolean;

  /**
   * Get embedding statistics
   */
  getEmbeddingStats?(): Promise<{
    withEmbedding: number;
    withoutEmbedding: number;
    total: number;
  }>;

  /**
   * Backfill embeddings for entries that don't have them
   */
  backfillEmbeddings?(batchSize?: number): Promise<number>;
}

// ============================================================================
// Adapter Configuration Types
// ============================================================================

/**
 * Configuration for hybrid mode
 */
export interface HybridAdapterConfig {
  mode: 'local' | 'hybrid' | 'edge';

  // Cloudflare configuration (required for hybrid/edge)
  cloudflare?: {
    accountId: string;
    apiToken: string;
    workerUrl: string;
    d1DatabaseId?: string;
    vectorizeIndexName?: string;
  };

  // Override individual adapters in hybrid mode
  adapters?: {
    tasks?: 'local' | 'cloudflare';
    mail?: 'local' | 'cloudflare';
    memory?: 'local' | 'cloudflare';
  };
}

/**
 * Factory function type for creating adapters
 */
export type AdapterFactory<T> = (config: HybridAdapterConfig) => T;
