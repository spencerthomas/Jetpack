import * as path from 'path';
import Database from 'better-sqlite3';
import { MemoryEntry, MemoryType, MemoryStore, Logger } from '@jetpack/shared';
import * as crypto from 'crypto';
import { EmbeddingGenerator, EmbeddingConfig, createEmbeddingGenerator } from './EmbeddingGenerator';

export interface CASSConfig {
  cassDir: string;
  compactionThreshold: number; // 0-1, importance below this gets compacted
  maxEntries: number; // Max entries before forcing compaction
  /** Enable automatic embedding generation when storing memories */
  autoGenerateEmbeddings?: boolean;
  /** Configuration for embedding generation */
  embeddingConfig?: EmbeddingConfig;
}

export class CASSAdapter implements MemoryStore {
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
        this.logger.info('Embedding generator initialized');
      } else if (this.autoGenerateEmbeddings) {
        this.logger.warn('Auto-embedding enabled but no API key found. Set OPENAI_API_KEY.');
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

  async store(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessed' | 'accessCount'>): Promise<string> {
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
    // For semantic search, we'd normally use vector similarity (cosine, dot product)
    // Here's a simple implementation that computes cosine similarity
    const allStmt = this.db.prepare('SELECT * FROM memories WHERE embedding IS NOT NULL');
    const rows = allStmt.all() as any[];

    const results = rows.map(row => {
      const storedEmbedding = JSON.parse(row.embedding) as number[];
      const similarity = this.cosineSimilarity(embedding, storedEmbedding);
      return { row, similarity };
    });

    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, limit).map(r => this.rowToMemoryEntry(r.row));
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

  async getStats(): Promise<{
    total: number;
    byType: Record<MemoryType, number>;
    avgImportance: number;
    totalAccesses: number;
  }> {
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

    return {
      total,
      byType: byType as Record<MemoryType, number>,
      avgImportance: avgRow.avg || 0,
      totalAccesses: avgRow.total_accesses || 0,
    };
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
