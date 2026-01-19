/**
 * StateSync - Bidirectional State Synchronization
 *
 * Provides bidirectional sync between local adapters and edge services:
 * - pushToEdge(localChanges) - Push local changes to edge
 * - pullFromEdge() - Pull changes from edge
 * - HTTP polling approach with configurable intervals
 * - Tracks sync timestamps with lastSyncAt field
 * - Supports syncing tasks, memories, and messages
 *
 * Uses existing utilities:
 * - ConflictResolver for handling merge conflicts
 * - OfflineQueue for offline support
 *
 * @see docs/HYBRID_ARCHITECTURE.md
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/logger';
import { ConflictResolver } from './ConflictResolver';
import { OfflineQueue, QueuedChange } from './OfflineQueue';
import {
  StateSyncConfig,
  SyncState,
  SyncableEntityType,
  ChangeLogEntry,
  SyncPushRequest,
  SyncPushResponse,
  SyncPullRequest,
  SyncPullResponse,
  FullSyncResult,
} from './types';

// Default configuration values
const DEFAULT_POLLING_INTERVAL_MS = 30000;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BATCH_SIZE = 50;

/**
 * Events emitted by StateSync
 */
export interface StateSyncEvents {
  'sync:start': () => void;
  'sync:complete': (result: FullSyncResult) => void;
  'sync:error': (error: Error) => void;
  'sync:conflict': (conflicts: Array<{ local: unknown; remote: unknown }>) => void;
  'sync:offline': () => void;
  'sync:online': () => void;
  'push:complete': (stats: { pushed: number; accepted: number; rejected: number }) => void;
  'pull:complete': (stats: { pulled: number; applied: number; conflicts: number }) => void;
}

/**
 * Type-safe event emitter interface
 */
export interface TypedStateSyncEmitter {
  on<K extends keyof StateSyncEvents>(event: K, listener: StateSyncEvents[K]): this;
  off<K extends keyof StateSyncEvents>(event: K, listener: StateSyncEvents[K]): this;
  emit<K extends keyof StateSyncEvents>(
    event: K,
    ...args: Parameters<StateSyncEvents[K]>
  ): boolean;
}

/**
 * Interface for syncable adapters that StateSync can coordinate with
 */
export interface ISyncableAdapter {
  /** Get local changes since the given timestamp/version */
  getChangesSince(since: Date | null, limit?: number): Promise<ChangeLogEntry[]>;
  /** Apply remote changes locally */
  applyChanges(changes: ChangeLogEntry[]): Promise<{ applied: number; conflicts: number }>;
  /** Mark entities as synced */
  markSynced?(entityIds: string[], timestamp: Date): Promise<void>;
}

/**
 * StateSync - Main class for bidirectional synchronization
 *
 * @example
 * ```typescript
 * const stateSync = new StateSync({
 *   edgeUrl: 'https://api.jetpack.workers.dev/sync',
 *   clientId: 'agent-1',
 *   syncDir: '.jetpack/sync',
 * });
 *
 * await stateSync.initialize();
 *
 * // Register adapters for each entity type
 * stateSync.registerAdapter('task', taskAdapter);
 * stateSync.registerAdapter('memory', memoryAdapter);
 *
 * // Manual sync
 * const result = await stateSync.sync();
 *
 * // Or enable auto-sync
 * stateSync.startAutoSync();
 * ```
 */
export class StateSync extends EventEmitter implements TypedStateSyncEmitter {
  private logger: Logger;
  private config: Required<StateSyncConfig>;
  private state: SyncState;
  private statePath: string;
  private offlineQueue: OfflineQueue;
  private adapters: Map<SyncableEntityType, ISyncableAdapter> = new Map();
  private conflictResolvers: Map<SyncableEntityType, ConflictResolver> = new Map();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;
  private isInitialized = false;

