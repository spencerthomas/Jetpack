import { Logger, LogLevel } from '../utils/logger';

/**
 * Strategy for resolving conflicts between local and remote records
 */
export type ConflictStrategy = 'last-write-wins' | 'first-write-wins' | 'prefer-local' | 'prefer-remote';

/**
 * Represents a single field conflict between local and remote values
 */
export interface FieldConflict {
  field: string;
  localValue: unknown;
  remoteValue: unknown;
  resolvedValue: unknown;
  resolvedFrom: 'local' | 'remote';
}

/**
 * Result of a conflict resolution operation
 */
export interface ConflictResolution<T> {
  /** The resolved record after applying the conflict strategy */
  resolved: T;
  /** The strategy that was applied */
  strategy: ConflictStrategy;
  /** Whether a conflict was detected */
  hadConflict: boolean;
  /** Which version was preferred */
  winner: 'local' | 'remote' | 'merged';
  /** Individual field conflicts (for debugging) */
  fieldConflicts: FieldConflict[];
  /** Timestamp comparison details */
  timestamps: {
    local: Date | null;
    remote: Date | null;
    difference: number | null; // ms, positive = local is newer
  };
}

/**
 * Log entry for a conflict event
 */
export interface ConflictLogEntry {
  timestamp: Date;
  recordId: string;
  recordType: string;
  strategy: ConflictStrategy;
  winner: 'local' | 'remote' | 'merged';
  localTimestamp: Date | null;
  remoteTimestamp: Date | null;
  fieldConflicts: FieldConflict[];
}

/**
 * Interface for records that can be conflict-resolved
 * Records must have at least an id and optionally updatedAt
 */
export interface SyncableRecord {
  id: string;
  updatedAt?: Date | string;
  deletedAt?: Date | string | null;
  [key: string]: unknown;
}

/**
 * ConflictResolver handles conflict resolution for syncing local and remote data.
 *
 * Primary strategy: Last-Write-Wins (LWW) using updatedAt timestamps
 *
 * Edge cases handled:
 * - Missing timestamps: prefer local (safer for offline-first)
 * - Equal timestamps: prefer local (consistency)
 * - Deleted records: deleted wins if deletion is newer
 *
 * @example
 * ```typescript
 * const resolver = new ConflictResolver('Task');
 * const result = resolver.resolve(localTask, remoteTask);
 * if (result.hadConflict) {
 *   console.log('Conflict resolved:', result.winner);
 * }
 * ```
 */
export class ConflictResolver<T extends SyncableRecord = SyncableRecord> {
  private logger: Logger;
  private conflictLog: ConflictLogEntry[] = [];
  private maxLogEntries = 1000;

  constructor(
    private recordType: string,
    logLevel: LogLevel = LogLevel.DEBUG
  ) {
    this.logger = new Logger(`ConflictResolver:${recordType}`, logLevel);
  }

  /**
   * Resolve conflicts between local and remote records using Last-Write-Wins strategy
   *
   * @param local - The local version of the record
   * @param remote - The remote version of the record
   * @param strategy - Override the default LWW strategy
   * @returns Resolution result with the winning record and conflict details
   */
  resolve(
    local: T,
    remote: T,
    strategy: ConflictStrategy = 'last-write-wins'
  ): ConflictResolution<T> {
    const localTimestamp = this.normalizeTimestamp(local.updatedAt);
    const remoteTimestamp = this.normalizeTimestamp(remote.updatedAt);

    // Check for deleted records first
    const localDeleted = this.isDeleted(local);
    const remoteDeleted = this.isDeleted(remote);

    // Handle deletion conflicts
    if (localDeleted || remoteDeleted) {
      return this.resolveWithDeletion(local, remote, localDeleted, remoteDeleted, strategy);
    }

    // Detect field-level conflicts
    const fieldConflicts = this.detectFieldConflicts(local, remote);
    const hadConflict = fieldConflicts.length > 0;

    // Determine winner based on strategy
    const { winner, resolved } = this.determineWinner(
      local,
      remote,
      localTimestamp,
      remoteTimestamp,
      strategy
    );

    // Update field conflicts with resolved values
    const resolvedFieldConflicts = fieldConflicts.map(conflict => ({
      ...conflict,
      resolvedValue: (resolved as Record<string, unknown>)[conflict.field],
      resolvedFrom: winner as 'local' | 'remote',
    }));

    const result: ConflictResolution<T> = {
      resolved,
      strategy,
      hadConflict,
      winner,
      fieldConflicts: resolvedFieldConflicts,
      timestamps: {
        local: localTimestamp,
        remote: remoteTimestamp,
        difference: localTimestamp && remoteTimestamp
          ? localTimestamp.getTime() - remoteTimestamp.getTime()
          : null,
      },
    };

    // Log conflict for debugging
    if (hadConflict) {
      this.logConflict(local.id, result);
    }

    return result;
  }

