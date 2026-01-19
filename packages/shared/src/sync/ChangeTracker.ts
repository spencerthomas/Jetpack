/**
 * ChangeTracker - Change Log Management for Incremental Sync
 *
 * Tracks all changes to syncable entities (tasks, memories, messages, plans)
 * in a SQLite database. This enables incremental sync by:
 *
 * 1. Recording every create/update/delete operation with a monotonic syncVersion
 * 2. Allowing queries for changes since a given syncVersion
 * 3. Compacting old entries after successful sync
 *
 * @see docs/HYBRID_ARCHITECTURE.md for sync architecture details
 */

import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import { Logger } from '../utils/logger';
import {
  ChangeTrackerConfig,
  ChangeLogEntry,
  ChangeOperation,
  SyncableEntityType,
  GetChangesOptions,
  ChangeLogStats,
  SyncMetadata,
} from './types';

export class ChangeTracker {
  private db!: Database.Database;
  private logger: Logger;
  private dbPath: string;
  private deviceId: string;
  private maxEntries: number;

  constructor(private config: ChangeTrackerConfig) {
    this.logger = new Logger('ChangeTracker');
    this.dbPath = path.join(config.syncDir, 'changelog.db');
    this.deviceId = config.deviceId ?? this.generateDeviceId();
    this.maxEntries = config.maxEntries ?? 10000;
  }

