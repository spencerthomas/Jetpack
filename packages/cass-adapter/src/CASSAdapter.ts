import * as path from 'path';
import Database from 'better-sqlite3';
import {
  MemoryEntry,
  MemoryType,
  MemoryStore,
  Logger,
  IMemoryStore,
  MemoryInput,
  MemoryStats,
  PaginationOptions,
  PaginatedResult,
} from '@jetpack-agent/shared';
import * as crypto from 'crypto';
import {
  EmbeddingGenerator,
  EmbeddingConfig,
  createEmbeddingGenerator,
  getProviderInfo,
} from './EmbeddingGenerator';

export interface CASSConfig {
  cassDir: string;
  compactionThreshold: number; // 0-1, importance below this gets compacted
  maxEntries: number; // Max entries before forcing compaction
  /** Enable automatic embedding generation when storing memories */
  autoGenerateEmbeddings?: boolean;
  /** Configuration for embedding generation */
  embeddingConfig?: EmbeddingConfig;
}

/**
 * CASSAdapter - Local SQLite-based memory storage with optional embeddings
 *
 * Implements IMemoryStore interface for hybrid Cloudflare architecture.
 * Supports semantic search via embeddings (OpenAI ada-002 compatible).
 *
 * @see docs/HYBRID_ARCHITECTURE.md
 */
export class CASSAdapter implements IMemoryStore, MemoryStore {
  private db!: Database.Database;
  private logger: Logger;
  private dbPath: string;
  private embeddingGenerator: EmbeddingGenerator | null = null;
  private autoGenerateEmbeddings: boolean;

  constructor(private config: CASSConfig) {
    this.logger = new Logger('CASS');
    this.dbPath = path.join(config.cassDir, 'memory.db');
    this.autoGenerateEmbeddings = config.autoGenerateEmbeddings ?? false;

    // Initialize embedding generator if configured
    if (this.autoGenerateEmbeddings || config.embeddingConfig) {
      this.embeddingGenerator = createEmbeddingGenerator(config.embeddingConfig);
      if (this.embeddingGenerator) {
        const genConfig = this.embeddingGenerator.getConfig();
        this.logger.info(
          `Embedding generator initialized: provider=${genConfig.provider}, model=${genConfig.model}`
        );
      } else if (this.autoGenerateEmbeddings) {
        const info = getProviderInfo();
        this.logger.warn(
          'Auto-embedding enabled but no provider configured. ' +
            'Set EMBEDDING_PROVIDER=openai and EMBEDDING_API_KEY, or EMBEDDING_PROVIDER=ollama. ' +
            `Current config: ${JSON.stringify(info.environmentVariables)}`
        );
      }
    }
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing CASS memory system');

    this.db = new Database(this.dbPath);

    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding TEXT,
        metadata TEXT,
        importance REAL NOT NULL DEFAULT 0.5,
        created_at INTEGER NOT NULL,
        last_accessed INTEGER NOT NULL,
        access_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_importance ON memories(importance);
      CREATE INDEX IF NOT EXISTS idx_created_at ON memories(created_at);
      CREATE INDEX IF NOT EXISTS idx_last_accessed ON memories(last_accessed);
    `);

    this.logger.info('CASS memory system initialized');
  }

  async store(entry: MemoryInput): Promise<string> {
    const id = this.generateId();
    const now = Date.now();

    // Generate embedding if auto-embed is enabled and no embedding provided
    let embedding = entry.embedding;
    if (!embedding && this.autoGenerateEmbeddings && this.embeddingGenerator) {
      try {
        const result = await this.embeddingGenerator.generate(entry.content);
        embedding = result.embedding;
        this.logger.debug(`Generated embedding for memory (${result.tokensUsed} tokens)`);
      } catch (error) {
        this.logger.warn('Failed to generate embedding, storing without:', error);
      }
    }

    const stmt = this.db.prepare(`
      INSERT INTO memories (id, type, content, embedding, metadata, importance, created_at, last_accessed, access_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    stmt.run(
      id,
      entry.type,
      entry.content,
      embedding ? JSON.stringify(embedding) : null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.importance,
      now,
      now
    );

    this.logger.debug(`Stored memory: ${id} (${entry.type})${embedding ? ' with embedding' : ''}`);

    // Check if compaction is needed
    const count = this.getCount();
    if (count > this.config.maxEntries) {
      await this.compact(this.config.compactionThreshold);
    } else {
      // Memory leak fix: Also try adaptive compaction at 80% capacity
      await this.adaptiveCompact();
    }

    return id;
  }

  async retrieve(id: string): Promise<MemoryEntry | null> {
    const stmt = this.db.prepare('SELECT * FROM memories WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) {
      return null;
    }

    // Update access statistics
    const updateStmt = this.db.prepare(`
      UPDATE memories
      SET last_accessed = ?, access_count = access_count + 1
      WHERE id = ?
    `);
    updateStmt.run(Date.now(), id);

    return this.rowToMemoryEntry(row);
  }

  async delete(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM memories WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes > 0) {
      this.logger.debug(`Deleted memory: ${id}`);
      return true;
    }

    return false;
  }

