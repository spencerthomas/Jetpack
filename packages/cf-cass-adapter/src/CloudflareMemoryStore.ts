/**
 * CloudflareMemoryStore - D1+Vectorize-based memory storage for Cloudflare Workers
 *
 * Implements IMemoryStore interface using:
 * - Cloudflare D1 for memory entry storage
 * - Cloudflare Vectorize for embedding storage and similarity search
 *
 * @see docs/HYBRID_ARCHITECTURE.md
 */

import {
  MemoryEntry,
  MemoryType,
  IMemoryStore,
  MemoryInput,
  MemoryStats,
} from '@jetpack-agent/shared';

/**
 * D1 Database binding type
 */
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run(): Promise<D1Result>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
}

export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  error?: string;
  meta?: object;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

/**
 * Vectorize index binding type
 */
export interface VectorizeIndex {
  insert(vectors: VectorizeVector[]): Promise<VectorizeMutationResult>;
  upsert(vectors: VectorizeVector[]): Promise<VectorizeMutationResult>;
  query(
    vector: number[],
    options?: VectorizeQueryOptions
  ): Promise<VectorizeMatches>;
  getByIds(ids: string[]): Promise<VectorizeVector[]>;
  deleteByIds(ids: string[]): Promise<VectorizeMutationResult>;
}

export interface VectorizeVector {
  id: string;
  values: number[];
  metadata?: Record<string, string | number | boolean>;
}

export interface VectorizeQueryOptions {
  topK?: number;
  filter?: Record<string, string | number | boolean | string[]>;
  returnValues?: boolean;
  returnMetadata?: boolean;
}

export interface VectorizeMatches {
  matches: VectorizeMatch[];
  count: number;
}

export interface VectorizeMatch {
  id: string;
  score: number;
  values?: number[];
  metadata?: Record<string, string | number | boolean>;
}

export interface VectorizeMutationResult {
  ids: string[];
  count: number;
}

/**
 * Embedding generator function type
 */
export type EmbeddingGenerator = (text: string) => Promise<number[]>;

export interface CloudflareMemoryStoreConfig {
  db: D1Database;
  vectorize: VectorizeIndex;
  embeddingGenerator?: EmbeddingGenerator;
  maxCapacity?: number;
  compactionThreshold?: number;
}

/**
 * Memory row as stored in D1
 */
interface MemoryRow {
  id: string;
  type: string;
  content: string;
  metadata: string | null;
  importance: number;
  has_embedding: number;
  created_at: number;
  last_accessed: number;
  access_count: number;
}

/**
 * CloudflareMemoryStore - D1+Vectorize implementation of IMemoryStore
 */
export class CloudflareMemoryStore implements IMemoryStore {
  private db: D1Database;
  private vectorize: VectorizeIndex;
  private embeddingGenerator?: EmbeddingGenerator;
  private maxCapacity: number;
  private compactionThreshold: number;

  constructor(config: CloudflareMemoryStoreConfig) {
    this.db = config.db;
    this.vectorize = config.vectorize;
    this.embeddingGenerator = config.embeddingGenerator;
    this.maxCapacity = config.maxCapacity ?? 10000;
    this.compactionThreshold = config.compactionThreshold ?? 0.8;
  }

