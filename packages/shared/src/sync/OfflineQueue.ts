/**
 * OfflineQueue - Queue changes when edge is unavailable
 *
 * This class provides offline support for StateSync by:
 * - Queueing changes when edge is unavailable (network errors, timeouts)
 * - Persisting queue to local SQLite
 * - Retrying with exponential backoff
 * - Processing queue when connection restored
 * - Emitting events: offline, online, queueProcessed
 *
 * @see docs/HYBRID_ARCHITECTURE.md
 */

import { EventEmitter } from 'events';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { Logger } from '../utils/logger';
import { ChangeOperation } from './types';

/**
 * Status of a queued change
 */
export type QueuedChangeStatus = 'pending' | 'processing' | 'failed' | 'completed';

/**
 * A queued change entry
 */
export interface QueuedChange {
  id: string;
  operation: ChangeOperation;
  resourceType: string;
  resourceId: string;
  payload: unknown;
  status: QueuedChangeStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  lastAttemptAt: Date | null;
  nextRetryAt: Date | null;
  error: string | null;
}

/**
 * Input for creating a queued change
 */
export type QueuedChangeInput = Omit<
  QueuedChange,
  'id' | 'status' | 'attempts' | 'createdAt' | 'lastAttemptAt' | 'nextRetryAt' | 'error'
>;

/**
 * Configuration for OfflineQueue
 */
export interface OfflineQueueConfig {
  /** Directory for SQLite database */
  syncDir: string;
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in ms for exponential backoff (default: 60000) */
  maxDelayMs?: number;
  /** Maximum retry attempts per change (default: 5) */
  maxAttempts?: number;
  /** Health check interval in ms (default: 30000) */
  healthCheckIntervalMs?: number;
  /** Edge URL for health checks */
  edgeUrl?: string;
  /** Timeout for health check requests in ms (default: 5000) */
  healthCheckTimeoutMs?: number;
}

/**
 * Statistics about the offline queue
 */
export interface OfflineQueueStats {
  total: number;
  pending: number;
  processing: number;
  failed: number;
  completed: number;
  byResourceType: Record<string, number>;
}

/**
 * Events emitted by OfflineQueue
 */
export interface OfflineQueueEvents {
  /** Emitted when connection to edge is lost */
  offline: () => void;
  /** Emitted when connection to edge is restored */
  online: () => void;
  /** Emitted when a batch of queued changes has been processed */
  queueProcessed: (stats: { processed: number; failed: number; remaining: number }) => void;
  /** Emitted when a single change is successfully synced */
  changeSynced: (change: QueuedChange) => void;
  /** Emitted when a change fails to sync */
  changeFailed: (change: QueuedChange, error: Error) => void;
}

/**
 * Type-safe event emitter for OfflineQueue
 */
export interface TypedEventEmitter {
  on<K extends keyof OfflineQueueEvents>(event: K, listener: OfflineQueueEvents[K]): this;
  off<K extends keyof OfflineQueueEvents>(event: K, listener: OfflineQueueEvents[K]): this;
  emit<K extends keyof OfflineQueueEvents>(
    event: K,
    ...args: Parameters<OfflineQueueEvents[K]>
  ): boolean;
}

/**
 * Sync handler function type
 */
export type SyncHandler = (change: QueuedChange) => Promise<void>;

/**
 * OfflineQueue - Manages offline change queue with SQLite persistence
 */
export class OfflineQueue extends EventEmitter implements TypedEventEmitter {
  private db!: Database.Database;
  private logger: Logger;
  private dbPath: string;
  private config: Required<OfflineQueueConfig>;
  private isOnlineState = true;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private processingTimer: ReturnType<typeof setTimeout> | null = null;
  private syncHandler: SyncHandler | null = null;
  private isProcessing = false;

  constructor(config: OfflineQueueConfig) {
    super();
    this.logger = new Logger('OfflineQueue');
    this.dbPath = path.join(config.syncDir, 'offline-queue.db');

    // Apply defaults
    this.config = {
      syncDir: config.syncDir,
      baseDelayMs: config.baseDelayMs ?? 1000,
      maxDelayMs: config.maxDelayMs ?? 60000,
      maxAttempts: config.maxAttempts ?? 5,
      healthCheckIntervalMs: config.healthCheckIntervalMs ?? 30000,
      edgeUrl: config.edgeUrl ?? '',
      healthCheckTimeoutMs: config.healthCheckTimeoutMs ?? 5000,
    };
  }