  /**
   * Resolve a batch of record pairs
   */
  resolveBatch(
    pairs: Array<{ local: T; remote: T }>,
    strategy: ConflictStrategy = 'last-write-wins'
  ): ConflictResolution<T>[] {
    return pairs.map(({ local, remote }) => this.resolve(local, remote, strategy));
  }

  /**
   * Check if a record should be considered deleted
   */
  private isDeleted(record: T): boolean {
    return record.deletedAt != null;
  }

  /**
   * Handle conflicts where one or both records are deleted
   */
  private resolveWithDeletion(
    local: T,
    remote: T,
    localDeleted: boolean,
    remoteDeleted: boolean,
    strategy: ConflictStrategy
  ): ConflictResolution<T> {
    const localDeletedAt = this.normalizeTimestamp(local.deletedAt);
    const remoteDeletedAt = this.normalizeTimestamp(remote.deletedAt);
    const localUpdatedAt = this.normalizeTimestamp(local.updatedAt);
    const remoteUpdatedAt = this.normalizeTimestamp(remote.updatedAt);

    let winner: 'local' | 'remote';
    let resolved: T;

    if (localDeleted && remoteDeleted) {
      // Both deleted - prefer the one deleted more recently
      if (localDeletedAt && remoteDeletedAt) {
        winner = localDeletedAt >= remoteDeletedAt ? 'local' : 'remote';
      } else {
        winner = 'local'; // Default to local if timestamps missing
      }
      resolved = winner === 'local' ? local : remote;
    } else if (localDeleted) {
      // Local is deleted, remote is not
      // Deletion wins if it happened after the remote update
      const deleteTime = localDeletedAt?.getTime() ?? 0;
      const updateTime = remoteUpdatedAt?.getTime() ?? 0;

      if (deleteTime >= updateTime) {
        winner = 'local';
        resolved = local;
      } else {
        // Remote was updated after local delete - resurrection wins
        winner = 'remote';
        resolved = remote;
        this.logger.info(
          `Record ${local.id} resurrected: remote update (${remoteUpdatedAt?.toISOString()}) ` +
          `after local delete (${localDeletedAt?.toISOString()})`
        );
      }
    } else {
      // Remote is deleted, local is not
      const deleteTime = remoteDeletedAt?.getTime() ?? 0;
      const updateTime = localUpdatedAt?.getTime() ?? 0;

      if (deleteTime >= updateTime) {
        winner = 'remote';
        resolved = remote;
      } else {
        // Local was updated after remote delete - resurrection wins
        winner = 'local';
        resolved = local;
        this.logger.info(
          `Record ${local.id} resurrected: local update (${localUpdatedAt?.toISOString()}) ` +
          `after remote delete (${remoteDeletedAt?.toISOString()})`
        );
      }
    }

    const result: ConflictResolution<T> = {
      resolved,
      strategy,
      hadConflict: true,
      winner,
      fieldConflicts: [{
        field: 'deletedAt',
        localValue: local.deletedAt,
        remoteValue: remote.deletedAt,
        resolvedValue: resolved.deletedAt,
        resolvedFrom: winner,
      }],
      timestamps: {
        local: localUpdatedAt,
        remote: remoteUpdatedAt,
        difference: localUpdatedAt && remoteUpdatedAt
          ? localUpdatedAt.getTime() - remoteUpdatedAt.getTime()
          : null,
      },
    };

    this.logConflict(local.id, result);
    return result;
  }

  /**
   * Determine the winner based on timestamps and strategy
   */
  private determineWinner(
    local: T,
    remote: T,
    localTimestamp: Date | null,
    remoteTimestamp: Date | null,
    strategy: ConflictStrategy
  ): { winner: 'local' | 'remote'; resolved: T } {
    // Handle strategy overrides
    if (strategy === 'prefer-local') {
      return { winner: 'local', resolved: local };
    }
    if (strategy === 'prefer-remote') {
      return { winner: 'remote', resolved: remote };
    }

    // Handle missing timestamps
    if (!localTimestamp && !remoteTimestamp) {
      // Both missing - prefer local (safer for offline-first)
      this.logger.debug(`Both timestamps missing for ${local.id}, preferring local`);
      return { winner: 'local', resolved: local };
    }

    if (!localTimestamp) {
      // Only local missing - remote wins
      this.logger.debug(`Local timestamp missing for ${local.id}, using remote`);
      return { winner: 'remote', resolved: remote };
    }

    if (!remoteTimestamp) {
      // Only remote missing - local wins
      this.logger.debug(`Remote timestamp missing for ${local.id}, using local`);
      return { winner: 'local', resolved: local };
    }

    // Both timestamps present - compare
    const localTime = localTimestamp.getTime();
    const remoteTime = remoteTimestamp.getTime();

    if (strategy === 'first-write-wins') {
      // Prefer the older timestamp
      if (localTime <= remoteTime) {
        return { winner: 'local', resolved: local };
      }
      return { winner: 'remote', resolved: remote };
    }

    // Default: last-write-wins
    if (localTime > remoteTime) {
      return { winner: 'local', resolved: local };
    }
    if (remoteTime > localTime) {
      return { winner: 'remote', resolved: remote };
    }

    // Equal timestamps - prefer local for consistency
    this.logger.debug(`Equal timestamps for ${local.id}, preferring local`);
    return { winner: 'local', resolved: local };
  }