  async initialize(): Promise<void> {
    // Create tables if they don't exist
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        importance REAL DEFAULT 0.5,
        has_embedding INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_accessed INTEGER NOT NULL,
        access_count INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
      CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);
      CREATE INDEX IF NOT EXISTS idx_memories_last_accessed ON memories(last_accessed);
    `);
  }

  close(): void {
    // D1 connections are managed by the Workers runtime
  }

  async store(entry: MemoryInput): Promise<string> {
    const now = Date.now();
    const id = this.generateMemoryId();

    // Check if we need to compact before storing
    const count = await this.getCount();
    if (count >= this.maxCapacity * this.compactionThreshold) {
      await this.adaptiveCompact();
    }

    // Store in D1
    await this.db
      .prepare(
        `
      INSERT INTO memories (
        id, type, content, metadata, importance,
        has_embedding, created_at, last_accessed, access_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .bind(
        id,
        entry.type,
        entry.content,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.importance ?? 0.5,
        entry.embedding ? 1 : 0,
        now,
        now,
        0
      )
      .run();

    // Store embedding in Vectorize if provided
    if (entry.embedding && entry.embedding.length > 0) {
      await this.vectorize.insert([
        {
          id,
          values: entry.embedding,
          metadata: {
            type: entry.type,
            importance: entry.importance ?? 0.5,
          },
        },
      ]);
    } else if (this.embeddingGenerator) {
      // Generate embedding if we have a generator
      try {
        const embedding = await this.embeddingGenerator(entry.content);
        await this.vectorize.insert([
          {
            id,
            values: embedding,
            metadata: {
              type: entry.type,
              importance: entry.importance ?? 0.5,
            },
          },
        ]);
        // Update has_embedding flag
        await this.db
          .prepare('UPDATE memories SET has_embedding = 1 WHERE id = ?')
          .bind(id)
          .run();
      } catch (error) {
        console.error('Failed to generate embedding:', error);
      }
    }

    return id;
  }

  async retrieve(id: string): Promise<MemoryEntry | null> {
    const row = await this.db
      .prepare('SELECT * FROM memories WHERE id = ?')
      .bind(id)
      .first<MemoryRow>();

    if (!row) {
      return null;
    }

    // Update access statistics
    const now = Date.now();
    await this.db
      .prepare(
        `
      UPDATE memories
      SET last_accessed = ?, access_count = access_count + 1
      WHERE id = ?
    `
      )
      .bind(now, id)
      .run();

    // Get embedding from Vectorize if it exists
    let embedding: number[] | undefined;
    if (row.has_embedding) {
      try {
        const vectors = await this.vectorize.getByIds([id]);
        if (vectors.length > 0 && vectors[0].values) {
          embedding = vectors[0].values;
        }
      } catch (error) {
        console.error('Failed to retrieve embedding:', error);
      }
    }

    return this.rowToMemory(row, embedding);
  }

  async delete(id: string): Promise<boolean> {
    // Delete from D1
    const result = await this.db
      .prepare('DELETE FROM memories WHERE id = ?')
      .bind(id)
      .run();

    // Delete from Vectorize
    try {
      await this.vectorize.deleteByIds([id]);
    } catch (error) {
      console.error('Failed to delete from Vectorize:', error);
    }

    return result.success;
  }

  async search(query: string, limit: number = 10): Promise<MemoryEntry[]> {
    // Text search using LIKE (D1 doesn't have full-text search)
    const searchPattern = `%${query}%`;
    const result = await this.db
      .prepare(
        `
      SELECT * FROM memories
      WHERE content LIKE ?
      ORDER BY importance DESC, last_accessed DESC
      LIMIT ?
    `
      )
      .bind(searchPattern, limit)
      .all<MemoryRow>();

    return Promise.all(
      (result.results || []).map((row) => this.rowToMemory(row))
    );
  }