  constructor(config: StateSyncConfig) {
    super();
    this.logger = new Logger('StateSync');

    // Apply defaults
    this.config = {
      edgeUrl: config.edgeUrl,
      apiToken: config.apiToken ?? '',
      clientId: config.clientId,
      syncDir: config.syncDir,
      pollingIntervalMs: config.pollingIntervalMs ?? DEFAULT_POLLING_INTERVAL_MS,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
      autoSync: config.autoSync ?? false,
      batchSize: config.batchSize ?? DEFAULT_BATCH_SIZE,
      entityTypes: config.entityTypes ?? ['task', 'memory', 'message'],
    };

    this.statePath = path.join(config.syncDir, 'sync-state.json');

    // Initialize state
    this.state = {
      lastSyncAt: null,
      status: 'idle',
      lastError: null,
      pendingChanges: 0,
      entitySyncTimes: {
        task: null,
        memory: null,
        message: null,
        plan: null,
      },
    };

    // Initialize offline queue
    this.offlineQueue = new OfflineQueue({
      syncDir: config.syncDir,
      edgeUrl: config.edgeUrl,
    });

    // Initialize conflict resolvers for each entity type
    for (const entityType of this.config.entityTypes) {
      this.conflictResolvers.set(entityType, new ConflictResolver(entityType));
    }
  }

  /**
   * Initialize the StateSync system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.debug('StateSync already initialized');
      return;
    }

    this.logger.info('Initializing StateSync');

    // Ensure sync directory exists
    if (!fs.existsSync(this.config.syncDir)) {
      fs.mkdirSync(this.config.syncDir, { recursive: true });
    }

    // Load persisted state
    await this.loadState();

    // Initialize offline queue
    await this.offlineQueue.initialize();

    // Set up offline queue sync handler
    this.offlineQueue.setSyncHandler(async (change: QueuedChange) => {
      await this.processSingleChange(change);
    });

    // Forward offline/online events
    this.offlineQueue.on('offline', () => {
      this.state.status = 'offline';
      this.emit('sync:offline');
    });

    this.offlineQueue.on('online', () => {
      this.state.status = 'idle';
      this.emit('sync:online');
    });

    this.isInitialized = true;

    // Start auto-sync if configured
    if (this.config.autoSync) {
      this.startAutoSync();
    }

    this.logger.info('StateSync initialized');
  }

  /**
   * Register an adapter for a specific entity type
   */
  registerAdapter(entityType: SyncableEntityType, adapter: ISyncableAdapter): void {
    this.adapters.set(entityType, adapter);
    this.logger.debug(`Registered adapter for ${entityType}`);
  }

  /**
   * Get the current sync state
   */
  getState(): SyncState {
    return { ...this.state };
  }

  /**
   * Get the last sync timestamp
   */
  get lastSyncAt(): Date | null {
    return this.state.lastSyncAt;
  }

  /**
   * Check if currently syncing
   */
  get syncing(): boolean {
    return this.isSyncing;
  }

  /**
   * Push local changes to edge
   *
   * Collects changes from all registered adapters since lastSyncAt
   * and pushes them to the edge service.
   *
   * @param localChanges - Optional explicit changes to push (overrides adapter collection)
   * @returns Push result with accepted/rejected counts
   */
  async pushToEdge(localChanges?: ChangeLogEntry[]): Promise<{
    pushed: number;
    accepted: number;
    rejected: number;
  }> {
    this.logger.debug('Starting pushToEdge');

    // Collect changes from adapters if not provided
    let changes: ChangeLogEntry[] = localChanges ?? [];
    if (!localChanges) {
      changes = await this.collectLocalChanges();
    }

    if (changes.length === 0) {
      this.logger.debug('No changes to push');
      return { pushed: 0, accepted: 0, rejected: 0 };
    }

    this.logger.info(`Pushing ${changes.length} changes to edge`);

    // Batch changes if needed
    const batches = this.batchChanges(changes, this.config.batchSize);
    let totalAccepted = 0;
    let totalRejected = 0;

    for (const batch of batches) {
      try {
        const response = await this.sendPushRequest(batch);

        if (response.success) {
          totalAccepted += response.accepted.length;
          totalRejected += response.rejected.length;

          // Handle conflicts
          if (response.rejected.length > 0) {
            await this.handlePushConflicts(response.rejected);
          }
        } else {
          // Queue for later if offline
          await this.queueForOffline(batch);
          totalRejected += batch.length;
        }
      } catch (error) {
        this.logger.warn('Push failed, queueing for offline:', error);
        await this.queueForOffline(batch);
        totalRejected += batch.length;
      }
    }

    const result = {
      pushed: changes.length,
      accepted: totalAccepted,
      rejected: totalRejected,
    };

    this.emit('push:complete', result);
    return result;
  }

