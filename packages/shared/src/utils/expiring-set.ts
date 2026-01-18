/**
 * ExpiringSet - A Set implementation with automatic TTL-based expiration
 *
 * Prevents unbounded memory growth by automatically evicting entries
 * after a configurable time-to-live period.
 *
 * @example
 * ```typescript
 * // Create a set with 1-hour TTL
 * const processedIds = new ExpiringSet<string>({ ttlMs: 60 * 60 * 1000 });
 *
 * // Add entries (they will auto-expire after TTL)
 * processedIds.add('msg-123');
 *
 * // Check membership
 * if (!processedIds.has('msg-123')) {
 *   // Process the message
 * }
 *
 * // Cleanup on shutdown
 * processedIds.dispose();
 * ```
 */

export interface ExpiringSetConfig {
  /** Time-to-live in milliseconds for each entry */
  ttlMs: number;
  /** Interval in ms to run cleanup (default: ttlMs / 4) */
  cleanupIntervalMs?: number;
  /** Maximum entries before forced cleanup (default: unlimited) */
  maxEntries?: number;
  /** Callback when entries are evicted */
  onEvict?: (evictedKeys: string[]) => void;
}

interface TimestampedEntry {
  addedAt: number;
}

/**
 * A Set with automatic TTL-based expiration of entries
 */
export class ExpiringSet<T extends string | number = string> {
  private entries: Map<T, TimestampedEntry> = new Map();
  private cleanupInterval?: NodeJS.Timeout;
  private config: Required<Omit<ExpiringSetConfig, 'onEvict'>> & Pick<ExpiringSetConfig, 'onEvict'>;

  constructor(config: ExpiringSetConfig) {
    this.config = {
      ttlMs: config.ttlMs,
      cleanupIntervalMs: config.cleanupIntervalMs ?? Math.floor(config.ttlMs / 4),
      maxEntries: config.maxEntries ?? Infinity,
      onEvict: config.onEvict,
    };

    // Start periodic cleanup
    this.startCleanupTimer();
  }

  /**
   * Add an entry to the set
   * @param key The key to add
   * @returns true if the key was newly added, false if it already existed
   */
  add(key: T): boolean {
    const exists = this.entries.has(key);

    // Update/add entry with current timestamp
    this.entries.set(key, { addedAt: Date.now() });

    // Check if we need to evict due to max entries
    if (this.entries.size > this.config.maxEntries) {
      this.evictOldest(this.entries.size - this.config.maxEntries);
    }

    return !exists;
  }

  /**
   * Check if a key exists in the set (and is not expired)
   */
  has(key: T): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;

    // Check if expired
    if (Date.now() - entry.addedAt > this.config.ttlMs) {
      this.entries.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Remove a key from the set
   */
  delete(key: T): boolean {
    return this.entries.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    const keys = Array.from(this.entries.keys()) as string[];
    this.entries.clear();

    if (this.config.onEvict && keys.length > 0) {
      this.config.onEvict(keys);
    }
  }

  /**
   * Get the number of entries (may include expired entries until next cleanup)
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Get approximate memory usage in bytes
   */
  getMemoryUsage(): number {
    // Rough estimate: each entry is ~100 bytes overhead + key size
    let usage = 0;
    for (const key of this.entries.keys()) {
      usage += 100 + String(key).length * 2; // UTF-16 string encoding
    }
    return usage;
  }

  /**
   * Get all current (non-expired) keys
   */
  keys(): T[] {
    const now = Date.now();
    const result: T[] = [];

    for (const [key, entry] of this.entries) {
      if (now - entry.addedAt <= this.config.ttlMs) {
        result.push(key);
      }
    }

    return result;
  }

  /**
   * Iterate over all entries (for serialization)
   */
  *[Symbol.iterator](): IterableIterator<T> {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now - entry.addedAt <= this.config.ttlMs) {
        yield key;
      }
    }
  }

  /**
   * Bulk add entries (useful for restoring from persistence)
   * @param keys Keys to add
   * @param timestamp Optional timestamp (defaults to now)
   */
  addBulk(keys: T[], timestamp?: number): void {
    const addedAt = timestamp ?? Date.now();
    for (const key of keys) {
      this.entries.set(key, { addedAt });
    }

    // Enforce max entries
    if (this.entries.size > this.config.maxEntries) {
      this.evictOldest(this.entries.size - this.config.maxEntries);
    }
  }

  /**
   * Run cleanup now (removes expired entries)
   * @returns Number of entries evicted
   */
  cleanup(): number {
    const now = Date.now();
    const evicted: string[] = [];

    for (const [key, entry] of this.entries) {
      if (now - entry.addedAt > this.config.ttlMs) {
        this.entries.delete(key);
        evicted.push(String(key));
      }
    }

    if (this.config.onEvict && evicted.length > 0) {
      this.config.onEvict(evicted);
    }

    return evicted.length;
  }

  /**
   * Stop the cleanup timer and release resources
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Get statistics about the set
   */
  getStats(): {
    size: number;
    memoryUsage: number;
    oldestEntryAgeMs: number;
    newestEntryAgeMs: number;
  } {
    const now = Date.now();
    let oldestAge = 0;
    let newestAge = Infinity;

    for (const entry of this.entries.values()) {
      const age = now - entry.addedAt;
      if (age > oldestAge) oldestAge = age;
      if (age < newestAge) newestAge = age;
    }

    return {
      size: this.entries.size,
      memoryUsage: this.getMemoryUsage(),
      oldestEntryAgeMs: this.entries.size > 0 ? oldestAge : 0,
      newestEntryAgeMs: this.entries.size > 0 ? newestAge : 0,
    };
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);

    // Don't prevent Node from exiting
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  private evictOldest(count: number): void {
    // Sort by age (oldest first) and evict
    const sorted = Array.from(this.entries.entries())
      .sort((a, b) => a[1].addedAt - b[1].addedAt);

    const evicted: string[] = [];
    for (let i = 0; i < count && i < sorted.length; i++) {
      const [key] = sorted[i];
      this.entries.delete(key);
      evicted.push(String(key));
    }

    if (this.config.onEvict && evicted.length > 0) {
      this.config.onEvict(evicted);
    }
  }
}

/**
 * Create an ExpiringSet with sensible defaults for message deduplication
 * Default: 24-hour TTL, max 10,000 entries
 */
export function createMessageDeduplicationSet(
  options?: Partial<ExpiringSetConfig>
): ExpiringSet<string> {
  return new ExpiringSet({
    ttlMs: options?.ttlMs ?? 24 * 60 * 60 * 1000, // 24 hours
    maxEntries: options?.maxEntries ?? 10_000,
    cleanupIntervalMs: options?.cleanupIntervalMs ?? 15 * 60 * 1000, // 15 minutes
    onEvict: options?.onEvict,
  });
}
