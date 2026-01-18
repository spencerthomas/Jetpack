import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '@jetpack-agent/shared';

/**
 * Configuration for sliding window state management
 */
export interface SlidingWindowConfig {
  /** Maximum items to keep in memory */
  maxItems: number;
  /** Archive evicted items to disk (optional) */
  archivePath?: string;
  /** Maximum items per archive file (default: 1000) */
  archiveBatchSize?: number;
}

/**
 * Creates a sliding window reducer for LangGraph state
 * Keeps only the most recent N items and optionally archives evicted items
 *
 * @param maxItems Maximum items to keep in memory
 * @param archivePath Optional path to archive evicted items
 * @returns A reducer function compatible with LangGraph Annotation
 */
export function createSlidingWindowReducer<T>(
  maxItems: number,
  archivePath?: string
): (existing: T[], newItems?: T[]) => T[] {
  const logger = new Logger('SlidingWindow');
  let archiveBuffer: T[] = [];
  const archiveBatchSize = 1000;

  return (existing: T[], newItems?: T[]): T[] => {
    if (!newItems || newItems.length === 0) {
      return existing;
    }

    const combined = [...existing, ...newItems];

    // If within limit, return as-is
    if (combined.length <= maxItems) {
      return combined;
    }

    // Calculate how many to evict
    const evictCount = combined.length - maxItems;
    const evicted = combined.slice(0, evictCount);
    const retained = combined.slice(evictCount);

    // Archive evicted items if path provided
    if (archivePath && evicted.length > 0) {
      archiveBuffer.push(...evicted);

      // Flush to disk when batch is full (async, fire-and-forget)
      if (archiveBuffer.length >= archiveBatchSize) {
        const toArchive = archiveBuffer;
        archiveBuffer = [];
        flushToArchive(toArchive, archivePath, logger).catch((err) => {
          logger.error('Failed to archive evicted items:', err);
        });
      }
    }

    logger.debug(`Evicted ${evictCount} items, retained ${retained.length}`);
    return retained;
  };
}

/**
 * Creates a sliding window reducer for unique ID sets
 * Uses Set to deduplicate, then limits to most recent N items
 */
export function createSlidingSetReducer(
  maxItems: number
): (existing: string[], newIds?: string[]) => string[] {
  return (existing: string[], newIds?: string[]): string[] => {
    if (!newIds || newIds.length === 0) {
      return existing;
    }

    // Deduplicate
    const combined = [...new Set([...existing, ...newIds])];

    // If within limit, return as-is
    if (combined.length <= maxItems) {
      return combined;
    }

    // Keep most recent (assumes newer items are appended)
    return combined.slice(-maxItems);
  };
}

/**
 * Creates a sliding window reducer for Record types
 * Keeps only the most recent N entries by insertion order
 */
export function createSlidingRecordReducer<V>(
  maxItems: number
): (existing: Record<string, V>, updates?: Record<string, V>) => Record<string, V> {
  return (existing: Record<string, V>, updates?: Record<string, V>): Record<string, V> => {
    if (!updates || Object.keys(updates).length === 0) {
      return existing;
    }

    const combined = { ...existing, ...updates };
    const keys = Object.keys(combined);

    // If within limit, return as-is
    if (keys.length <= maxItems) {
      return combined;
    }

    // Keep most recent entries (by key insertion order)
    const keysToKeep = keys.slice(-maxItems);
    const result: Record<string, V> = {};
    for (const key of keysToKeep) {
      result[key] = combined[key];
    }

    return result;
  };
}

/**
 * Flush items to archive file
 */
async function flushToArchive<T>(items: T[], archivePath: string, logger: Logger): Promise<void> {
  try {
    await fs.mkdir(path.dirname(archivePath), { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = `${archivePath}/archive-${timestamp}.jsonl`;

    // Append to JSONL file
    const content = items.map((item) => JSON.stringify(item)).join('\n') + '\n';
    await fs.appendFile(filePath, content);

    logger.debug(`Archived ${items.length} items to ${filePath}`);
  } catch (err) {
    logger.error('Archive flush failed:', err);
  }
}

/**
 * State manager for supervisor with sliding window and archival
 */
export class SupervisorStateManager {
  private logger: Logger;
  private archivePath?: string;
  private taskArchive: unknown[] = [];
  private conflictArchive: unknown[] = [];
  private reassignmentArchive: unknown[] = [];
  private archiveBatchSize: number;

  constructor(config: { workDir?: string; archiveBatchSize?: number } = {}) {
    this.logger = new Logger('StateManager');
    this.archiveBatchSize = config.archiveBatchSize || 1000;

    if (config.workDir) {
      this.archivePath = path.join(config.workDir, '.jetpack', 'state-archive');
    }
  }

  /**
   * Archive a batch of tasks
   */
  async archiveTasks(tasks: unknown[]): Promise<void> {
    if (!this.archivePath) return;

    this.taskArchive.push(...tasks);
    if (this.taskArchive.length >= this.archiveBatchSize) {
      await this.flushTaskArchive();
    }
  }

  /**
   * Archive a batch of conflicts
   */
  async archiveConflicts(conflicts: unknown[]): Promise<void> {
    if (!this.archivePath) return;

    this.conflictArchive.push(...conflicts);
    if (this.conflictArchive.length >= this.archiveBatchSize) {
      await this.flushConflictArchive();
    }
  }

  /**
   * Archive a batch of reassignments
   */
  async archiveReassignments(reassignments: unknown[]): Promise<void> {
    if (!this.archivePath) return;

    this.reassignmentArchive.push(...reassignments);
    if (this.reassignmentArchive.length >= this.archiveBatchSize) {
      await this.flushReassignmentArchive();
    }
  }

  /**
   * Flush all pending archives
   */
  async flushAll(): Promise<void> {
    await Promise.all([
      this.flushTaskArchive(),
      this.flushConflictArchive(),
      this.flushReassignmentArchive(),
    ]);
  }

  private async flushTaskArchive(): Promise<void> {
    if (!this.archivePath || this.taskArchive.length === 0) return;

    const items = this.taskArchive;
    this.taskArchive = [];
    await flushToArchive(items, path.join(this.archivePath, 'tasks'), this.logger);
  }

  private async flushConflictArchive(): Promise<void> {
    if (!this.archivePath || this.conflictArchive.length === 0) return;

    const items = this.conflictArchive;
    this.conflictArchive = [];
    await flushToArchive(items, path.join(this.archivePath, 'conflicts'), this.logger);
  }

  private async flushReassignmentArchive(): Promise<void> {
    if (!this.archivePath || this.reassignmentArchive.length === 0) return;

    const items = this.reassignmentArchive;
    this.reassignmentArchive = [];
    await flushToArchive(items, path.join(this.archivePath, 'reassignments'), this.logger);
  }
}

/**
 * Default limits for supervisor state arrays
 */
export const STATE_LIMITS = {
  MAX_TASKS: 100,
  MAX_CONFLICTS: 50,
  MAX_REASSIGNMENTS: 50,
  MAX_COMPLETED_IDS: 500,
  MAX_FAILED_IDS: 100,
  MAX_ASSIGNMENTS: 100,
  MAX_STATUSES: 200,
} as const;