  /**
   * Pull changes from edge
   *
   * Fetches changes from edge since lastSyncAt and applies them
   * to registered adapters.
   *
   * @returns Pull result with applied/conflict counts
   */
  async pullFromEdge(): Promise<{
    pulled: number;
    applied: number;
    conflicts: number;
  }> {
    this.logger.debug('Starting pullFromEdge');

    let totalPulled = 0;
    let totalApplied = 0;
    let totalConflicts = 0;

    try {
      let hasMore = true;
      let cursor: string | undefined;

      while (hasMore) {
        const response = await this.sendPullRequest(cursor);

        if (response.changes.length === 0) {
          break;
        }

        totalPulled += response.changes.length;

        // Group changes by entity type
        const changesByType = this.groupChangesByType(response.changes);

        // Apply changes to each adapter
        for (const [entityType, entityChanges] of changesByType) {
          const adapter = this.adapters.get(entityType);
          if (!adapter) {
            this.logger.warn(`No adapter registered for ${entityType}, skipping ${entityChanges.length} changes`);
            continue;
          }

          const result = await adapter.applyChanges(entityChanges);
          totalApplied += result.applied;
          totalConflicts += result.conflicts;

          // Update entity sync time
          this.state.entitySyncTimes[entityType] = response.serverTimestamp;
        }

        hasMore = response.hasMore;
        cursor = response.nextCursor;
      }

      this.logger.info(`Pulled ${totalPulled} changes, applied ${totalApplied}, conflicts ${totalConflicts}`);
    } catch (error) {
      this.logger.error('Pull failed:', error);
      throw error;
    }

    const result = {
      pulled: totalPulled,
      applied: totalApplied,
      conflicts: totalConflicts,
    };

    this.emit('pull:complete', result);
    return result;
  }