  async search(query: string, limit: number = 10): Promise<MemoryEntry[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM memories
      WHERE content LIKE ?
      ORDER BY importance DESC, last_accessed DESC
      LIMIT ?
    `);

    const rows = stmt.all(`%${query}%`, limit) as any[];
    return rows.map(row => this.rowToMemoryEntry(row));
  }

  async semanticSearch(embedding: number[], limit: number = 10): Promise<MemoryEntry[]> {
    // Memory leak fix: Use batched iteration instead of loading all embeddings at once
    // This keeps only top-K results in memory during search
    const BATCH_SIZE = 100;

    // Get total count first
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM memories WHERE embedding IS NOT NULL');
    const totalCount = (countStmt.get() as any).count;

    if (totalCount === 0) {
      return [];
    }

    // Use a min-heap-like structure: keep only top `limit` results
    // Each item: { row, similarity }
    const topResults: Array<{ row: any; similarity: number }> = [];

    // Process in batches to avoid loading everything at once
    const batchStmt = this.db.prepare(
      'SELECT * FROM memories WHERE embedding IS NOT NULL LIMIT ? OFFSET ?'
    );

    let offset = 0;
    while (offset < totalCount) {
      const batch = batchStmt.all(BATCH_SIZE, offset) as any[];

      for (const row of batch) {
        const storedEmbedding = JSON.parse(row.embedding) as number[];
        const similarity = this.cosineSimilarity(embedding, storedEmbedding);

        // If we haven't filled the results yet, just add
        if (topResults.length < limit) {
          topResults.push({ row, similarity });
          // Keep sorted so we know the minimum quickly
          topResults.sort((a, b) => b.similarity - a.similarity);
        } else if (similarity > topResults[topResults.length - 1].similarity) {
          // Replace the lowest similarity if this one is better
          topResults[topResults.length - 1] = { row, similarity };
          // Re-sort to maintain order
          topResults.sort((a, b) => b.similarity - a.similarity);
        }
      }

      offset += BATCH_SIZE;
    }

    return topResults.map(r => this.rowToMemoryEntry(r.row));
  }

  /**
   * Search memories using a text query (converts to embedding first)
   * Falls back to text search if embedding generation fails
   */
  async semanticSearchByQuery(query: string, limit: number = 10): Promise<MemoryEntry[]> {
    if (!this.embeddingGenerator) {
      this.logger.warn('No embedding generator available, falling back to text search');
      return this.search(query, limit);
    }

    try {
      const result = await this.embeddingGenerator.generate(query);
      return this.semanticSearch(result.embedding, limit);
    } catch (error) {
      this.logger.warn('Embedding generation failed, falling back to text search:', error);
      return this.search(query, limit);
    }
  }

  /**
   * Generate embeddings for all memories that don't have them
   * Returns the number of memories updated
   */
  async backfillEmbeddings(batchSize: number = 10): Promise<number> {
    if (!this.embeddingGenerator) {
      throw new Error('Embedding generator not available');
    }

    const stmt = this.db.prepare(
      'SELECT id, content FROM memories WHERE embedding IS NULL LIMIT ?'
    );
    const rows = stmt.all(batchSize) as Array<{ id: string; content: string }>;

    if (rows.length === 0) {
      this.logger.info('No memories without embeddings');
      return 0;
    }

    this.logger.info(`Backfilling embeddings for ${rows.length} memories`);

    const contents = rows.map(r => r.content);
    const results = await this.embeddingGenerator.generateBatch(contents);

    const updateStmt = this.db.prepare('UPDATE memories SET embedding = ? WHERE id = ?');
    const updateMany = this.db.transaction((items: Array<{ id: string; embedding: number[] }>) => {
      for (const item of items) {
        updateStmt.run(JSON.stringify(item.embedding), item.id);
      }
    });

    updateMany(
      rows.map((row, i) => ({
        id: row.id,
        embedding: results[i].embedding,
      }))
    );

    this.logger.info(`Backfilled ${rows.length} embeddings`);
    return rows.length;
  }

  /**
   * Get count of memories with and without embeddings
   */
  async getEmbeddingStats(): Promise<{
    withEmbedding: number;
    withoutEmbedding: number;
    total: number;
  }> {
    const withStmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM memories WHERE embedding IS NOT NULL'
    );
    const withoutStmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM memories WHERE embedding IS NULL'
    );

    const withEmbedding = (withStmt.get() as any).count;
    const withoutEmbedding = (withoutStmt.get() as any).count;

    return {
      withEmbedding,
      withoutEmbedding,
      total: withEmbedding + withoutEmbedding,
    };
  }

  /**
   * Check if embedding generator is available
   */
  hasEmbeddingGenerator(): boolean {
    return this.embeddingGenerator !== null;
  }

  /**
   * Get current configuration (for UI display)
   * Note: API key is masked for security
   */
  getConfig(): {
    cassDir: string;
    compactionThreshold: number;
    maxEntries: number;
    autoGenerateEmbeddings: boolean;
    hasEmbeddingGenerator: boolean;
    embeddingModel?: string;
    embeddingProvider?: string;
  } {
    const genConfig = this.embeddingGenerator?.getConfig();
    return {
      cassDir: this.config.cassDir,
      compactionThreshold: this.config.compactionThreshold,
      maxEntries: this.config.maxEntries,
      autoGenerateEmbeddings: this.autoGenerateEmbeddings,
      hasEmbeddingGenerator: this.embeddingGenerator !== null,
      embeddingModel: genConfig?.model ?? this.config.embeddingConfig?.model,
      embeddingProvider: genConfig?.provider,
    };
  }

  /**
   * Reconfigure CASS settings at runtime (hot reload)
   * Allows updating compaction settings and embedding configuration without restart
   */
  async reconfigure(newConfig: Partial<CASSConfig>): Promise<void> {
    this.logger.info('Reconfiguring CASS settings');

    // Update compaction settings
    if (newConfig.compactionThreshold !== undefined) {
      this.config.compactionThreshold = newConfig.compactionThreshold;
      this.logger.debug(`Updated compactionThreshold to ${newConfig.compactionThreshold}`);
    }

    if (newConfig.maxEntries !== undefined) {
      this.config.maxEntries = newConfig.maxEntries;
      this.logger.debug(`Updated maxEntries to ${newConfig.maxEntries}`);
    }

    // Update embedding configuration
    if (newConfig.autoGenerateEmbeddings !== undefined) {
      this.autoGenerateEmbeddings = newConfig.autoGenerateEmbeddings;
      this.config.autoGenerateEmbeddings = newConfig.autoGenerateEmbeddings;
    }

    // Reinitialize embedding generator if config provided
    if (newConfig.embeddingConfig !== undefined) {
      this.config.embeddingConfig = newConfig.embeddingConfig;

      if (this.autoGenerateEmbeddings || newConfig.embeddingConfig) {
        const newGenerator = createEmbeddingGenerator(newConfig.embeddingConfig);

        if (newGenerator) {
          this.embeddingGenerator = newGenerator;
          this.logger.info('Embedding generator reinitialized');
        } else {
          this.embeddingGenerator = null;
          if (this.autoGenerateEmbeddings) {
            this.logger.warn('Auto-embedding enabled but no valid API key. Set OPENAI_API_KEY or provide apiKey in config.');
          }
        }
      } else {
        this.embeddingGenerator = null;
      }
    }

    this.logger.info('CASS reconfiguration complete');
  }

  async compact(threshold: number): Promise<number> {
    // SQLite doesn't support ORDER BY in DELETE, so we just delete by threshold
    const stmt = this.db.prepare(`
      DELETE FROM memories
      WHERE importance < ? AND type != 'codebase_knowledge'
    `);

    const result = stmt.run(threshold);
    const removed = result.changes;

    if (removed > 0) {
      this.logger.info(`Compacted ${removed} low-importance memories`);
    }

    return removed;
  }

  /**
   * Memory leak fix: Adaptive compaction - triggers when at 80% capacity
   * Removes the bottom 20% by importance
   */
  async adaptiveCompact(): Promise<number> {
    const count = this.getCount();
    const threshold80Percent = Math.floor(this.config.maxEntries * 0.8);

    if (count < threshold80Percent) {
      return 0; // Not at capacity yet
    }

    this.logger.info(`Memory at ${Math.round(count / this.config.maxEntries * 100)}% capacity, triggering adaptive compaction`);

    // Calculate how many to remove (bottom 20%)
    const targetCount = Math.floor(this.config.maxEntries * 0.8);
    const toRemove = count - targetCount;

    if (toRemove <= 0) {
      return 0;
    }

    // Find the importance threshold that will remove approximately `toRemove` entries
    // Get the Nth lowest importance where N = toRemove
    const thresholdStmt = this.db.prepare(`
      SELECT importance FROM memories
      WHERE type != 'codebase_knowledge'
      ORDER BY importance ASC
      LIMIT 1 OFFSET ?
    `);

    const thresholdRow = thresholdStmt.get(toRemove) as { importance: number } | undefined;
    if (!thresholdRow) {
      // Not enough non-protected entries to remove
      return 0;
    }

    const importanceThreshold = thresholdRow.importance;

    // Delete all entries below or at this threshold (capped by count)
    const deleteStmt = this.db.prepare(`
      DELETE FROM memories
      WHERE id IN (
        SELECT id FROM memories
        WHERE importance <= ? AND type != 'codebase_knowledge'
        ORDER BY importance ASC
        LIMIT ?
      )
    `);

    const result = deleteStmt.run(importanceThreshold, toRemove);
    const removed = result.changes;

    this.logger.info(`Adaptive compaction removed ${removed} low-importance memories`);
    return removed;
  }

  async updateImportance(id: string, importance: number): Promise<void> {
    const stmt = this.db.prepare('UPDATE memories SET importance = ? WHERE id = ?');
    stmt.run(importance, id);
  }

  async getByType(type: MemoryType, limit?: number): Promise<MemoryEntry[]> {
    const query = limit
      ? 'SELECT * FROM memories WHERE type = ? ORDER BY importance DESC, last_accessed DESC LIMIT ?'
      : 'SELECT * FROM memories WHERE type = ? ORDER BY importance DESC, last_accessed DESC';

    const stmt = this.db.prepare(query);
    const rows = limit ? stmt.all(type, limit) : stmt.all(type);

    return (rows as any[]).map(row => this.rowToMemoryEntry(row));
  }

  async getRecentMemories(limit: number = 50): Promise<MemoryEntry[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM memories
      ORDER BY created_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as any[];
    return rows.map(row => this.rowToMemoryEntry(row));
  }

  async getStats(): Promise<MemoryStats> {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM memories');
    const total = (totalStmt.get() as any).count;

    const byTypeStmt = this.db.prepare('SELECT type, COUNT(*) as count FROM memories GROUP BY type');
    const byTypeRows = byTypeStmt.all() as Array<{ type: MemoryType; count: number }>;
    const byType: Record<string, number> = {};
    for (const row of byTypeRows) {
      byType[row.type] = row.count;
    }

    const avgStmt = this.db.prepare('SELECT AVG(importance) as avg, SUM(access_count) as total_accesses FROM memories');
    const avgRow = avgStmt.get() as any;

    // Get embedding stats
    const embeddingStats = await this.getEmbeddingStats();

    return {
      total,
      byType: byType as Record<MemoryType, number>,
      avgImportance: avgRow.avg || 0,
      totalAccesses: avgRow.total_accesses || 0,
      withEmbedding: embeddingStats.withEmbedding,
      withoutEmbedding: embeddingStats.withoutEmbedding,
    };
  }

  // ==================== Paginated Methods ====================
  // These methods support cursor-based pagination to prevent loading
  // entire result sets into memory at once.

  /**
   * List all memories with pagination
   * Uses cursor-based pagination keyed on (importance DESC, created_at DESC, id)
   */
  async listPaginated(
    options: PaginationOptions = { limit: 50 }
  ): Promise<PaginatedResult<MemoryEntry>> {
    const { limit, cursor, direction = 'desc' } = options;
    const parsedCursor = cursor ? this.decodeCursor(cursor) : null;

    // Build query with cursor condition
    let query: string;
    let params: (string | number)[];

    if (parsedCursor) {
      // Cursor pagination: get items after the cursor position
      // Using composite sort key (importance, created_at, id)
      query = direction === 'desc'
        ? `SELECT * FROM memories
           WHERE (importance, created_at, id) < (?, ?, ?)
           ORDER BY importance DESC, created_at DESC, id DESC
           LIMIT ?`
        : `SELECT * FROM memories
           WHERE (importance, created_at, id) > (?, ?, ?)
           ORDER BY importance ASC, created_at ASC, id ASC
           LIMIT ?`;
      params = [parsedCursor.importance, parsedCursor.createdAt, parsedCursor.id, limit + 1];
    } else {
      query = direction === 'desc'
        ? `SELECT * FROM memories ORDER BY importance DESC, created_at DESC, id DESC LIMIT ?`
        : `SELECT * FROM memories ORDER BY importance ASC, created_at ASC, id ASC LIMIT ?`;
      params = [limit + 1];
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    // Check if there are more results
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(row => this.rowToMemoryEntry(row));

    // Generate next cursor from last item
    let nextCursor: string | undefined;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      nextCursor = this.encodeCursor({
        importance: lastItem.importance,
        createdAt: lastItem.createdAt.getTime(),
        id: lastItem.id,
      });
    }

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Get memories by type with pagination
   */
  async getByTypePaginated(
    type: MemoryType,
    options: PaginationOptions = { limit: 50 }
  ): Promise<PaginatedResult<MemoryEntry>> {
    const { limit, cursor, direction = 'desc' } = options;
    const parsedCursor = cursor ? this.decodeCursor(cursor) : null;

    let query: string;
    let params: (string | number)[];

    if (parsedCursor) {
      query = direction === 'desc'
        ? `SELECT * FROM memories
           WHERE type = ? AND (importance, last_accessed, id) < (?, ?, ?)
           ORDER BY importance DESC, last_accessed DESC, id DESC
           LIMIT ?`
        : `SELECT * FROM memories
           WHERE type = ? AND (importance, last_accessed, id) > (?, ?, ?)
           ORDER BY importance ASC, last_accessed ASC, id ASC
           LIMIT ?`;
      params = [type, parsedCursor.importance, parsedCursor.lastAccessed ?? parsedCursor.createdAt, parsedCursor.id, limit + 1];
    } else {
      query = direction === 'desc'
        ? `SELECT * FROM memories WHERE type = ? ORDER BY importance DESC, last_accessed DESC, id DESC LIMIT ?`
        : `SELECT * FROM memories WHERE type = ? ORDER BY importance ASC, last_accessed ASC, id ASC LIMIT ?`;
      params = [type, limit + 1];
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(row => this.rowToMemoryEntry(row));

    let nextCursor: string | undefined;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      nextCursor = this.encodeCursor({
        importance: lastItem.importance,
        lastAccessed: lastItem.lastAccessed.getTime(),
        createdAt: lastItem.createdAt.getTime(),
        id: lastItem.id,
      });
    }

    // Get total count for this type (only on first page for efficiency)
    let totalCount: number | undefined;
    if (!cursor) {
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM memories WHERE type = ?');
      totalCount = (countStmt.get(type) as any).count;
    }

    return {
      items,
      nextCursor,
      totalCount,
      hasMore,
    };
  }

  /**
   * Search with pagination
   */
  async searchPaginated(
    query: string,
    options: PaginationOptions = { limit: 20 }
  ): Promise<PaginatedResult<MemoryEntry>> {
    const { limit, cursor, direction = 'desc' } = options;
    const parsedCursor = cursor ? this.decodeCursor(cursor) : null;
    const searchPattern = `%${query}%`;

    let sqlQuery: string;
    let params: (string | number)[];

    if (parsedCursor) {
      sqlQuery = direction === 'desc'
        ? `SELECT * FROM memories
           WHERE content LIKE ? AND (importance, last_accessed, id) < (?, ?, ?)
           ORDER BY importance DESC, last_accessed DESC, id DESC
           LIMIT ?`
        : `SELECT * FROM memories
           WHERE content LIKE ? AND (importance, last_accessed, id) > (?, ?, ?)
           ORDER BY importance ASC, last_accessed ASC, id ASC
           LIMIT ?`;
      params = [searchPattern, parsedCursor.importance, parsedCursor.lastAccessed ?? parsedCursor.createdAt, parsedCursor.id, limit + 1];
    } else {
      sqlQuery = direction === 'desc'
        ? `SELECT * FROM memories WHERE content LIKE ? ORDER BY importance DESC, last_accessed DESC, id DESC LIMIT ?`
        : `SELECT * FROM memories WHERE content LIKE ? ORDER BY importance ASC, last_accessed ASC, id ASC LIMIT ?`;
      params = [searchPattern, limit + 1];
    }

    const stmt = this.db.prepare(sqlQuery);
    const rows = stmt.all(...params) as any[];

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(row => this.rowToMemoryEntry(row));

    let nextCursor: string | undefined;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      nextCursor = this.encodeCursor({
        importance: lastItem.importance,
        lastAccessed: lastItem.lastAccessed.getTime(),
        createdAt: lastItem.createdAt.getTime(),
        id: lastItem.id,
      });
    }

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Semantic search with pagination
   * Uses batched loading to avoid loading all embeddings at once
   *
   * Note: True paginated semantic search requires vector database support.
   * This implementation batches the computation to reduce peak memory usage.
   */
  async semanticSearchPaginated(
    embedding: number[],
    options: PaginationOptions & { batchSize?: number } = { limit: 10 }
  ): Promise<PaginatedResult<MemoryEntry>> {
    const { limit, cursor, batchSize = 100 } = options;
    const offset = cursor ? parseInt(cursor, 10) : 0;

    // Count total with embeddings
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM memories WHERE embedding IS NOT NULL');
    const totalCount = (countStmt.get() as any).count as number;

    if (totalCount === 0) {
      return { items: [], hasMore: false, totalCount: 0 };
    }

    // For small datasets, use the original approach
    if (totalCount <= batchSize * 2) {
      const allStmt = this.db.prepare('SELECT * FROM memories WHERE embedding IS NOT NULL');
      const rows = allStmt.all() as any[];

      const results = rows.map(row => {
        const storedEmbedding = JSON.parse(row.embedding) as number[];
        const similarity = this.cosineSimilarity(embedding, storedEmbedding);
        return { row, similarity };
      });

      results.sort((a, b) => b.similarity - a.similarity);

      const paginatedResults = results.slice(offset, offset + limit);
      const hasMore = offset + limit < results.length;

      return {
        items: paginatedResults.map(r => this.rowToMemoryEntry(r.row)),
        nextCursor: hasMore ? String(offset + limit) : undefined,
        totalCount,
        hasMore,
      };
    }

    // For larger datasets, process in batches to reduce peak memory
    // This is a streaming approach that avoids loading all embeddings at once
    const allResults: Array<{ row: any; similarity: number }> = [];
    let processed = 0;

    while (processed < totalCount) {
      const batchStmt = this.db.prepare(
        'SELECT * FROM memories WHERE embedding IS NOT NULL LIMIT ? OFFSET ?'
      );
      const batchRows = batchStmt.all(batchSize, processed) as any[];

      if (batchRows.length === 0) break;

      for (const row of batchRows) {
        const storedEmbedding = JSON.parse(row.embedding) as number[];
        const similarity = this.cosineSimilarity(embedding, storedEmbedding);
        allResults.push({ row, similarity });
      }

      processed += batchRows.length;

      // Early termination optimization: if we have enough high-similarity results
      // and current batch max is lower than our threshold, we can stop
      if (allResults.length >= offset + limit + batchSize) {
        allResults.sort((a, b) => b.similarity - a.similarity);
        const threshold = allResults[offset + limit - 1]?.similarity ?? 0;

        // Check if remaining batches could have higher similarity
        // (conservative: only skip if we've processed at least 50%)
        if (processed > totalCount * 0.5 && threshold > 0.5) {
          this.logger.debug(`Early termination at ${processed}/${totalCount} items`);
          break;
        }
      }
    }

    // Final sort and pagination
    allResults.sort((a, b) => b.similarity - a.similarity);
    const paginatedResults = allResults.slice(offset, offset + limit);
    const hasMore = offset + limit < allResults.length;

    return {
      items: paginatedResults.map(r => this.rowToMemoryEntry(r.row)),
      nextCursor: hasMore ? String(offset + limit) : undefined,
      totalCount,
      hasMore,
    };
  }

  /**
   * Get memories by IDs in batches (for bulk retrieval)
   * Useful for fetching specific memories without loading all
   */
  async getByIdsBatch(ids: string[], batchSize: number = 100): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];

    for (let i = 0; i < ids.length; i += batchSize) {
      const batchIds = ids.slice(i, i + batchSize);
      const placeholders = batchIds.map(() => '?').join(',');
      const stmt = this.db.prepare(`SELECT * FROM memories WHERE id IN (${placeholders})`);
      const rows = stmt.all(...batchIds) as any[];
      results.push(...rows.map(row => this.rowToMemoryEntry(row)));
    }

    return results;
  }

  /**
   * Encode cursor for pagination
   */
  private encodeCursor(data: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(data)).toString('base64');
  }

  /**
   * Decode cursor from pagination
   */
  private decodeCursor(cursor: string): Record<string, any> | null {
    try {
      return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
    } catch {
      this.logger.warn('Invalid pagination cursor');
      return null;
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.logger.info('CASS memory system closed');
    }
  }

  private generateId(): string {
    return `mem-${crypto.randomBytes(8).toString('hex')}`;
  }

  private rowToMemoryEntry(row: any): MemoryEntry {
    return {
      id: row.id,
      type: row.type as MemoryType,
      content: row.content,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      importance: row.importance,
      createdAt: new Date(row.created_at),
      lastAccessed: new Date(row.last_accessed),
      accessCount: row.access_count,
    };
  }

  private getCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM memories');
    return (stmt.get() as any).count;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