  /**
   * Detect field-level differences between local and remote records
   */
  private detectFieldConflicts(local: T, remote: T): FieldConflict[] {
    const conflicts: FieldConflict[] = [];
    const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);

    // Fields to skip in conflict detection
    const skipFields = new Set(['updatedAt', 'createdAt', 'deletedAt', 'lastAccessed']);

    for (const key of allKeys) {
      if (skipFields.has(key)) continue;

      const localValue = (local as Record<string, unknown>)[key];
      const remoteValue = (remote as Record<string, unknown>)[key];

      if (!this.deepEqual(localValue, remoteValue)) {
        conflicts.push({
          field: key,
          localValue,
          remoteValue,
          resolvedValue: undefined, // Will be set after determining winner
          resolvedFrom: 'local', // Will be set after determining winner
        });
      }
    }

    return conflicts;
  }

  /**
   * Deep equality check for conflict detection
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return a === b;

    // Handle Date comparison
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }

    if (typeof a !== typeof b) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => this.deepEqual(item, b[index]));
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a as object);
      const keysB = Object.keys(b as object);

      if (keysA.length !== keysB.length) return false;

      return keysA.every(key =>
        this.deepEqual(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key]
        )
      );
    }

    return false;
  }

  /**
   * Normalize a timestamp to a Date object
   */
  private normalizeTimestamp(timestamp: Date | string | null | undefined): Date | null {
    if (timestamp == null) return null;

    if (timestamp instanceof Date) {
      return isNaN(timestamp.getTime()) ? null : timestamp;
    }

    if (typeof timestamp === 'string') {
      const parsed = new Date(timestamp);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
  }

  /**
   * Log a conflict for debugging purposes
   */
  private logConflict(recordId: string, result: ConflictResolution<T>): void {
    const entry: ConflictLogEntry = {
      timestamp: new Date(),
      recordId,
      recordType: this.recordType,
      strategy: result.strategy,
      winner: result.winner,
      localTimestamp: result.timestamps.local,
      remoteTimestamp: result.timestamps.remote,
      fieldConflicts: result.fieldConflicts,
    };

    this.conflictLog.push(entry);

    // Trim log if needed
    if (this.conflictLog.length > this.maxLogEntries) {
      this.conflictLog = this.conflictLog.slice(-this.maxLogEntries);
    }

    this.logger.debug(
      `Conflict resolved for ${recordId}: ${result.winner} wins ` +
      `(local: ${result.timestamps.local?.toISOString() ?? 'null'}, ` +
      `remote: ${result.timestamps.remote?.toISOString() ?? 'null'}, ` +
      `diff: ${result.timestamps.difference ?? 'N/A'}ms)`
    );

    if (result.fieldConflicts.length > 0) {
      this.logger.debug(
        `  Fields: ${result.fieldConflicts.map(f => f.field).join(', ')}`
      );
    }
  }

  /**
   * Get the conflict log for debugging
   */
  getConflictLog(): ConflictLogEntry[] {
    return [...this.conflictLog];
  }

  /**
   * Get recent conflicts for a specific record
   */
  getConflictsForRecord(recordId: string): ConflictLogEntry[] {
    return this.conflictLog.filter(entry => entry.recordId === recordId);
  }

  /**
   * Clear the conflict log
   */
  clearConflictLog(): void {
    this.conflictLog = [];
  }

  /**
   * Get conflict statistics
   */
  getConflictStats(): {
    total: number;
    byWinner: Record<string, number>;
    byStrategy: Record<string, number>;
    recentConflicts: number;
  } {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const byWinner: Record<string, number> = {};
    const byStrategy: Record<string, number> = {};
    let recentConflicts = 0;

    for (const entry of this.conflictLog) {
      byWinner[entry.winner] = (byWinner[entry.winner] || 0) + 1;
      byStrategy[entry.strategy] = (byStrategy[entry.strategy] || 0) + 1;

      if (entry.timestamp >= oneHourAgo) {
        recentConflicts++;
      }
    }

    return {
      total: this.conflictLog.length,
      byWinner,
      byStrategy,
      recentConflicts,
    };
  }
}

/**
 * Factory function to create a typed ConflictResolver
 */
export function createConflictResolver<T extends SyncableRecord>(
  recordType: string,
  logLevel: LogLevel = LogLevel.DEBUG
): ConflictResolver<T> {
  return new ConflictResolver<T>(recordType, logLevel);
}