  /**
   * Perform a full bidirectional sync (push + pull)
   *
   * @returns Full sync result
   */
  async sync(): Promise<FullSyncResult> {
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    if (!this.isInitialized) {
      throw new Error('StateSync not initialized. Call initialize() first.');
    }

    this.isSyncing = true;
    this.state.status = 'syncing';
    this.emit('sync:start');

    const startTime = Date.now();

    try {
      // Push first, then pull
      const pushResult = await this.pushToEdge();
      const pullResult = await this.pullFromEdge();

      const result: FullSyncResult = {
        pushResult,
        pullResult,
        duration: Date.now() - startTime,
        newSyncTimestamp: new Date(),
      };

      // Update state
      this.state.lastSyncAt = result.newSyncTimestamp;
      this.state.status = 'idle';
      this.state.lastError = null;
      await this.persistState();

      this.emit('sync:complete', result);
      this.logger.info(`Sync complete in ${result.duration}ms`);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.state.status = 'error';
      this.state.lastError = errorMessage;
      await this.persistState();

      this.emit('sync:error', error instanceof Error ? error : new Error(errorMessage));
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Start automatic polling for sync
   */
  startAutoSync(): void {
    if (this.pollTimer) {
      this.logger.debug('Auto-sync already running');
      return;
    }

    this.logger.info(`Starting auto-sync with interval ${this.config.pollingIntervalMs}ms`);

    this.pollTimer = setInterval(async () => {
      if (this.isSyncing) {
        this.logger.debug('Skipping auto-sync, sync already in progress');
        return;
      }

      try {
        await this.sync();
      } catch (error) {
        this.logger.error('Auto-sync failed:', error);
      }
    }, this.config.pollingIntervalMs);
  }

  /**
   * Stop automatic polling
   */
  stopAutoSync(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      this.logger.info('Auto-sync stopped');
    }
  }

  /**
   * Force an immediate sync attempt
   */
  async syncNow(): Promise<FullSyncResult> {
    return this.sync();
  }

  /**
   * Get pending changes count from offline queue
   */
  async getPendingChangesCount(): Promise<number> {
    return this.offlineQueue.getQueueSize();
  }

  /**
   * Close StateSync and clean up resources
   */
  async close(): Promise<void> {
    this.stopAutoSync();
    this.offlineQueue.close();
    await this.persistState();
    this.isInitialized = false;
    this.logger.info('StateSync closed');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Collect local changes from all registered adapters
   */
  private async collectLocalChanges(): Promise<ChangeLogEntry[]> {
    const allChanges: ChangeLogEntry[] = [];

    for (const entityType of this.config.entityTypes) {
      const adapter = this.adapters.get(entityType);
      if (!adapter) continue;

      try {
        const since = this.state.entitySyncTimes[entityType];
        const changes = await adapter.getChangesSince(since, this.config.batchSize);
        allChanges.push(...changes);
      } catch (error) {
        this.logger.error(`Failed to get changes for ${entityType}:`, error);
      }
    }

    return allChanges;
  }

  /**
   * Send push request to edge with retry logic
   */
  private async sendPushRequest(changes: ChangeLogEntry[]): Promise<SyncPushResponse> {
    const request: SyncPushRequest = {
      clientId: this.config.clientId,
      changes,
      lastSyncAt: this.state.lastSyncAt,
    };

    return this.fetchWithRetry<SyncPushResponse>(
      `${this.config.edgeUrl}/push`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(request, this.dateReplacer),
      }
    );
  }

  /**
   * Send pull request to edge with retry logic
   */
  private async sendPullRequest(cursor?: string): Promise<SyncPullResponse> {
    const request: SyncPullRequest = {
      clientId: this.config.clientId,
      lastSyncAt: this.state.lastSyncAt,
      entityTypes: this.config.entityTypes,
      limit: this.config.batchSize,
    };

    const url = new URL(`${this.config.edgeUrl}/pull`);
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    return this.fetchWithRetry<SyncPullResponse>(
      url.toString(),
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(request, this.dateReplacer),
      }
    );
  }

  /**
   * Fetch with retry logic and timeout
   */
  private async fetchWithRetry<T>(url: string, options: RequestInit): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        return this.parseResponse<T>(data);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (error instanceof Error && error.name === 'AbortError') {
          this.logger.warn(`Request timed out (attempt ${attempt + 1}/${this.config.maxRetries})`);
        } else {
          this.logger.warn(`Request failed (attempt ${attempt + 1}/${this.config.maxRetries}):`, error);
        }

        // Exponential backoff
        if (attempt < this.config.maxRetries - 1) {
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError ?? new Error('Request failed after all retries');
  }

  /**
   * Parse response and convert date strings to Date objects
   */
  private parseResponse<T>(data: unknown): T {
    if (typeof data !== 'object' || data === null) {
      return data as T;
    }

    // Parse serverTimestamp if present
    const obj = data as Record<string, unknown>;
    if (obj.serverTimestamp && typeof obj.serverTimestamp === 'string') {
      obj.serverTimestamp = new Date(obj.serverTimestamp);
    }

    // Parse changes array if present
    if (Array.isArray(obj.changes)) {
      obj.changes = obj.changes.map((change: Record<string, unknown>) => ({
        ...change,
        timestamp: change.timestamp ? new Date(change.timestamp as string) : undefined,
      }));
    }

    return obj as T;
  }

