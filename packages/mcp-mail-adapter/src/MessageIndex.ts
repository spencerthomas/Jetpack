import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { Message, MessageType, Logger } from '@jetpack-agent/shared';

export interface MessageSearchFilters {
  type?: MessageType | MessageType[];
  from?: string;
  to?: string;
  since?: Date;
  until?: Date;
  correlationId?: string;
}

export interface SearchResult {
  messages: Message[];
  total: number;
  offset: number;
  limit: number;
}

export interface MessageIndexConfig {
  /** Directory to store the index database */
  indexDir: string;
  /** Database filename (default: messages.db) */
  dbFilename?: string;
}

/**
 * SQLite-based message index with FTS5 full-text search support.
 * Provides efficient message search and filtering capabilities.
 */
export class MessageIndex {
  private db: DatabaseType;
  private logger: Logger;

  constructor(config: MessageIndexConfig) {
    this.logger = new Logger('MessageIndex');

    // Ensure directory exists
    fs.mkdirSync(config.indexDir, { recursive: true });

    const dbPath = path.join(config.indexDir, config.dbFilename ?? 'messages.db');
    this.db = new Database(dbPath);

    this.initializeSchema();
    this.logger.info(`Message index initialized at ${dbPath}`);
  }

  private initializeSchema(): void {
    // Main messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        from_agent TEXT NOT NULL,
        to_agent TEXT,
        payload TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        correlation_id TEXT,
        indexed_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for common queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);
      CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_agent);
      CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_agent);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_messages_correlation ON messages(correlation_id);
    `);

    // FTS5 virtual table for full-text search (standalone, not content-synced)
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        message_id,
        payload_text
      )
    `);

    // Triggers to keep FTS index in sync with main table
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(message_id, payload_text)
        VALUES (NEW.id, NEW.payload);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
        DELETE FROM messages_fts WHERE message_id = OLD.id;
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
        DELETE FROM messages_fts WHERE message_id = OLD.id;
        INSERT INTO messages_fts(message_id, payload_text)
        VALUES (NEW.id, NEW.payload);
      END
    `);

    this.logger.debug('Database schema initialized');
  }

  /**
   * Index a message for searching
   */
  async index(message: Message): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages (id, type, from_agent, to_agent, payload, timestamp, correlation_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      message.id,
      message.type,
      message.from,
      message.to ?? null,
      JSON.stringify(message.payload),
      message.timestamp.toISOString(),
      message.correlationId ?? null
    );

    this.logger.debug(`Indexed message: ${message.id}`);
  }

  /**
   * Index multiple messages at once (more efficient for batch operations)
   */
  async indexBatch(messages: Message[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages (id, type, from_agent, to_agent, payload, timestamp, correlation_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((msgs: Message[]) => {
      for (const msg of msgs) {
        stmt.run(
          msg.id,
          msg.type,
          msg.from,
          msg.to ?? null,
          JSON.stringify(msg.payload),
          msg.timestamp.toISOString(),
          msg.correlationId ?? null
        );
      }
    });

    insertMany(messages);
    this.logger.debug(`Indexed ${messages.length} messages in batch`);
  }

  /**
   * Full-text search across message content
   */
  search(
    query: string,
    filters: MessageSearchFilters = {},
    limit: number = 50,
    offset: number = 0
  ): SearchResult {
    const conditions: string[] = [];
    const params: unknown[] = [];

    // Full-text search condition
    if (query && query.trim()) {
      conditions.push('fts.payload_text MATCH ?');
      // Escape special FTS characters and wrap in quotes for phrase search
      const escapedQuery = query.replace(/['"]/g, '');
      params.push(escapedQuery);
    }

    // Type filter
    if (filters.type) {
      if (Array.isArray(filters.type)) {
        conditions.push(`m.type IN (${filters.type.map(() => '?').join(', ')})`);
        params.push(...filters.type);
      } else {
        conditions.push('m.type = ?');
        params.push(filters.type);
      }
    }

    // From filter
    if (filters.from) {
      conditions.push('m.from_agent = ?');
      params.push(filters.from);
    }

    // To filter
    if (filters.to) {
      conditions.push('m.to_agent = ?');
      params.push(filters.to);
    }

    // Date range filters
    if (filters.since) {
      conditions.push('m.timestamp >= ?');
      params.push(filters.since.toISOString());
    }
    if (filters.until) {
      conditions.push('m.timestamp <= ?');
      params.push(filters.until.toISOString());
    }

    // Correlation ID filter
    if (filters.correlationId) {
      conditions.push('m.correlation_id = ?');
      params.push(filters.correlationId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Build the query based on whether we have a full-text search
    let baseQuery: string;
    if (query && query.trim()) {
      baseQuery = `
        FROM messages m
        INNER JOIN messages_fts fts ON m.id = fts.message_id
        ${whereClause}
      `;
    } else {
      baseQuery = `
        FROM messages m
        ${whereClause}
      `;
    }

    // Get total count
    const countStmt = this.db.prepare(`SELECT COUNT(*) as count ${baseQuery}`);
    const countResult = countStmt.get(...params) as { count: number };
    const total = countResult.count;

    // Get paginated results
    const selectStmt = this.db.prepare(`
      SELECT m.id, m.type, m.from_agent, m.to_agent, m.payload, m.timestamp, m.correlation_id
      ${baseQuery}
      ORDER BY m.timestamp DESC
      LIMIT ? OFFSET ?
    `);

    const rows = selectStmt.all(...params, limit, offset) as Array<{
      id: string;
      type: MessageType;
      from_agent: string;
      to_agent: string | null;
      payload: string;
      timestamp: string;
      correlation_id: string | null;
    }>;

    const messages = rows.map((row) => ({
      id: row.id,
      type: row.type,
      from: row.from_agent,
      to: row.to_agent ?? undefined,
      payload: JSON.parse(row.payload),
      timestamp: new Date(row.timestamp),
      correlationId: row.correlation_id ?? undefined,
    }));

    return { messages, total, offset, limit };
  }

  /**
   * Get a message by ID
   */
  getById(id: string): Message | null {
    const stmt = this.db.prepare(`
      SELECT id, type, from_agent, to_agent, payload, timestamp, correlation_id
      FROM messages
      WHERE id = ?
    `);

    const row = stmt.get(id) as {
      id: string;
      type: MessageType;
      from_agent: string;
      to_agent: string | null;
      payload: string;
      timestamp: string;
      correlation_id: string | null;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      type: row.type,
      from: row.from_agent,
      to: row.to_agent ?? undefined,
      payload: JSON.parse(row.payload),
      timestamp: new Date(row.timestamp),
      correlationId: row.correlation_id ?? undefined,
    };
  }

  /**
   * Get messages by correlation ID (thread)
   */
  getThread(correlationId: string): Message[] {
    const stmt = this.db.prepare(`
      SELECT id, type, from_agent, to_agent, payload, timestamp, correlation_id
      FROM messages
      WHERE correlation_id = ? OR id = ?
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all(correlationId, correlationId) as Array<{
      id: string;
      type: MessageType;
      from_agent: string;
      to_agent: string | null;
      payload: string;
      timestamp: string;
      correlation_id: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      from: row.from_agent,
      to: row.to_agent ?? undefined,
      payload: JSON.parse(row.payload),
      timestamp: new Date(row.timestamp),
      correlationId: row.correlation_id ?? undefined,
    }));
  }

  /**
   * Get recent messages
   */
  getRecent(limit: number = 50): Message[] {
    const stmt = this.db.prepare(`
      SELECT id, type, from_agent, to_agent, payload, timestamp, correlation_id
      FROM messages
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as Array<{
      id: string;
      type: MessageType;
      from_agent: string;
      to_agent: string | null;
      payload: string;
      timestamp: string;
      correlation_id: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      from: row.from_agent,
      to: row.to_agent ?? undefined,
      payload: JSON.parse(row.payload),
      timestamp: new Date(row.timestamp),
      correlationId: row.correlation_id ?? undefined,
    }));
  }

  /**
   * Get message statistics
   */
  getStats(): {
    totalMessages: number;
    messagesByType: Record<string, number>;
    messagesByAgent: Record<string, number>;
    oldestMessage: Date | null;
    newestMessage: Date | null;
  } {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM messages');
    const totalResult = totalStmt.get() as { count: number };

    const byTypeStmt = this.db.prepare(`
      SELECT type, COUNT(*) as count FROM messages GROUP BY type
    `);
    const typeRows = byTypeStmt.all() as Array<{ type: string; count: number }>;
    const messagesByType: Record<string, number> = {};
    for (const row of typeRows) {
      messagesByType[row.type] = row.count;
    }

    const byAgentStmt = this.db.prepare(`
      SELECT from_agent, COUNT(*) as count FROM messages GROUP BY from_agent
    `);
    const agentRows = byAgentStmt.all() as Array<{ from_agent: string; count: number }>;
    const messagesByAgent: Record<string, number> = {};
    for (const row of agentRows) {
      messagesByAgent[row.from_agent] = row.count;
    }

    const rangeStmt = this.db.prepare(`
      SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM messages
    `);
    const rangeResult = rangeStmt.get() as { oldest: string | null; newest: string | null };

    return {
      totalMessages: totalResult.count,
      messagesByType,
      messagesByAgent,
      oldestMessage: rangeResult.oldest ? new Date(rangeResult.oldest) : null,
      newestMessage: rangeResult.newest ? new Date(rangeResult.newest) : null,
    };
  }

  /**
   * Delete old messages
   */
  deleteOlderThan(date: Date): number {
    const stmt = this.db.prepare('DELETE FROM messages WHERE timestamp < ?');
    const result = stmt.run(date.toISOString());
    this.logger.info(`Deleted ${result.changes} messages older than ${date.toISOString()}`);
    return result.changes;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
    this.logger.info('Message index closed');
  }
}

/**
 * Create a new MessageIndex instance
 */
export function createMessageIndex(config: MessageIndexConfig): MessageIndex {
  return new MessageIndex(config);
}