  async semanticSearch(
    embedding: number[],
    limit: number = 10
  ): Promise<MemoryEntry[]> {
    // Query Vectorize for similar vectors
    const matches = await this.vectorize.query(embedding, {
      topK: limit,
      returnMetadata: true,
    });

    if (matches.count === 0) {
      return [];
    }

    // Fetch full entries from D1
    const ids = matches.matches.map((m) => m.id);
    const placeholders = ids.map(() => '?').join(',');
    const result = await this.db
      .prepare(`SELECT * FROM memories WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all<MemoryRow>();

    // Map results preserving the similarity order
    const rowMap = new Map<string, MemoryRow>();
    for (const row of result.results || []) {
      rowMap.set(row.id, row);
    }

    const entries: MemoryEntry[] = [];
    for (const match of matches.matches) {
      const row = rowMap.get(match.id);
      if (row) {
        entries.push(await this.rowToMemory(row));
      }
    }

    return entries;
  }

  async semanticSearchByQuery(
    query: string,
    limit: number = 10
  ): Promise<MemoryEntry[]> {
    if (!this.embeddingGenerator) {
      // Fall back to text search if no embedding generator
      return this.search(query, limit);
    }

    const embedding = await this.embeddingGenerator(query);
    return this.semanticSearch(embedding, limit);
  }

  async compact(threshold: number): Promise<number> {
    // Delete entries below importance threshold
    const result = await this.db
      .prepare(
        `
      SELECT id FROM memories
      WHERE importance < ?
    `
      )
      .bind(threshold)
      .all<{ id: string }>();

    const ids = (result.results || []).map((r) => r.id);
    if (ids.length === 0) {
      return 0;
    }

    // Delete from D1
    const placeholders = ids.map(() => '?').join(',');
    await this.db
      .prepare(`DELETE FROM memories WHERE id IN (${placeholders})`)
      .bind(...ids)
      .run();

    // Delete from Vectorize in batches
    const batchSize = 100;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      try {
        await this.vectorize.deleteByIds(batch);
      } catch (error) {
        console.error('Failed to delete batch from Vectorize:', error);
      }
    }

    return ids.length;
  }

  async adaptiveCompact(): Promise<number> {
    const count = await this.getCount();
    if (count < this.maxCapacity * this.compactionThreshold) {
      return 0;
    }

    // Remove bottom 20% by importance
    const targetRemoval = Math.floor(count * 0.2);

    const result = await this.db
      .prepare(
        `
      SELECT id FROM memories
      ORDER BY importance ASC, access_count ASC, last_accessed ASC
      LIMIT ?
    `
      )
      .bind(targetRemoval)
      .all<{ id: string }>();

    const ids = (result.results || []).map((r) => r.id);
    if (ids.length === 0) {
      return 0;
    }

    // Delete from D1
    const placeholders = ids.map(() => '?').join(',');
    await this.db
      .prepare(`DELETE FROM memories WHERE id IN (${placeholders})`)
      .bind(...ids)
      .run();

    // Delete from Vectorize in batches
    const batchSize = 100;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      try {
        await this.vectorize.deleteByIds(batch);
      } catch (error) {
        console.error('Failed to delete batch from Vectorize:', error);
      }
    }

    return ids.length;
  }

  async updateImportance(id: string, importance: number): Promise<void> {
    const clampedImportance = Math.max(0, Math.min(1, importance));

    await this.db
      .prepare('UPDATE memories SET importance = ? WHERE id = ?')
      .bind(clampedImportance, id)
      .run();

    // Update metadata in Vectorize
    try {
      const vectors = await this.vectorize.getByIds([id]);
      if (vectors.length > 0) {
        await this.vectorize.upsert([
          {
            ...vectors[0],
            metadata: {
              ...vectors[0].metadata,
              importance: clampedImportance,
            },
          },
        ]);
      }
    } catch (error) {
      console.error('Failed to update Vectorize metadata:', error);
    }
  }

  async getByType(type: MemoryType, limit: number = 100): Promise<MemoryEntry[]> {
    const result = await this.db
      .prepare(
        `
      SELECT * FROM memories
      WHERE type = ?
      ORDER BY created_at DESC
      LIMIT ?
    `
      )
      .bind(type, limit)
      .all<MemoryRow>();

    return Promise.all(
      (result.results || []).map((row) => this.rowToMemory(row))
    );
  }

  async getRecentMemories(limit: number = 100): Promise<MemoryEntry[]> {
    const result = await this.db
      .prepare(
        `
      SELECT * FROM memories
      ORDER BY created_at DESC
      LIMIT ?
    `
      )
      .bind(limit)
      .all<MemoryRow>();

    return Promise.all(
      (result.results || []).map((row) => this.rowToMemory(row))
    );
  }

  async getStats(): Promise<MemoryStats> {
    const totalResult = await this.db
      .prepare('SELECT COUNT(*) as count FROM memories')
      .first<{ count: number }>();

    const typeResult = await this.db
      .prepare('SELECT type, COUNT(*) as count FROM memories GROUP BY type')
      .all<{ type: string; count: number }>();

    const avgImportanceResult = await this.db
      .prepare('SELECT AVG(importance) as avg FROM memories')
      .first<{ avg: number }>();

    const totalAccessesResult = await this.db
      .prepare('SELECT SUM(access_count) as total FROM memories')
      .first<{ total: number }>();

    const embeddingResult = await this.db
      .prepare(
        `
      SELECT
        SUM(CASE WHEN has_embedding = 1 THEN 1 ELSE 0 END) as with_embedding,
        SUM(CASE WHEN has_embedding = 0 THEN 1 ELSE 0 END) as without_embedding
      FROM memories
    `
      )
      .first<{ with_embedding: number; without_embedding: number }>();

    const byType: Record<MemoryType, number> = {
      codebase_knowledge: 0,
      agent_learning: 0,
      pattern_recognition: 0,
      conversation_history: 0,
      decision_rationale: 0,
      test_failure_analysis: 0,
      quality_improvement: 0,
      regression_pattern: 0,
      successful_fix: 0,
    };

    for (const row of typeResult.results || []) {
      byType[row.type as MemoryType] = row.count;
    }

    return {
      total: totalResult?.count || 0,
      byType,
      avgImportance: avgImportanceResult?.avg || 0,
      totalAccesses: totalAccessesResult?.total || 0,
      withEmbedding: embeddingResult?.with_embedding || 0,
      withoutEmbedding: embeddingResult?.without_embedding || 0,
    };
  }

  hasEmbeddingGenerator(): boolean {
    return !!this.embeddingGenerator;
  }

  async getEmbeddingStats(): Promise<{
    withEmbedding: number;
    withoutEmbedding: number;
    total: number;
  }> {
    const result = await this.db
      .prepare(
        `
      SELECT
        SUM(CASE WHEN has_embedding = 1 THEN 1 ELSE 0 END) as with_embedding,
        SUM(CASE WHEN has_embedding = 0 THEN 1 ELSE 0 END) as without_embedding,
        COUNT(*) as total
      FROM memories
    `
      )
      .first<{
        with_embedding: number;
        without_embedding: number;
        total: number;
      }>();

    return {
      withEmbedding: result?.with_embedding || 0,
      withoutEmbedding: result?.without_embedding || 0,
      total: result?.total || 0,
    };
  }

  async backfillEmbeddings(batchSize: number = 50): Promise<number> {
    if (!this.embeddingGenerator) {
      return 0;
    }

    const result = await this.db
      .prepare(
        `
      SELECT id, content FROM memories
      WHERE has_embedding = 0
      LIMIT ?
    `
      )
      .bind(batchSize)
      .all<{ id: string; content: string }>();

    const entries = result.results || [];
    let processedCount = 0;

    for (const entry of entries) {
      try {
        const embedding = await this.embeddingGenerator(entry.content);

        await this.vectorize.insert([
          {
            id: entry.id,
            values: embedding,
          },
        ]);

        await this.db
          .prepare('UPDATE memories SET has_embedding = 1 WHERE id = ?')
          .bind(entry.id)
          .run();

        processedCount++;
      } catch (error) {
        console.error(`Failed to backfill embedding for ${entry.id}:`, error);
      }
    }

    return processedCount;
  }

  private async getCount(): Promise<number> {
    const result = await this.db
      .prepare('SELECT COUNT(*) as count FROM memories')
      .first<{ count: number }>();
    return result?.count || 0;
  }

  private generateMemoryId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'mem-';
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private async rowToMemory(
    row: MemoryRow,
    embedding?: number[]
  ): Promise<MemoryEntry> {
    return {
      id: row.id,
      type: row.type as MemoryType,
      content: row.content,
      embedding,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      importance: row.importance,
      createdAt: new Date(row.created_at),
      lastAccessed: new Date(row.last_accessed),
      accessCount: row.access_count,
    };
  }
}