  /**
   * Initialize the offline queue
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing offline queue');

    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);

    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS queue (
        id TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        payload TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        created_at INTEGER NOT NULL,
        last_attempt_at INTEGER,
        next_retry_at INTEGER,
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_status ON queue(status);
      CREATE INDEX IF NOT EXISTS idx_next_retry ON queue(next_retry_at);
      CREATE INDEX IF NOT EXISTS idx_resource_type ON queue(resource_type);
      CREATE INDEX IF NOT EXISTS idx_created_at ON queue(created_at);
    `);

    // Start health check if edge URL is configured
    if (this.config.edgeUrl) {
      this.startHealthCheck();
    }

    this.logger.info('Offline queue initialized');
  }

  /**
   * Set the sync handler for processing queued changes
   */
  setSyncHandler(handler: SyncHandler): void {
    this.syncHandler = handler;
  }

  /**
   * Enqueue a change for later sync
   */
  async enqueue(input: QueuedChangeInput): Promise<QueuedChange> {
    const id = this.generateId();
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO queue (
        id, operation, resource_type, resource_id, payload,
        status, attempts, max_attempts, created_at
      )
      VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)
    `);

    stmt.run(
      id,
      input.operation,
      input.resourceType,
      input.resourceId,
      JSON.stringify(input.payload),
      input.maxAttempts,
      now
    );

    const change = this.getChange(id);
    if (!change) {
      throw new Error('Failed to enqueue change');
    }

    this.logger.debug(`Enqueued change: ${id} (${input.operation} ${input.resourceType}/${input.resourceId})`);

    // If we're online, schedule processing
    if (this.isOnlineState && !this.isProcessing) {
      this.scheduleProcessing(0);
    }

    return change;
  }

  /**
   * Get a change by ID
   */
  getChange(id: string): QueuedChange | null {
    const stmt = this.db.prepare('SELECT * FROM queue WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToQueuedChange(row) : null;
  }

  /**
   * Get all pending changes ready for retry
   */
  getPendingChanges(limit = 10): QueuedChange[] {
    const now = Date.now();
    const stmt = this.db.prepare(`
      SELECT * FROM queue
      WHERE status = 'pending'
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
      ORDER BY created_at ASC
      LIMIT ?
    `);

    const rows = stmt.all(now, limit) as Record<string, unknown>[];
    return rows.map((row) => this.rowToQueuedChange(row));
  }

  /**
   * Get all failed changes
   */
  getFailedChanges(limit = 50): QueuedChange[] {
    const stmt = this.db.prepare(`
      SELECT * FROM queue
      WHERE status = 'failed'
      ORDER BY created_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as Record<string, unknown>[];
    return rows.map((row) => this.rowToQueuedChange(row));
  }

  /**
   * Mark a change as processing
   */
  private markProcessing(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE queue
      SET status = 'processing', last_attempt_at = ?
      WHERE id = ?
    `);
    stmt.run(Date.now(), id);
  }

  /**
   * Mark a change as completed (remove from queue)
   */
  private markCompleted(id: string): void {
    const stmt = this.db.prepare('DELETE FROM queue WHERE id = ?');
    stmt.run(id);
    this.logger.debug(`Change completed and removed: ${id}`);
  }

  /**
   * Mark a change as failed with retry scheduling
   */
  private markFailed(id: string, error: string): void {
    const change = this.getChange(id);
    if (!change) return;

    const newAttempts = change.attempts + 1;
    const isFinalFailure = newAttempts >= change.maxAttempts;

    if (isFinalFailure) {
      // Final failure - mark as failed permanently
      const stmt = this.db.prepare(`
        UPDATE queue
        SET status = 'failed', attempts = ?, error = ?, last_attempt_at = ?
        WHERE id = ?
      `);
      stmt.run(newAttempts, error, Date.now(), id);
      this.logger.warn(`Change permanently failed after ${newAttempts} attempts: ${id}`);
    } else {
      // Schedule retry with exponential backoff
      const delay = this.calculateBackoff(newAttempts);
      const nextRetryAt = Date.now() + delay;

      const stmt = this.db.prepare(`
        UPDATE queue
        SET status = 'pending', attempts = ?, error = ?,
            last_attempt_at = ?, next_retry_at = ?
        WHERE id = ?
      `);
      stmt.run(newAttempts, error, Date.now(), nextRetryAt, id);
      this.logger.debug(`Change scheduled for retry in ${delay}ms: ${id} (attempt ${newAttempts}/${change.maxAttempts})`);
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(attempt: number): number {
    // Exponential backoff with jitter: baseDelay * 2^attempt + random(0, baseDelay)
    const exponentialDelay = this.config.baseDelayMs * Math.pow(2, attempt - 1);
    const jitter = Math.random() * this.config.baseDelayMs;
    return Math.min(exponentialDelay + jitter, this.config.maxDelayMs);
  }

  /**
   * Process pending changes in the queue
   */
  async processQueue(): Promise<{ processed: number; failed: number; remaining: number }> {
    if (!this.syncHandler) {
      this.logger.warn('No sync handler configured, skipping queue processing');
      return { processed: 0, failed: 0, remaining: this.getQueueSize() };
    }

    if (!this.isOnlineState) {
      this.logger.debug('Offline, skipping queue processing');
      return { processed: 0, failed: 0, remaining: this.getQueueSize() };
    }

    if (this.isProcessing) {
      this.logger.debug('Already processing, skipping');
      return { processed: 0, failed: 0, remaining: this.getQueueSize() };
    }

    this.isProcessing = true;
    let processed = 0;
    let failed = 0;

    try {
      const changes = this.getPendingChanges();

      for (const change of changes) {
        if (!this.isOnlineState) {
          this.logger.debug('Went offline during processing, stopping');
          break;
        }

        this.markProcessing(change.id);

        try {
          await this.syncHandler(change);
          this.markCompleted(change.id);
          processed++;
          this.emit('changeSynced', this.getChange(change.id) ?? change);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.markFailed(change.id, errorMessage);
          failed++;

          const updatedChange = this.getChange(change.id);
          if (updatedChange) {
            this.emit('changeFailed', updatedChange, error instanceof Error ? error : new Error(errorMessage));
          }

          // If we get a network error, go offline
          if (this.isNetworkError(error)) {
            this.setOffline();
            break;
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }

    const remaining = this.getQueueSize();
    const stats = { processed, failed, remaining };

    if (processed > 0 || failed > 0) {
      this.emit('queueProcessed', stats);
      this.logger.info(`Queue processed: ${processed} synced, ${failed} failed, ${remaining} remaining`);
    }

    // Schedule next processing if there are remaining items
    if (remaining > 0 && this.isOnlineState) {
      const nextChange = this.getPendingChanges(1)[0];
      if (nextChange?.nextRetryAt) {
        const delay = Math.max(0, nextChange.nextRetryAt.getTime() - Date.now());
        this.scheduleProcessing(delay);
      }
    }

    return stats;
  }

  /**
   * Schedule queue processing after a delay
   */
  private scheduleProcessing(delayMs: number): void {
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
    }

    this.processingTimer = setTimeout(() => {
      this.processQueue().catch((error) => {
        this.logger.error('Error processing queue:', error);
      });
    }, delayMs);
  }

  /**
   * Check if an error is a network error
   */
  private isNetworkError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('fetch failed') ||
        message.includes('connection') ||
        error.name === 'AbortError'
      );
    }
    return false;
  }

  /**
   * Check if the edge is online
   */
  async isOnline(): Promise<boolean> {
    if (!this.config.edgeUrl) {
      // If no edge URL configured, assume online
      return true;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.healthCheckTimeoutMs);

      const response = await fetch(this.config.edgeUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get the current online state (cached)
   */
  get online(): boolean {
    return this.isOnlineState;
  }

  /**
   * Set the queue to offline mode
   */
  setOffline(): void {
    if (this.isOnlineState) {
      this.isOnlineState = false;
      this.logger.warn('Connection lost, switching to offline mode');
      this.emit('offline');
    }
  }

  /**
   * Set the queue to online mode and process pending changes
   */
  setOnline(): void {
    if (!this.isOnlineState) {
      this.isOnlineState = true;
      this.logger.info('Connection restored, switching to online mode');
      this.emit('online');

      // Process queue immediately
      this.scheduleProcessing(0);
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      const wasOnline = this.isOnlineState;
      const nowOnline = await this.isOnline();

      if (wasOnline && !nowOnline) {
        this.setOffline();
      } else if (!wasOnline && nowOnline) {
        this.setOnline();
      }
    }, this.config.healthCheckIntervalMs);

    this.logger.debug(`Health check started (interval: ${this.config.healthCheckIntervalMs}ms)`);
  }

  /**
   * Stop periodic health checks
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<OfflineQueueStats> {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM queue');
    const total = (totalStmt.get() as { count: number }).count;

    const byStatusStmt = this.db.prepare('SELECT status, COUNT(*) as count FROM queue GROUP BY status');
    const byStatusRows = byStatusStmt.all() as Array<{ status: QueuedChangeStatus; count: number }>;
    const byStatus: Record<QueuedChangeStatus, number> = {
      pending: 0,
      processing: 0,
      failed: 0,
      completed: 0,
    };
    for (const row of byStatusRows) {
      byStatus[row.status] = row.count;
    }

    const byTypeStmt = this.db.prepare('SELECT resource_type, COUNT(*) as count FROM queue GROUP BY resource_type');
    const byTypeRows = byTypeStmt.all() as Array<{ resource_type: string; count: number }>;
    const byResourceType: Record<string, number> = {};
    for (const row of byTypeRows) {
      byResourceType[row.resource_type] = row.count;
    }

    return {
      total,
      ...byStatus,
      byResourceType,
    };
  }

  /**
   * Get the number of items in the queue (pending or processing)
   */
  getQueueSize(): number {
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM queue WHERE status IN (\'pending\', \'processing\')'
    );
    return (stmt.get() as { count: number }).count;
  }

  /**
   * Clear completed changes older than a certain age
   */
  clearCompleted(maxAgeMs = 24 * 60 * 60 * 1000): number {
    const threshold = Date.now() - maxAgeMs;
    const stmt = this.db.prepare(`
      DELETE FROM queue
      WHERE status = 'completed' AND created_at < ?
    `);
    const result = stmt.run(threshold);
    return result.changes;
  }

  /**
   * Clear all failed changes
   */
  clearFailed(): number {
    const stmt = this.db.prepare('DELETE FROM queue WHERE status = \'failed\'');
    const result = stmt.run();
    return result.changes;
  }

  /**
   * Retry all failed changes (resets them to pending)
   */
  retryFailed(): number {
    const stmt = this.db.prepare(`
      UPDATE queue
      SET status = 'pending', attempts = 0, next_retry_at = NULL, error = NULL
      WHERE status = 'failed'
    `);
    const result = stmt.run();

    if (result.changes > 0 && this.isOnlineState) {
      this.scheduleProcessing(0);
    }

    return result.changes;
  }

  /**
   * Close the offline queue
   */
  close(): void {
    this.stopHealthCheck();

    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }

    if (this.db) {
      this.db.close();
      this.logger.info('Offline queue closed');
    }
  }

  private generateId(): string {
    return `oq-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  private rowToQueuedChange(row: Record<string, unknown>): QueuedChange {
    return {
      id: row.id as string,
      operation: row.operation as ChangeOperation,
      resourceType: row.resource_type as string,
      resourceId: row.resource_id as string,
      payload: row.payload ? JSON.parse(row.payload as string) : null,
      status: row.status as QueuedChangeStatus,
      attempts: row.attempts as number,
      maxAttempts: row.max_attempts as number,
      createdAt: new Date(row.created_at as number),
      lastAttemptAt: row.last_attempt_at ? new Date(row.last_attempt_at as number) : null,
      nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at as number) : null,
      error: row.error as string | null,
    };
  }
}