  /**
   * Get HTTP headers for requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Client-Id': this.config.clientId,
    };

    if (this.config.apiToken) {
      headers['Authorization'] = `Bearer ${this.config.apiToken}`;
    }

    return headers;
  }

  /**
   * Batch changes into smaller chunks
   */
  private batchChanges(changes: ChangeLogEntry[], batchSize: number): ChangeLogEntry[][] {
    const batches: ChangeLogEntry[][] = [];
    for (let i = 0; i < changes.length; i += batchSize) {
      batches.push(changes.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Group changes by entity type
   */
  private groupChangesByType(changes: ChangeLogEntry[]): Map<SyncableEntityType, ChangeLogEntry[]> {
    const groups = new Map<SyncableEntityType, ChangeLogEntry[]>();

    for (const change of changes) {
      const type = change.entityType as SyncableEntityType;
      if (!groups.has(type)) {
        groups.set(type, []);
      }
      groups.get(type)!.push(change);
    }

    return groups;
  }

  /**
   * Handle push conflicts
   */
  private async handlePushConflicts(
    rejected: Array<{ id: string; reason: string; conflict?: ChangeLogEntry }>
  ): Promise<void> {
    const conflicts: Array<{ local: unknown; remote: unknown }> = [];

    for (const rejection of rejected) {
      if (rejection.conflict) {
        this.logger.warn(`Conflict for ${rejection.id}: ${rejection.reason}`);
        conflicts.push({
          local: rejection.id,
          remote: rejection.conflict,
        });
      }
    }

    if (conflicts.length > 0) {
      this.emit('sync:conflict', conflicts);
    }
  }

  /**
   * Queue changes for offline processing
   */
  private async queueForOffline(changes: ChangeLogEntry[]): Promise<void> {
    for (const change of changes) {
      await this.offlineQueue.enqueue({
        operation: change.operation,
        resourceType: change.entityType,
        resourceId: change.entityId,
        payload: change.payload,
        maxAttempts: this.config.maxRetries,
      });
    }
  }

  /**
   * Process a single queued change
   */
  private async processSingleChange(queuedChange: QueuedChange): Promise<void> {
    const change: ChangeLogEntry = {
      id: queuedChange.id,
      entityType: queuedChange.resourceType as SyncableEntityType,
      entityId: queuedChange.resourceId,
      operation: queuedChange.operation,
      syncVersion: 0, // Will be assigned by edge
      timestamp: Date.now(),
      payload: queuedChange.payload as Record<string, unknown>,
    };

    await this.sendPushRequest([change]);
  }

  /**
   * Load persisted sync state
   */
  private async loadState(): Promise<void> {
    try {
      if (fs.existsSync(this.statePath)) {
        const data = fs.readFileSync(this.statePath, 'utf-8');
        const parsed = JSON.parse(data);

        this.state = {
          lastSyncAt: parsed.lastSyncAt ? new Date(parsed.lastSyncAt) : null,
          status: 'idle', // Always start as idle
          lastError: parsed.lastError ?? null,
          pendingChanges: parsed.pendingChanges ?? 0,
          entitySyncTimes: this.parseEntitySyncTimes(parsed.entitySyncTimes),
        };

        this.logger.debug('Loaded sync state from disk');
      }
    } catch (error) {
      this.logger.warn('Failed to load sync state:', error);
    }
  }

  /**
   * Parse entity sync times from persisted data
   */
  private parseEntitySyncTimes(
    data: Record<string, string | null> | undefined
  ): Record<SyncableEntityType, Date | null> {
    const result: Record<SyncableEntityType, Date | null> = {
      task: null,
      memory: null,
      message: null,
      plan: null,
    };

    if (data) {
      for (const [key, value] of Object.entries(data)) {
        if (key in result && value) {
          result[key as SyncableEntityType] = new Date(value);
        }
      }
    }

    return result;
  }

  /**
   * Persist sync state to disk
   */
  private async persistState(): Promise<void> {
    try {
      const data = JSON.stringify(this.state, this.dateReplacer, 2);
      fs.writeFileSync(this.statePath, data, 'utf-8');
    } catch (error) {
      this.logger.warn('Failed to persist sync state:', error);
    }
  }

  /**
   * JSON replacer for Date serialization
   */
  private dateReplacer(_key: string, value: unknown): unknown {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a StateSync instance with default configuration
 */
export function createStateSync(config: StateSyncConfig): StateSync {
  return new StateSync(config);
}