  /**
   * Initialize the change tracker database
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing ChangeTracker');

    // Ensure sync directory exists
    await fs.promises.mkdir(this.config.syncDir, { recursive: true });

    this.db = new Database(this.dbPath);

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');

    // Create tables
    this.db.exec(`
      -- Change log table for tracking all entity modifications
      CREATE TABLE IF NOT EXISTS change_log (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        sync_version INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        payload TEXT
      );

      -- Index for efficient queries by sync version
      CREATE INDEX IF NOT EXISTS idx_sync_version ON change_log(sync_version);

      -- Index for queries by entity
      CREATE INDEX IF NOT EXISTS idx_entity ON change_log(entity_type, entity_id);

      -- Index for timestamp-based queries
      CREATE INDEX IF NOT EXISTS idx_timestamp ON change_log(timestamp);

      -- Sync metadata table for tracking sync state
      CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Initialize current sync version if not exists
    const versionStmt = this.db.prepare(
      "SELECT value FROM sync_metadata WHERE key = 'current_sync_version'"
    );
    const currentVersion = versionStmt.get() as { value: string } | undefined;
    if (!currentVersion) {
      this.db.prepare("INSERT INTO sync_metadata (key, value) VALUES ('current_sync_version', '0')").run();
    }

    // Store device ID
    this.db
      .prepare("INSERT OR REPLACE INTO sync_metadata (key, value) VALUES ('device_id', ?)")
      .run(this.deviceId);

    this.logger.info(`ChangeTracker initialized with device ID: ${this.deviceId}`);
  }

  /**
   * Record a change to an entity
   *
   * @param entityType - Type of entity (task, memory, message, plan)
   * @param entityId - ID of the entity
   * @param operation - Type of operation (create, update, delete)
   * @param payload - Optional entity data for create/update
   * @returns The sync version assigned to this change
   */
  recordChange(
    entityType: SyncableEntityType,
    entityId: string,
    operation: ChangeOperation,
    payload?: Record<string, unknown>
  ): number {
    const id = this.generateId();
    const timestamp = Date.now();

    // Get and increment sync version atomically
    const newVersion = this.incrementSyncVersion();

    const stmt = this.db.prepare(`
      INSERT INTO change_log (id, entity_type, entity_id, operation, sync_version, timestamp, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      entityType,
      entityId,
      operation,
      newVersion,
      timestamp,
      payload ? JSON.stringify(payload) : null
    );

    this.logger.debug(
      `Recorded ${operation} for ${entityType}:${entityId} at version ${newVersion}`
    );

    return newVersion;
  }

  /**
   * Get changes since a given sync version
   *
   * @param options - Query options for filtering changes
   * @returns Array of change log entries
   */
  getChanges(options: GetChangesOptions = {}): ChangeLogEntry[] {
    const { sinceVersion = 0, entityTypes, limit = 1000 } = options;

    let query = `
      SELECT * FROM change_log
      WHERE sync_version > ?
    `;
    const params: (number | string)[] = [sinceVersion];

    if (entityTypes && entityTypes.length > 0) {
      query += ` AND entity_type IN (${entityTypes.map(() => '?').join(', ')})`;
      params.push(...entityTypes);
    }

    query += ` ORDER BY sync_version ASC LIMIT ?`;
    params.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Array<{
      id: string;
      entity_type: string;
      entity_id: string;
      operation: string;
      sync_version: number;
      timestamp: number;
      payload: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      entityType: row.entity_type as SyncableEntityType,
      entityId: row.entity_id,
      operation: row.operation as ChangeOperation,
      syncVersion: row.sync_version,
      timestamp: row.timestamp,
      payload: row.payload ? JSON.parse(row.payload) : undefined,
    }));
  }

  /**
   * Get the latest change for each entity (deduplicated)
   * Useful for building a full sync state
   *
   * @param sinceVersion - Only include changes after this version
   * @param entityTypes - Filter by entity types
   * @returns Map of entity key (type:id) to latest change
   */
  getLatestChanges(
    sinceVersion: number = 0,
    entityTypes?: SyncableEntityType[]
  ): Map<string, ChangeLogEntry> {
    // Get all changes since version, ordered oldest first
    const changes = this.getChanges({
      sinceVersion,
      entityTypes,
      limit: this.maxEntries,
    });

    // Build map with latest change per entity
    const latestChanges = new Map<string, ChangeLogEntry>();
    for (const change of changes) {
      const key = `${change.entityType}:${change.entityId}`;
      latestChanges.set(key, change);
    }

    return latestChanges;
  }

  /**
   * Get the current sync version
   */
  getCurrentSyncVersion(): number {
    const stmt = this.db.prepare(
      "SELECT value FROM sync_metadata WHERE key = 'current_sync_version'"
    );
    const row = stmt.get() as { value: string };
    return parseInt(row.value, 10);
  }

  /**
   * Get sync metadata for a remote sync state
   */
  getSyncMetadata(): SyncMetadata {
    const stmt = this.db.prepare('SELECT key, value FROM sync_metadata');
    const rows = stmt.all() as Array<{ key: string; value: string }>;

    const metadata: Record<string, string> = {};
    for (const row of rows) {
      metadata[row.key] = row.value;
    }

    return {
      lastSyncVersion: parseInt(metadata['last_sync_version'] ?? '0', 10),
      lastSyncTimestamp: parseInt(metadata['last_sync_timestamp'] ?? '0', 10),
      deviceId: metadata['device_id'],
    };
  }

  /**
   * Update sync metadata after a successful sync
   */
  updateSyncMetadata(version: number): void {
    const timestamp = Date.now();

    const updateMany = this.db.transaction(() => {
      this.db
        .prepare("INSERT OR REPLACE INTO sync_metadata (key, value) VALUES ('last_sync_version', ?)")
        .run(version.toString());
      this.db
        .prepare("INSERT OR REPLACE INTO sync_metadata (key, value) VALUES ('last_sync_timestamp', ?)")
        .run(timestamp.toString());
    });

    updateMany();

    this.logger.info(`Updated sync metadata: version=${version}, timestamp=${timestamp}`);
  }

  /**
   * Compact the change log by removing old entries
   * Only removes entries older than the last synced version
   *
   * @param beforeVersion - Remove entries with sync_version <= this value
   * @returns Number of entries removed
   */
  compact(beforeVersion?: number): number {
    const version = beforeVersion ?? this.getSyncMetadata().lastSyncVersion;

    if (version <= 0) {
      this.logger.debug('No sync version to compact against, skipping');
      return 0;
    }

    // Keep the most recent entry for each entity, even if older than version
    // This ensures we can always reconstruct the current state
    const deleteStmt = this.db.prepare(`
      DELETE FROM change_log
      WHERE sync_version <= ?
      AND id NOT IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY entity_type, entity_id ORDER BY sync_version DESC) as rn
          FROM change_log
        )
        WHERE rn = 1
      )
    `);

    const result = deleteStmt.run(version);
    const removed = result.changes;

    if (removed > 0) {
      this.logger.info(`Compacted ${removed} change log entries (before version ${version})`);

      // Run VACUUM to reclaim disk space (do this periodically, not every time)
      const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM change_log');
      const total = (totalStmt.get() as { count: number }).count;
      if (total < this.maxEntries / 2) {
        this.db.exec('VACUUM');
        this.logger.debug('Ran VACUUM to reclaim disk space');
      }
    }

    return removed;
  }

  /**
   * Adaptive compaction - triggers when log exceeds maxEntries
   * Keeps only the most recent entry per entity
   *
   * @returns Number of entries removed
   */
  adaptiveCompact(): number {
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM change_log');
    const count = (countStmt.get() as { count: number }).count;

    if (count <= this.maxEntries) {
      return 0;
    }

    this.logger.info(
      `Change log at ${count} entries (max: ${this.maxEntries}), triggering adaptive compaction`
    );

    // Delete all but the most recent entry for each entity
    const deleteStmt = this.db.prepare(`
      DELETE FROM change_log
      WHERE id NOT IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY entity_type, entity_id ORDER BY sync_version DESC) as rn
          FROM change_log
        )
        WHERE rn = 1
      )
    `);

    const result = deleteStmt.run();
    const removed = result.changes;

    this.logger.info(`Adaptive compaction removed ${removed} duplicate entries`);

    return removed;
  }

  /**
   * Get statistics about the change log
   */
  getStats(): ChangeLogStats {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM change_log');
    const total = (totalStmt.get() as { count: number }).count;

    const byTypeStmt = this.db.prepare(
      'SELECT entity_type, COUNT(*) as count FROM change_log GROUP BY entity_type'
    );
    const byTypeRows = byTypeStmt.all() as Array<{ entity_type: string; count: number }>;
    const byEntityType: Record<string, number> = {};
    for (const row of byTypeRows) {
      byEntityType[row.entity_type] = row.count;
    }

    const byOpStmt = this.db.prepare(
      'SELECT operation, COUNT(*) as count FROM change_log GROUP BY operation'
    );
    const byOpRows = byOpStmt.all() as Array<{ operation: string; count: number }>;
    const byOperation: Record<string, number> = {};
    for (const row of byOpRows) {
      byOperation[row.operation] = row.count;
    }

    const rangeStmt = this.db.prepare(
      'SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM change_log'
    );
    const range = rangeStmt.get() as { oldest: number | null; newest: number | null };

    return {
      totalEntries: total,
      byEntityType: byEntityType as Record<SyncableEntityType, number>,
      byOperation: byOperation as Record<ChangeOperation, number>,
      oldestEntry: range.oldest,
      newestEntry: range.newest,
      currentSyncVersion: this.getCurrentSyncVersion(),
    };
  }

  /**
   * Check if there are unsynced changes
   *
   * @param sinceVersion - Optional version to check from
   * @returns True if there are changes newer than sinceVersion
   */
  hasUnsyncedChanges(sinceVersion?: number): boolean {
    const version = sinceVersion ?? this.getSyncMetadata().lastSyncVersion;
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM change_log WHERE sync_version > ?');
    const result = stmt.get(version) as { count: number };
    return result.count > 0;
  }

  /**
   * Get entity IDs that have been deleted since a version
   * Useful for knowing which entities to remove during sync
   */
  getDeletedEntityIds(
    sinceVersion: number,
    entityType?: SyncableEntityType
  ): string[] {
    let query = `
      SELECT DISTINCT entity_id FROM change_log
      WHERE operation = 'delete' AND sync_version > ?
    `;
    const params: (string | number)[] = [sinceVersion];

    if (entityType) {
      query += ' AND entity_type = ?';
      params.push(entityType);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Array<{ entity_id: string }>;

    return rows.map((row) => row.entity_id);
  }

  /**
   * Clear all change log entries (for testing or reset)
   */
  clear(): void {
    this.db.exec('DELETE FROM change_log');
    this.db.prepare("UPDATE sync_metadata SET value = '0' WHERE key = 'current_sync_version'").run();
    this.logger.warn('Change log cleared');
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.logger.info('ChangeTracker closed');
    }
  }

  // ============================================================================
  // Private methods
  // ============================================================================

  private incrementSyncVersion(): number {
    const incrementTx = this.db.transaction(() => {
      const stmt = this.db.prepare(
        "SELECT value FROM sync_metadata WHERE key = 'current_sync_version'"
      );
      const row = stmt.get() as { value: string };
      const currentVersion = parseInt(row.value, 10);
      const newVersion = currentVersion + 1;

      this.db
        .prepare("UPDATE sync_metadata SET value = ? WHERE key = 'current_sync_version'")
        .run(newVersion.toString());

      return newVersion;
    });

    return incrementTx();
  }

  private generateId(): string {
    return `chg-${crypto.randomBytes(8).toString('hex')}`;
  }

  private generateDeviceId(): string {
    return `dev-${crypto.randomBytes(4).toString('hex')}`;
  }
}
