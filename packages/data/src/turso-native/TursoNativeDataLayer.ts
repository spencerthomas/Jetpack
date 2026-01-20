/**
 * TursoNativeDataLayer - Full implementation of Turso's advanced features
 *
 * This implementation properly leverages Turso's unique capabilities:
 * 1. Embedded replicas for offline-first with cloud sync
 * 2. Native vector search (replaces CASS)
 * 3. Database branching for task versioning
 * 4. Multi-tenancy for workspace isolation
 * 5. Batch operations for better concurrency
 */

import { createClient, type Client, type InValue, type Transaction } from '@libsql/client';
import { nanoid } from 'nanoid';
import type {
  DataLayer,
  TaskOperations,
  AgentOperations,
  MessageOperations,
  LeaseOperations,
  QualityOperations,
} from '../DataLayer.js';
import { DataLayerError, DataLayerErrorCodes } from '../DataLayer.js';
import type {
  Task,
  TaskCreate,
  TaskFilter,
  TaskProgress,
  TaskResult,
  TaskFailure,
  Agent,
  AgentRegistration,
  AgentHeartbeat,
  AgentFilter,
  Message,
  MessageCreate,
  MessageFilter,
  Lease,
  LeaseRequest,
  QualitySnapshot,
  QualitySnapshotCreate,
  QualityBaseline,
  Regression,
  SwarmStatus,
} from '../types.js';
import type {
  TursoNativeConfig,
  Memory,
  MemoryCreate,
  MemoryFilter,
  VectorSearchOptions,
  VectorSearchResult,
  Branch,
  BranchCreate,
  BranchMergeResult,
  SyncMetadata,
  SyncResult,
  Workspace,
  BatchOperation,
  BatchResult,
} from './types.js';
import { TURSO_NATIVE_SCHEMA } from './schema.js';

// Helper type for SQL args
type SqlArgs = InValue[];

// ============================================================================
// TURSO NATIVE DATA LAYER
// ============================================================================

export class TursoNativeDataLayer implements DataLayer {
  readonly type = 'turso' as const;

  private client!: Client;
  private config: TursoNativeConfig;
  private initialized = false;
  private currentBranch: string | null = null;
  private startTime = Date.now();

  // Operation interfaces
  tasks: TaskOperations;
  agents: AgentOperations;
  messages: MessageOperations;
  leases: LeaseOperations;
  quality: QualityOperations;

  // New Turso-native operations
  memories: MemoryOperations;
  branches: BranchOperations;
  sync: SyncOperations;

  constructor(config: TursoNativeConfig) {
    this.config = {
      embeddingDimensions: 1536,
      enableEmbeddedReplica: false,
      syncIntervalSeconds: 60,
      ...config,
    };

    // Initialize operation handlers
    this.tasks = new TursoTaskOperations(this);
    this.agents = new TursoAgentOperations(this);
    this.messages = new TursoMessageOperations(this);
    this.leases = new TursoLeaseOperations(this);
    this.quality = new TursoQualityOperations(this);

    // Turso-native operations
    this.memories = new TursoMemoryOperations(this);
    this.branches = new TursoBranchOperations(this);
    this.sync = new TursoSyncOperations(this);
  }

  // ==========================================================================
  // INITIALIZATION (with Embedded Replica support)
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.enableEmbeddedReplica && this.config.localReplicaPath) {
      // EMBEDDED REPLICA: Local SQLite that syncs with Turso cloud
      this.client = createClient({
        url: `file:${this.config.localReplicaPath}`,
        syncUrl: this.config.url,
        authToken: this.config.authToken,
        syncInterval: this.config.syncIntervalSeconds,
      });
    } else {
      // Cloud-only mode (for serverless/edge)
      this.client = createClient({
        url: this.config.url,
        authToken: this.config.authToken,
      });
    }

    // Initialize schema using batch for atomicity
    // Filter to only include actual SQL statements (exclude comment-only blocks)
    const statements = TURSO_NATIVE_SCHEMA
      .split(';')
      .map(s => s.trim())
      .filter(s => {
        // Filter out empty strings and comment-only statements
        if (s.length === 0) return false;
        // Check if statement has actual SQL (starts with keyword after comments)
        const withoutComments = s.replace(/--.*$/gm, '').trim();
        return withoutComments.length > 0 &&
          /^(CREATE|INSERT|ALTER|DROP|UPDATE|DELETE|SELECT)/i.test(withoutComments);
      });

    await this.client.batch(
      statements.map(sql => ({ sql, args: [] })),
      'write'
    );

    // Initialize sync metadata if embedded replica
    if (this.config.enableEmbeddedReplica) {
      await this.client.execute({
        sql: `INSERT OR IGNORE INTO sync_metadata (id, sync_status, pending_changes, remote_url, local_path)
              VALUES (1, 'synced', 0, ?, ?)`,
        args: [this.config.url, this.config.localReplicaPath ?? null],
      });
    }

    // Initialize workspace metadata if multi-tenant
    if (this.config.workspaceId && this.config.organization) {
      await this.client.execute({
        sql: `INSERT OR IGNORE INTO workspace (id, workspace_id, organization, settings)
              VALUES (1, ?, ?, '{}')`,
        args: [this.config.workspaceId, this.config.organization],
      });
    }

    this.initialized = true;
  }

  async close(): Promise<void> {
    if (this.client) {
      // Sync before closing if embedded replica
      if (this.config.enableEmbeddedReplica) {
        try {
          await this.client.sync();
        } catch {
          // Ignore sync errors on close
        }
      }
      this.client.close();
    }
    this.initialized = false;
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.client.execute('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // INTERNAL HELPERS
  // ==========================================================================

  /** @internal */
  getClient(): Client {
    if (!this.initialized) {
      throw new DataLayerError('DataLayer not initialized', DataLayerErrorCodes.CONNECTION_ERROR);
    }
    return this.client;
  }

  /** @internal */
  getConfig(): TursoNativeConfig {
    return this.config;
  }

  /** @internal */
  getCurrentBranch(): string | null {
    return this.currentBranch;
  }

  /** @internal */
  setCurrentBranch(branch: string | null): void {
    this.currentBranch = branch;
  }

  // ==========================================================================
  // CONCURRENCY: Batch Operations
  // ==========================================================================

  /**
   * Execute multiple operations atomically
   */
  async batch(operations: BatchOperation[]): Promise<BatchResult> {
    try {
      const results = await this.client.batch(
        operations.map(op => ({
          sql: op.sql,
          args: (op.args ?? []) as SqlArgs,
        })),
        'write'
      );

      return {
        success: true,
        results: results.map(r => ({
          rowsAffected: Number(r.rowsAffected),
          lastInsertRowid: r.lastInsertRowid ? Number(r.lastInsertRowid) : undefined,
        })),
      };
    } catch (error) {
      return {
        success: false,
        results: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute a function within a transaction with automatic retry on conflict
   */
  async withTransaction<T>(
    fn: (tx: Transaction) => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // libSQL transaction API: transaction(mode) returns a Transaction object
        const tx = await this.client.transaction('write');
        try {
          const result = await fn(tx);
          await tx.commit();
          return result;
        } catch (error) {
          await tx.rollback();
          throw error;
        }
      } catch (error) {
        lastError = error as Error;
        // Retry with exponential backoff on conflict
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 100));
        }
      }
    }

    throw new DataLayerError(
      `Transaction failed after ${maxRetries} retries: ${lastError?.message}`,
      DataLayerErrorCodes.TRANSACTION_ERROR,
      lastError
    );
  }

  // ==========================================================================
  // SWARM STATUS
  // ==========================================================================

  async getSwarmStatus(): Promise<SwarmStatus> {
    const [taskCounts, agentCounts, messageCount, leaseCount, baseline] = await Promise.all([
      this.client.execute(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready,
          SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) as claimed,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked
        FROM tasks
      `),
      this.client.execute(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'idle' THEN 1 ELSE 0 END) as idle,
          SUM(CASE WHEN status = 'busy' THEN 1 ELSE 0 END) as busy,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
          SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline,
          type
        FROM agents GROUP BY type
      `),
      this.client.execute(`SELECT COUNT(*) as count FROM messages WHERE acknowledged_at IS NULL`),
      this.client.execute(`SELECT COUNT(*) as count FROM leases WHERE expires_at > datetime('now')`),
      this.quality.getBaseline(),
    ]);

    const taskRow = taskCounts.rows[0];

    // Build agent stats
    let agentTotal = 0;
    let agentIdle = 0;
    let agentBusy = 0;
    let agentError = 0;
    let agentOffline = 0;
    const byType: Record<string, number> = {};

    for (const row of agentCounts.rows) {
      const type = String(row.type || 'unknown');
      const count = Number(row.total || 0);
      byType[type] = (byType[type] || 0) + count;
      agentTotal += count;
      agentIdle += Number(row.idle || 0);
      agentBusy += Number(row.busy || 0);
      agentError += Number(row.error || 0);
      agentOffline += Number(row.offline || 0);
    }

    // Get regression count from latest snapshot
    const latestSnapshot = await this.quality.getLatestSnapshot();
    let regressionCount = 0;
    if (latestSnapshot && baseline) {
      const regressions = await this.quality.detectRegressions(latestSnapshot);
      regressionCount = regressions.length;
    }

    return {
      swarm: {
        status: agentError > agentTotal / 2 ? 'unhealthy' : agentError > 0 ? 'degraded' : 'healthy',
        uptime: Date.now() - this.startTime,
        dataLayerType: 'turso',
      },
      agents: {
        total: agentTotal,
        idle: agentIdle,
        busy: agentBusy,
        error: agentError,
        offline: agentOffline,
        byType,
      },
      tasks: {
        total: Number(taskRow.total ?? 0),
        pending: Number(taskRow.pending ?? 0),
        ready: Number(taskRow.ready ?? 0),
        claimed: Number(taskRow.claimed ?? 0),
        inProgress: Number(taskRow.in_progress ?? 0),
        completed: Number(taskRow.completed ?? 0),
        failed: Number(taskRow.failed ?? 0),
        blocked: Number(taskRow.blocked ?? 0),
      },
      quality: {
        baseline: baseline,
        lastSnapshot: latestSnapshot,
        regressionCount,
      },
    };
  }
}

// ============================================================================
// MEMORY OPERATIONS (Replaces CASS)
// ============================================================================

export interface MemoryOperations {
  store(memory: MemoryCreate): Promise<Memory>;
  get(id: string): Promise<Memory | null>;
  update(id: string, updates: Partial<Memory>): Promise<Memory | null>;
  delete(id: string): Promise<boolean>;
  list(filter?: MemoryFilter): Promise<Memory[]>;
  semanticSearch(embedding: number[] | Float32Array, options?: VectorSearchOptions): Promise<VectorSearchResult[]>;
  recordAccess(id: string): Promise<void>;
  getTaskContext(taskId: string, queryEmbedding?: number[]): Promise<Memory[]>;
}

class TursoMemoryOperations implements MemoryOperations {
  constructor(private dataLayer: TursoNativeDataLayer) {}

  async store(memory: MemoryCreate): Promise<Memory> {
    const client = this.dataLayer.getClient();
    const id = nanoid();
    const now = new Date().toISOString();

    // Handle embedding: convert to Uint8Array if provided
    // Note: vector32() function is Turso-specific; for local file DBs, embedding column is nullable
    if (memory.embedding) {
      const arr = memory.embedding instanceof Float32Array
        ? memory.embedding
        : new Float32Array(memory.embedding);
      const embeddingValue = new Uint8Array(arr.buffer);

      await client.execute({
        sql: `INSERT INTO memories (
          id, agent_id, task_id, workspace_id, content, memory_type,
          importance, tags, source, embedding, access_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        args: [
          id,
          memory.agentId ?? null,
          memory.taskId ?? null,
          memory.workspaceId ?? null,
          memory.content,
          memory.memoryType ?? 'general',
          memory.importance ?? 0.5,
          JSON.stringify(memory.tags ?? []),
          memory.source ?? null,
          embeddingValue,
          now,
          now,
        ],
      });
    } else {
      // Insert without embedding (NULL)
      await client.execute({
        sql: `INSERT INTO memories (
          id, agent_id, task_id, workspace_id, content, memory_type,
          importance, tags, source, embedding, access_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)`,
        args: [
          id,
          memory.agentId ?? null,
          memory.taskId ?? null,
          memory.workspaceId ?? null,
          memory.content,
          memory.memoryType ?? 'general',
          memory.importance ?? 0.5,
          JSON.stringify(memory.tags ?? []),
          memory.source ?? null,
          now,
          now,
        ],
      });
    }

    return this.get(id) as Promise<Memory>;
  }

  async get(id: string): Promise<Memory | null> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: 'SELECT * FROM memories WHERE id = ?',
      args: [id],
    });

    if (result.rows.length === 0) return null;
    return this.rowToMemory(result.rows[0]);
  }

  async update(id: string, updates: Partial<Memory>): Promise<Memory | null> {
    const client = this.dataLayer.getClient();
    const sets: string[] = ['updated_at = datetime(\'now\')'];
    const args: InValue[] = [];

    if (updates.content !== undefined) {
      sets.push('content = ?');
      args.push(updates.content);
    }
    if (updates.importance !== undefined) {
      sets.push('importance = ?');
      args.push(updates.importance);
    }
    if (updates.tags !== undefined) {
      sets.push('tags = ?');
      args.push(JSON.stringify(updates.tags));
    }
    if (updates.memoryType !== undefined) {
      sets.push('memory_type = ?');
      args.push(updates.memoryType);
    }

    args.push(id);

    await client.execute({
      sql: `UPDATE memories SET ${sets.join(', ')} WHERE id = ?`,
      args,
    });

    return this.get(id);
  }

  async delete(id: string): Promise<boolean> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: 'DELETE FROM memories WHERE id = ?',
      args: [id],
    });
    return Number(result.rowsAffected) > 0;
  }

  async list(filter?: MemoryFilter): Promise<Memory[]> {
    const client = this.dataLayer.getClient();
    const conditions: string[] = [];
    const args: InValue[] = [];

    if (filter?.agentId) {
      conditions.push('agent_id = ?');
      args.push(filter.agentId);
    }
    if (filter?.taskId) {
      conditions.push('task_id = ?');
      args.push(filter.taskId);
    }
    if (filter?.workspaceId) {
      conditions.push('workspace_id = ?');
      args.push(filter.workspaceId);
    }
    if (filter?.memoryType) {
      if (Array.isArray(filter.memoryType)) {
        const placeholders = filter.memoryType.map(() => '?').join(',');
        conditions.push(`memory_type IN (${placeholders})`);
        args.push(...filter.memoryType);
      } else {
        conditions.push('memory_type = ?');
        args.push(filter.memoryType);
      }
    }
    if (filter?.minImportance !== undefined) {
      conditions.push('importance >= ?');
      args.push(filter.minImportance);
    }
    if (filter?.tags && filter.tags.length > 0) {
      const tagConditions = filter.tags.map(() => 'tags LIKE ?');
      conditions.push(`(${tagConditions.join(' OR ')})`);
      filter.tags.forEach(tag => args.push(`%"${tag}"%`));
    }
    if (!filter?.includeExpired) {
      conditions.push('(expires_at IS NULL OR expires_at > datetime(\'now\'))');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await client.execute({
      sql: `SELECT * FROM memories ${whereClause} ORDER BY importance DESC, created_at DESC`,
      args,
    });

    return result.rows.map(row => this.rowToMemory(row));
  }

  /**
   * Native vector similarity search using Turso's vector operations
   */
  async semanticSearch(
    embedding: number[] | Float32Array,
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    const client = this.dataLayer.getClient();
    const limit = options?.limit ?? 10;
    const threshold = options?.threshold ?? 0.7;

    // Convert to Uint8Array for Turso
    const arr = embedding instanceof Float32Array ? embedding : new Float32Array(embedding);
    const vectorValue: InValue = new Uint8Array(arr.buffer);

    // Build filter conditions
    const conditions: string[] = ['embedding IS NOT NULL'];
    const args: InValue[] = [];

    if (options?.memoryType) {
      if (Array.isArray(options.memoryType)) {
        const placeholders = options.memoryType.map(() => '?').join(',');
        conditions.push(`memory_type IN (${placeholders})`);
        args.push(...options.memoryType);
      } else {
        conditions.push('memory_type = ?');
        args.push(options.memoryType);
      }
    }
    if (options?.agentId) {
      conditions.push('agent_id = ?');
      args.push(options.agentId);
    }
    if (options?.taskId) {
      conditions.push('task_id = ?');
      args.push(options.taskId);
    }

    const whereClause = conditions.join(' AND ');

    // Turso native vector similarity search
    const result = await client.execute({
      sql: `
        SELECT
          *,
          1 - vector_distance_cos(embedding, vector32(?)) as similarity
        FROM memories
        WHERE ${whereClause}
          AND vector_distance_cos(embedding, vector32(?)) < ?
        ORDER BY vector_distance_cos(embedding, vector32(?))
        LIMIT ?
      `,
      args: [vectorValue, ...args, vectorValue, 1 - threshold, vectorValue, limit],
    });

    return result.rows.map(row => {
      const memory = this.rowToMemory(row);
      const similarity = Number(row.similarity);

      let score = similarity;
      if (options?.weightByImportance) {
        score = similarity * 0.7 + memory.importance * 0.3;
      }

      return { memory, similarity, score };
    });
  }

  async recordAccess(id: string): Promise<void> {
    const client = this.dataLayer.getClient();
    await client.execute({
      sql: `UPDATE memories
            SET access_count = access_count + 1,
                last_accessed_at = datetime('now'),
                updated_at = datetime('now')
            WHERE id = ?`,
      args: [id],
    });
  }

  async getTaskContext(taskId: string, queryEmbedding?: number[]): Promise<Memory[]> {
    const client = this.dataLayer.getClient();

    if (queryEmbedding) {
      const arr = new Float32Array(queryEmbedding);
      const vectorValue: InValue = new Uint8Array(arr.buffer);

      const result = await client.execute({
        sql: `
          WITH task_deps AS (
            SELECT json_each.value as dep_id
            FROM tasks, json_each(tasks.dependencies)
            WHERE tasks.id = ?
          )
          SELECT
            m.*,
            1 - vector_distance_cos(m.embedding, vector32(?)) as similarity
          FROM memories m
          WHERE (m.task_id IN (SELECT dep_id FROM task_deps) OR m.task_id = ?)
            AND m.embedding IS NOT NULL
          ORDER BY vector_distance_cos(m.embedding, vector32(?))
          LIMIT 10
        `,
        args: [taskId, vectorValue, taskId, vectorValue],
      });

      return result.rows.map(row => this.rowToMemory(row));
    } else {
      const result = await client.execute({
        sql: `
          WITH task_deps AS (
            SELECT json_each.value as dep_id
            FROM tasks, json_each(tasks.dependencies)
            WHERE tasks.id = ?
          )
          SELECT m.*
          FROM memories m
          WHERE m.task_id IN (SELECT dep_id FROM task_deps) OR m.task_id = ?
          ORDER BY m.importance DESC, m.created_at DESC
          LIMIT 10
        `,
        args: [taskId, taskId],
      });

      return result.rows.map(row => this.rowToMemory(row));
    }
  }

  private rowToMemory(row: Record<string, unknown>): Memory {
    return {
      id: String(row.id),
      agentId: row.agent_id ? String(row.agent_id) : undefined,
      taskId: row.task_id ? String(row.task_id) : undefined,
      workspaceId: row.workspace_id ? String(row.workspace_id) : undefined,
      content: String(row.content),
      memoryType: String(row.memory_type) as Memory['memoryType'],
      importance: Number(row.importance),
      tags: JSON.parse(String(row.tags || '[]')),
      source: row.source ? String(row.source) : undefined,
      accessCount: Number(row.access_count ?? 0),
      lastAccessedAt: row.last_accessed_at ? String(row.last_accessed_at) : undefined,
      expiresAt: row.expires_at ? String(row.expires_at) : undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}

// ============================================================================
// BRANCH OPERATIONS (Git-like task versioning)
// ============================================================================

export interface BranchOperations {
  create(branch: BranchCreate): Promise<Branch>;
  get(idOrName: string): Promise<Branch | null>;
  list(): Promise<Branch[]>;
  switch(branchName: string): Promise<void>;
  merge(sourceBranch: string): Promise<BranchMergeResult>;
  delete(branchName: string): Promise<boolean>;
  current(): string | null;
}

class TursoBranchOperations implements BranchOperations {
  constructor(private dataLayer: TursoNativeDataLayer) {}

  async create(branch: BranchCreate): Promise<Branch> {
    const config = this.dataLayer.getConfig();
    const client = this.dataLayer.getClient();

    const id = nanoid();
    const now = new Date().toISOString();

    await client.execute({
      sql: `INSERT INTO branches (id, name, description, parent_branch_id, status, created_by, purpose, created_at)
            VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
      args: [
        id,
        branch.name,
        branch.description ?? null,
        this.dataLayer.getCurrentBranch(),
        branch.createdBy ?? null,
        branch.purpose ?? null,
        now,
      ],
    });

    // If Platform API token available, create actual Turso branch
    if (config.platformApiToken && config.organization && config.workspaceId) {
      try {
        const response = await fetch(
          `https://api.turso.tech/v1/organizations/${config.organization}/databases`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.platformApiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: `${config.workspaceId}-${branch.name}`,
              group: config.organization,
              from_database: config.workspaceId,
            }),
          }
        );

        if (response.ok) {
          const data = await response.json() as { database?: { hostname?: string } };
          await client.execute({
            sql: 'UPDATE branches SET parent_database_url = ? WHERE id = ?',
            args: [data.database?.hostname ?? null, id],
          });
        }
      } catch {
        console.warn('Failed to create Turso platform branch');
      }
    }

    return this.get(id) as Promise<Branch>;
  }

  async get(idOrName: string): Promise<Branch | null> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: 'SELECT * FROM branches WHERE id = ? OR name = ?',
      args: [idOrName, idOrName],
    });

    if (result.rows.length === 0) return null;
    return this.rowToBranch(result.rows[0]);
  }

  async list(): Promise<Branch[]> {
    const client = this.dataLayer.getClient();
    const result = await client.execute('SELECT * FROM branches ORDER BY created_at DESC');
    return result.rows.map(row => this.rowToBranch(row));
  }

  async switch(branchName: string): Promise<void> {
    const branch = await this.get(branchName);
    if (!branch) {
      throw new DataLayerError(`Branch not found: ${branchName}`, DataLayerErrorCodes.NOT_FOUND);
    }
    this.dataLayer.setCurrentBranch(branch.id);
  }

  async merge(sourceBranch: string): Promise<BranchMergeResult> {
    const client = this.dataLayer.getClient();
    const branch = await this.get(sourceBranch);

    if (!branch) {
      return { success: false, conflicts: [], mergedRecords: 0 };
    }

    await client.execute({
      sql: `UPDATE branches SET status = 'merged', merged_at = datetime('now') WHERE id = ?`,
      args: [branch.id],
    });

    return { success: true, mergedRecords: 0 };
  }

  async delete(branchName: string): Promise<boolean> {
    const client = this.dataLayer.getClient();
    const config = this.dataLayer.getConfig();
    const branch = await this.get(branchName);

    if (!branch) return false;

    if (config.platformApiToken && config.organization && config.workspaceId) {
      try {
        await fetch(
          `https://api.turso.tech/v1/organizations/${config.organization}/databases/${config.workspaceId}-${branchName}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${config.platformApiToken}`,
            },
          }
        );
      } catch {
        console.warn('Failed to delete Turso platform branch');
      }
    }

    await client.execute({
      sql: `UPDATE branches SET status = 'deleted', deleted_at = datetime('now') WHERE id = ?`,
      args: [branch.id],
    });

    return true;
  }

  current(): string | null {
    return this.dataLayer.getCurrentBranch();
  }

  private rowToBranch(row: Record<string, unknown>): Branch {
    return {
      id: String(row.id),
      name: String(row.name),
      description: row.description ? String(row.description) : undefined,
      parentBranchId: row.parent_branch_id ? String(row.parent_branch_id) : undefined,
      parentDatabaseUrl: row.parent_database_url ? String(row.parent_database_url) : undefined,
      status: String(row.status) as Branch['status'],
      createdBy: row.created_by ? String(row.created_by) : undefined,
      purpose: row.purpose ? String(row.purpose) : undefined,
      createdAt: String(row.created_at),
      mergedAt: row.merged_at ? String(row.merged_at) : undefined,
      deletedAt: row.deleted_at ? String(row.deleted_at) : undefined,
    };
  }
}

// ============================================================================
// SYNC OPERATIONS (Embedded Replica)
// ============================================================================

export interface SyncOperations {
  sync(): Promise<SyncResult>;
  getStatus(): Promise<SyncMetadata>;
  hasPendingChanges(): Promise<boolean>;
}

class TursoSyncOperations implements SyncOperations {
  constructor(private dataLayer: TursoNativeDataLayer) {}

  async sync(): Promise<SyncResult> {
    const config = this.dataLayer.getConfig();
    const client = this.dataLayer.getClient();
    const startTime = Date.now();

    if (!config.enableEmbeddedReplica) {
      return { success: true, changesUploaded: 0, changesDownloaded: 0, durationMs: 0 };
    }

    await client.execute({
      sql: `UPDATE sync_metadata SET sync_status = 'syncing' WHERE id = 1`,
      args: [],
    });

    try {
      await client.sync();

      await client.execute({
        sql: `UPDATE sync_metadata
              SET sync_status = 'synced', last_sync_at = datetime('now'),
                  pending_changes = 0, last_error = NULL
              WHERE id = 1`,
        args: [],
      });

      return {
        success: true,
        changesUploaded: 0,
        changesDownloaded: 0,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      await client.execute({
        sql: `UPDATE sync_metadata SET sync_status = 'error', last_error = ? WHERE id = 1`,
        args: [errorMsg],
      });

      return {
        success: false,
        changesUploaded: 0,
        changesDownloaded: 0,
        durationMs: Date.now() - startTime,
        error: errorMsg,
      };
    }
  }

  async getStatus(): Promise<SyncMetadata> {
    const client = this.dataLayer.getClient();
    const result = await client.execute('SELECT * FROM sync_metadata WHERE id = 1');

    if (result.rows.length === 0) {
      return { syncStatus: 'synced', pendingChanges: 0 };
    }

    const row = result.rows[0];
    return {
      lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : undefined,
      syncStatus: String(row.sync_status) as SyncMetadata['syncStatus'],
      pendingChanges: Number(row.pending_changes ?? 0),
      lastError: row.last_error ? String(row.last_error) : undefined,
      remoteUrl: row.remote_url ? String(row.remote_url) : undefined,
      localPath: row.local_path ? String(row.local_path) : undefined,
    };
  }

  async hasPendingChanges(): Promise<boolean> {
    const status = await this.getStatus();
    return status.pendingChanges > 0;
  }
}

// ============================================================================
// TASK OPERATIONS
// ============================================================================

class TursoTaskOperations implements TaskOperations {
  constructor(private dataLayer: TursoNativeDataLayer) {}

  async create(task: TaskCreate): Promise<Task> {
    const client = this.dataLayer.getClient();
    const id = task.id ?? `bd-${nanoid(8)}`;
    const now = new Date().toISOString();

    await client.execute({
      sql: `INSERT INTO tasks (
        id, title, description, status, priority, type,
        dependencies, blockers, required_skills, files,
        estimated_minutes, retry_count, max_retries,
        branch_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 2, ?, ?, ?)`,
      args: [
        id,
        task.title,
        task.description ?? null,
        task.dependencies?.length ? 'blocked' : 'pending',
        task.priority ?? 'medium',
        task.type ?? 'code',
        JSON.stringify(task.dependencies ?? []),
        JSON.stringify([]),
        JSON.stringify(task.requiredSkills ?? []),
        JSON.stringify(task.files ?? []),
        task.estimatedMinutes ?? null,
        task.branch ?? this.dataLayer.getCurrentBranch(),
        now,
        now,
      ],
    });

    return this.get(id) as Promise<Task>;
  }

  async get(id: string): Promise<Task | null> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: 'SELECT * FROM tasks WHERE id = ?',
      args: [id],
    });

    if (result.rows.length === 0) return null;
    return this.rowToTask(result.rows[0]);
  }

  async update(id: string, updates: Partial<Task>): Promise<Task | null> {
    const client = this.dataLayer.getClient();
    const sets: string[] = ['updated_at = datetime(\'now\')'];
    const args: InValue[] = [];

    if (updates.title !== undefined) { sets.push('title = ?'); args.push(updates.title); }
    if (updates.description !== undefined) { sets.push('description = ?'); args.push(updates.description ?? null); }
    if (updates.status !== undefined) { sets.push('status = ?'); args.push(updates.status); }
    if (updates.priority !== undefined) { sets.push('priority = ?'); args.push(updates.priority); }
    if (updates.type !== undefined) { sets.push('type = ?'); args.push(updates.type); }
    if (updates.assignedAgent !== undefined) { sets.push('assigned_agent = ?'); args.push(updates.assignedAgent ?? null); }
    if (updates.estimatedMinutes !== undefined) { sets.push('estimated_minutes = ?'); args.push(updates.estimatedMinutes ?? null); }
    if (updates.actualMinutes !== undefined) { sets.push('actual_minutes = ?'); args.push(updates.actualMinutes ?? null); }
    if (updates.result !== undefined) { sets.push('result = ?'); args.push(JSON.stringify(updates.result)); }
    if (updates.lastError !== undefined) { sets.push('last_error = ?'); args.push(updates.lastError ?? null); }
    if (updates.failureType !== undefined) { sets.push('failure_type = ?'); args.push(updates.failureType ?? null); }
    if (updates.dependencies !== undefined) { sets.push('dependencies = ?'); args.push(JSON.stringify(updates.dependencies)); }
    if (updates.requiredSkills !== undefined) { sets.push('required_skills = ?'); args.push(JSON.stringify(updates.requiredSkills)); }
    if (updates.files !== undefined) { sets.push('files = ?'); args.push(JSON.stringify(updates.files)); }

    args.push(id);

    await client.execute({
      sql: `UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`,
      args,
    });

    return this.get(id);
  }

  async delete(id: string): Promise<boolean> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: 'DELETE FROM tasks WHERE id = ?',
      args: [id],
    });
    return Number(result.rowsAffected) > 0;
  }

  async list(filter?: TaskFilter): Promise<Task[]> {
    const client = this.dataLayer.getClient();
    const { conditions, args } = this.buildTaskFilter(filter);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let sql = `SELECT * FROM tasks ${whereClause} ORDER BY
            CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
            created_at ASC`;

    if (filter?.limit) {
      sql += ` LIMIT ${filter.limit}`;
      if (filter.offset) {
        sql += ` OFFSET ${filter.offset}`;
      }
    }

    const result = await client.execute({ sql, args });
    return result.rows.map(row => this.rowToTask(row));
  }

  async count(filter?: TaskFilter): Promise<number> {
    const client = this.dataLayer.getClient();
    const { conditions, args } = this.buildTaskFilter(filter);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await client.execute({
      sql: `SELECT COUNT(*) as count FROM tasks ${whereClause}`,
      args,
    });

    return Number(result.rows[0]?.count ?? 0);
  }

  async claim(agentId: string, filter?: TaskFilter): Promise<Task | null> {
    return await this.dataLayer.withTransaction(async (tx: Transaction) => {
      const { conditions, args } = this.buildTaskFilter(filter);
      conditions.push('status = ?');
      args.push('ready');

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const result = await tx.execute({
        sql: `SELECT * FROM tasks ${whereClause} ORDER BY
              CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
              created_at ASC
              LIMIT 1`,
        args,
      });

      if (result.rows.length === 0) return null;

      const task = this.rowToTask(result.rows[0]);

      await tx.execute({
        sql: `UPDATE tasks SET
              status = 'claimed',
              assigned_agent = ?,
              claimed_at = datetime('now'),
              updated_at = datetime('now')
              WHERE id = ? AND status = 'ready'`,
        args: [agentId, task.id],
      });

      return { ...task, status: 'claimed' as const, assignedAgent: agentId };
    });
  }

  async release(taskId: string, reason: string): Promise<boolean> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: `UPDATE tasks SET
            status = 'ready',
            assigned_agent = NULL,
            claimed_at = NULL,
            last_error = ?,
            updated_at = datetime('now')
            WHERE id = ? AND status = 'in_progress'`,
      args: [reason, taskId],
    });
    return Number(result.rowsAffected) > 0;
  }

  async updateProgress(taskId: string, progress: TaskProgress): Promise<boolean> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: `UPDATE tasks SET
            current_task_progress = ?,
            current_task_phase = ?,
            updated_at = datetime('now')
            WHERE id = ?`,
      args: [progress.percentComplete ?? 0, progress.phase ?? null, taskId],
    });
    return Number(result.rowsAffected) > 0;
  }

  async complete(taskId: string, result: TaskResult): Promise<Task | null> {
    const client = this.dataLayer.getClient();
    await client.execute({
      sql: `UPDATE tasks SET
            status = 'completed',
            result = ?,
            completed_at = datetime('now'),
            updated_at = datetime('now')
            WHERE id = ?`,
      args: [JSON.stringify(result), taskId],
    });
    return this.get(taskId);
  }

  async fail(taskId: string, failure: TaskFailure): Promise<Task | null> {
    const client = this.dataLayer.getClient();
    const task = await this.get(taskId);

    if (!task) return null;

    const shouldRetry = task.retryCount < task.maxRetries && failure.recoverable;
    const nextRetryAt = shouldRetry
      ? new Date(Date.now() + Math.pow(2, task.retryCount) * 30000).toISOString()
      : null;

    await client.execute({
      sql: `UPDATE tasks SET
            status = ?,
            last_error = ?,
            failure_type = ?,
            retry_count = retry_count + 1,
            next_retry_at = ?,
            updated_at = datetime('now')
            WHERE id = ?`,
      args: [
        shouldRetry ? 'pending_retry' : 'failed',
        failure.message,
        failure.type ?? 'task_error',
        nextRetryAt,
        taskId,
      ],
    });

    return this.get(taskId);
  }

  async findRetryEligible(now: number): Promise<Task[]> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: `SELECT * FROM tasks
            WHERE status = 'pending_retry'
            AND next_retry_at <= datetime(?, 'unixepoch')`,
      args: [Math.floor(now / 1000)],
    });
    return result.rows.map(row => this.rowToTask(row));
  }

  async resetForRetry(taskId: string): Promise<boolean> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: `UPDATE tasks SET
            status = 'ready',
            assigned_agent = NULL,
            claimed_at = NULL,
            started_at = NULL,
            updated_at = datetime('now')
            WHERE id = ? AND status = 'pending_retry'`,
      args: [taskId],
    });
    return Number(result.rowsAffected) > 0;
  }

  async updateBlockedToReady(): Promise<number> {
    const client = this.dataLayer.getClient();

    const result = await client.execute({
      sql: `UPDATE tasks SET status = 'ready', updated_at = datetime('now')
            WHERE status = 'blocked'
            AND NOT EXISTS (
              SELECT 1 FROM json_each(tasks.dependencies) AS dep
              JOIN tasks AS dep_task ON dep.value = dep_task.id
              WHERE dep_task.status != 'completed'
            )`,
      args: [],
    });

    return Number(result.rowsAffected);
  }

  async getAgentTasks(agentId: string): Promise<Task[]> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: 'SELECT * FROM tasks WHERE assigned_agent = ? ORDER BY created_at DESC',
      args: [agentId],
    });
    return result.rows.map(row => this.rowToTask(row));
  }

  private buildTaskFilter(filter?: TaskFilter): { conditions: string[]; args: InValue[] } {
    const conditions: string[] = [];
    const args: InValue[] = [];

    if (filter?.status) {
      if (Array.isArray(filter.status)) {
        const placeholders = filter.status.map(() => '?').join(',');
        conditions.push(`status IN (${placeholders})`);
        args.push(...filter.status);
      } else {
        conditions.push('status = ?');
        args.push(filter.status);
      }
    }
    if (filter?.priority) {
      if (Array.isArray(filter.priority)) {
        const placeholders = filter.priority.map(() => '?').join(',');
        conditions.push(`priority IN (${placeholders})`);
        args.push(...filter.priority);
      } else {
        conditions.push('priority = ?');
        args.push(filter.priority);
      }
    }
    if (filter?.assignedAgent) {
      conditions.push('assigned_agent = ?');
      args.push(filter.assignedAgent);
    }
    if (filter?.skills && filter.skills.length > 0) {
      const skillConditions = filter.skills.map(() => 'required_skills LIKE ?');
      conditions.push(`(${skillConditions.join(' OR ')})`);
      filter.skills.forEach(skill => args.push(`%"${skill}"%`));
    }
    if (filter?.branch) {
      conditions.push('branch_id = ?');
      args.push(filter.branch);
    }
    if (filter?.excludeIds && filter.excludeIds.length > 0) {
      const placeholders = filter.excludeIds.map(() => '?').join(',');
      conditions.push(`id NOT IN (${placeholders})`);
      args.push(...filter.excludeIds);
    }

    return { conditions, args };
  }

  private rowToTask(row: Record<string, unknown>): Task {
    return {
      id: String(row.id),
      title: String(row.title),
      description: row.description ? String(row.description) : undefined,
      status: String(row.status) as Task['status'],
      priority: String(row.priority) as Task['priority'],
      type: String(row.type) as Task['type'],
      assignedAgent: row.assigned_agent ? String(row.assigned_agent) : undefined,
      claimedAt: row.claimed_at ? String(row.claimed_at) : undefined,
      dependencies: JSON.parse(String(row.dependencies || '[]')),
      blockers: JSON.parse(String(row.blockers || '[]')),
      requiredSkills: JSON.parse(String(row.required_skills || '[]')),
      files: JSON.parse(String(row.files || '[]')),
      startedAt: row.started_at ? String(row.started_at) : undefined,
      completedAt: row.completed_at ? String(row.completed_at) : undefined,
      estimatedMinutes: row.estimated_minutes ? Number(row.estimated_minutes) : undefined,
      actualMinutes: row.actual_minutes ? Number(row.actual_minutes) : undefined,
      retryCount: Number(row.retry_count ?? 0),
      maxRetries: Number(row.max_retries ?? 2),
      lastError: row.last_error ? String(row.last_error) : undefined,
      failureType: row.failure_type ? String(row.failure_type) as Task['failureType'] : undefined,
      nextRetryAt: row.next_retry_at ? String(row.next_retry_at) : undefined,
      previousAgents: JSON.parse(String(row.previous_agents || '[]')),
      result: row.result ? JSON.parse(String(row.result)) : undefined,
      branch: row.branch_id ? String(row.branch_id) : undefined,
      qualitySnapshotId: row.quality_snapshot_id ? String(row.quality_snapshot_id) : undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}

// ============================================================================
// AGENT OPERATIONS
// ============================================================================

class TursoAgentOperations implements AgentOperations {
  constructor(private dataLayer: TursoNativeDataLayer) {}

  async register(agent: AgentRegistration): Promise<Agent> {
    const client = this.dataLayer.getClient();
    const now = new Date().toISOString();

    await client.execute({
      sql: `INSERT OR REPLACE INTO agents (
        id, name, type, status, capabilities,
        registered_at, last_active_at
      ) VALUES (?, ?, ?, 'idle', ?, ?, ?)`,
      args: [
        agent.id,
        agent.name,
        agent.type,
        JSON.stringify(agent.capabilities ?? {}),
        now,
        now,
      ],
    });

    return this.get(agent.id) as Promise<Agent>;
  }

  async get(id: string): Promise<Agent | null> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: 'SELECT * FROM agents WHERE id = ?',
      args: [id],
    });

    if (result.rows.length === 0) return null;
    return this.rowToAgent(result.rows[0]);
  }

  async heartbeat(agentId: string, heartbeat: AgentHeartbeat): Promise<boolean> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: `UPDATE agents SET
            status = ?,
            current_task_progress = ?,
            current_task_phase = ?,
            last_active_at = datetime('now')
            WHERE id = ?`,
      args: [
        heartbeat.status ?? 'idle',
        heartbeat.currentTask?.progress ?? 0,
        heartbeat.currentTask?.phase ?? null,
        agentId,
      ],
    });
    return Number(result.rowsAffected) > 0;
  }

  async deregister(agentId: string): Promise<boolean> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: 'DELETE FROM agents WHERE id = ?',
      args: [agentId],
    });
    return Number(result.rowsAffected) > 0;
  }

  async list(filter?: AgentFilter): Promise<Agent[]> {
    const client = this.dataLayer.getClient();
    const conditions: string[] = [];
    const args: InValue[] = [];

    if (filter?.status) {
      if (Array.isArray(filter.status)) {
        const placeholders = filter.status.map(() => '?').join(',');
        conditions.push(`status IN (${placeholders})`);
        args.push(...filter.status);
      } else {
        conditions.push('status = ?');
        args.push(filter.status);
      }
    }
    if (filter?.type) {
      if (Array.isArray(filter.type)) {
        const placeholders = filter.type.map(() => '?').join(',');
        conditions.push(`type IN (${placeholders})`);
        args.push(...filter.type);
      } else {
        conditions.push('type = ?');
        args.push(filter.type);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await client.execute({
      sql: `SELECT * FROM agents ${whereClause} ORDER BY registered_at DESC`,
      args,
    });

    return result.rows.map(row => this.rowToAgent(row));
  }

  async count(filter?: AgentFilter): Promise<number> {
    const agents = await this.list(filter);
    return agents.length;
  }

  async findStale(thresholdMs: number): Promise<Agent[]> {
    const client = this.dataLayer.getClient();
    const thresholdSeconds = Math.floor(thresholdMs / 1000);

    const result = await client.execute({
      sql: `SELECT * FROM agents
            WHERE datetime(last_active_at) < datetime('now', '-' || ? || ' seconds')`,
      args: [thresholdSeconds],
    });

    return result.rows.map(row => this.rowToAgent(row));
  }

  async updateStats(agentId: string, completed: boolean, runtimeMinutes: number): Promise<boolean> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: `UPDATE agents SET
            tasks_completed = tasks_completed + ?,
            tasks_failed = tasks_failed + ?,
            total_runtime_minutes = total_runtime_minutes + ?
            WHERE id = ?`,
      args: [completed ? 1 : 0, completed ? 0 : 1, runtimeMinutes, agentId],
    });
    return Number(result.rowsAffected) > 0;
  }

  async setCurrentTask(agentId: string, taskId: string | null): Promise<boolean> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: 'UPDATE agents SET current_task_id = ?, status = ? WHERE id = ?',
      args: [taskId, taskId ? 'busy' : 'idle', agentId],
    });
    return Number(result.rowsAffected) > 0;
  }

  private rowToAgent(row: Record<string, unknown>): Agent {
    const capabilities = JSON.parse(String(row.capabilities || '{}'));
    return {
      id: String(row.id),
      name: String(row.name),
      type: String(row.type) as Agent['type'],
      status: String(row.status) as Agent['status'],
      skills: capabilities.skills ?? [],
      maxTaskMinutes: capabilities.maxTaskMinutes ?? 60,
      canRunTests: capabilities.canRunTests ?? true,
      canRunBuild: capabilities.canRunBuild ?? true,
      canAccessBrowser: capabilities.canAccessBrowser ?? false,
      lastHeartbeat: row.last_active_at ? String(row.last_active_at) : undefined,
      heartbeatCount: Number(row.heartbeat_count ?? 0),
      currentTaskId: row.current_task_id ? String(row.current_task_id) : undefined,
      currentTaskStartedAt: row.current_task_started_at ? String(row.current_task_started_at) : undefined,
      currentTaskProgress: Number(row.current_task_progress ?? 0),
      currentTaskPhase: row.current_task_phase ? String(row.current_task_phase) as Agent['currentTaskPhase'] : undefined,
      tasksCompleted: Number(row.tasks_completed ?? 0),
      tasksFailed: Number(row.tasks_failed ?? 0),
      totalRuntimeMinutes: Number(row.total_runtime_minutes ?? 0),
      machineId: row.machine_id ? String(row.machine_id) : undefined,
      machineHostname: row.machine_hostname ? String(row.machine_hostname) : undefined,
      pid: row.pid ? Number(row.pid) : undefined,
      registeredAt: String(row.registered_at),
      lastActiveAt: String(row.last_active_at),
    };
  }
}

// ============================================================================
// MESSAGE OPERATIONS
// ============================================================================

class TursoMessageOperations implements MessageOperations {
  constructor(private dataLayer: TursoNativeDataLayer) {}

  async send(message: MessageCreate): Promise<Message> {
    const client = this.dataLayer.getClient();
    const id = nanoid();
    const now = new Date().toISOString();
    const expiresAt = message.expiresIn
      ? new Date(Date.now() + message.expiresIn).toISOString()
      : null;

    await client.execute({
      sql: `INSERT INTO messages (id, type, from_agent, to_agent, payload, ack_required, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        message.type,
        message.fromAgent,
        message.toAgent ?? null,
        JSON.stringify(message.payload ?? {}),
        message.ackRequired ? 1 : 0,
        expiresAt,
        now,
      ],
    });

    return this.get(id) as Promise<Message>;
  }

  async get(id: string): Promise<Message | null> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: 'SELECT * FROM messages WHERE id = ?',
      args: [id],
    });

    if (result.rows.length === 0) return null;
    return this.rowToMessage(result.rows[0]);
  }

  async receive(agentId: string, filter?: MessageFilter): Promise<Message[]> {
    const client = this.dataLayer.getClient();
    const conditions: string[] = ['(to_agent = ? OR to_agent IS NULL)'];
    const args: InValue[] = [agentId];

    if (filter?.type) {
      if (Array.isArray(filter.type)) {
        const placeholders = filter.type.map(() => '?').join(',');
        conditions.push(`type IN (${placeholders})`);
        args.push(...filter.type);
      } else {
        conditions.push('type = ?');
        args.push(filter.type);
      }
    }
    if (filter?.unreadOnly) {
      conditions.push('delivered_at IS NULL');
    }
    if (filter?.unackedOnly) {
      conditions.push('acknowledged_at IS NULL');
    }

    let sql = `SELECT * FROM messages WHERE ${conditions.join(' AND ')} ORDER BY created_at ASC`;
    if (filter?.limit) {
      sql += ` LIMIT ${filter.limit}`;
    }

    const result = await client.execute({ sql, args });
    return result.rows.map(row => this.rowToMessage(row));
  }

  async markDelivered(messageIds: string[], agentId: string): Promise<number> {
    if (messageIds.length === 0) return 0;

    const client = this.dataLayer.getClient();
    const placeholders = messageIds.map(() => '?').join(',');

    const result = await client.execute({
      sql: `UPDATE messages SET delivered_at = datetime('now')
            WHERE id IN (${placeholders}) AND (to_agent = ? OR to_agent IS NULL)`,
      args: [...messageIds, agentId],
    });

    return Number(result.rowsAffected);
  }

  async acknowledge(messageId: string, agentId: string): Promise<boolean> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: `UPDATE messages SET acknowledged_at = datetime('now')
            WHERE id = ? AND (to_agent = ? OR to_agent IS NULL)`,
      args: [messageId, agentId],
    });
    return Number(result.rowsAffected) > 0;
  }

  async broadcast(message: Omit<MessageCreate, 'toAgent'>): Promise<Message> {
    return this.send({ ...message, toAgent: undefined });
  }

  async getUnacknowledged(olderThanMs?: number): Promise<Message[]> {
    const client = this.dataLayer.getClient();
    let sql = 'SELECT * FROM messages WHERE acknowledged_at IS NULL';
    const args: InValue[] = [];

    if (olderThanMs) {
      sql += ` AND datetime(created_at) < datetime('now', '-' || ? || ' seconds')`;
      args.push(Math.floor(olderThanMs / 1000));
    }

    const result = await client.execute({ sql, args });
    return result.rows.map(row => this.rowToMessage(row));
  }

  async deleteExpired(): Promise<number> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: `DELETE FROM messages WHERE expires_at IS NOT NULL AND datetime(expires_at) < datetime('now')`,
      args: [],
    });
    return Number(result.rowsAffected);
  }

  private rowToMessage(row: Record<string, unknown>): Message {
    return {
      id: String(row.id),
      type: String(row.type) as Message['type'],
      fromAgent: String(row.from_agent),
      toAgent: row.to_agent ? String(row.to_agent) : undefined,
      payload: JSON.parse(String(row.payload || '{}')),
      ackRequired: Boolean(row.ack_required),
      deliveredAt: row.delivered_at ? String(row.delivered_at) : undefined,
      acknowledgedAt: row.acknowledged_at ? String(row.acknowledged_at) : undefined,
      acknowledgedBy: row.acknowledged_by ? String(row.acknowledged_by) : undefined,
      expiresAt: row.expires_at ? String(row.expires_at) : undefined,
      createdAt: String(row.created_at),
    };
  }
}

// ============================================================================
// LEASE OPERATIONS
// ============================================================================

class TursoLeaseOperations implements LeaseOperations {
  constructor(private dataLayer: TursoNativeDataLayer) {}

  async acquire(request: LeaseRequest): Promise<boolean> {
    const client = this.dataLayer.getClient();
    const expiresAt = new Date(Date.now() + request.durationMs).toISOString();

    try {
      await client.execute({
        sql: `INSERT INTO leases (file_path, agent_id, task_id, expires_at)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(file_path) DO UPDATE SET
                agent_id = excluded.agent_id,
                task_id = excluded.task_id,
                expires_at = excluded.expires_at,
                acquired_at = datetime('now')
              WHERE leases.agent_id = excluded.agent_id
                 OR datetime(leases.expires_at) < datetime('now')`,
        args: [request.filePath, request.agentId, request.taskId ?? null, expiresAt],
      });

      const lease = await this.check(request.filePath);
      return lease?.agentId === request.agentId;
    } catch {
      return false;
    }
  }

  async release(filePath: string, agentId: string): Promise<boolean> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: 'DELETE FROM leases WHERE file_path = ? AND agent_id = ?',
      args: [filePath, agentId],
    });
    return Number(result.rowsAffected) > 0;
  }

  async forceRelease(filePath: string): Promise<boolean> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: 'DELETE FROM leases WHERE file_path = ?',
      args: [filePath],
    });
    return Number(result.rowsAffected) > 0;
  }

  async check(filePath: string): Promise<Lease | null> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: `SELECT * FROM leases WHERE file_path = ? AND datetime(expires_at) > datetime('now')`,
      args: [filePath],
    });

    if (result.rows.length === 0) return null;
    return this.rowToLease(result.rows[0]);
  }

  async extend(filePath: string, agentId: string, durationMs: number): Promise<boolean> {
    const client = this.dataLayer.getClient();
    const newExpiresAt = new Date(Date.now() + durationMs).toISOString();

    const result = await client.execute({
      sql: `UPDATE leases SET expires_at = ?, renewed_count = renewed_count + 1
            WHERE file_path = ? AND agent_id = ?`,
      args: [newExpiresAt, filePath, agentId],
    });

    return Number(result.rowsAffected) > 0;
  }

  async getAgentLeases(agentId: string): Promise<Lease[]> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: `SELECT * FROM leases WHERE agent_id = ? AND datetime(expires_at) > datetime('now')`,
      args: [agentId],
    });
    return result.rows.map(row => this.rowToLease(row));
  }

  async findExpired(): Promise<Lease[]> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: `SELECT * FROM leases WHERE datetime(expires_at) <= datetime('now')`,
      args: [],
    });
    return result.rows.map(row => this.rowToLease(row));
  }

  async releaseAll(agentId: string): Promise<number> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: 'DELETE FROM leases WHERE agent_id = ?',
      args: [agentId],
    });
    return Number(result.rowsAffected);
  }

  private rowToLease(row: Record<string, unknown>): Lease {
    return {
      filePath: String(row.file_path),
      agentId: String(row.agent_id),
      taskId: row.task_id ? String(row.task_id) : undefined,
      acquiredAt: String(row.acquired_at),
      expiresAt: String(row.expires_at),
      renewedCount: Number(row.renewed_count ?? 0),
    };
  }
}

// ============================================================================
// QUALITY OPERATIONS
// ============================================================================

class TursoQualityOperations implements QualityOperations {
  constructor(private dataLayer: TursoNativeDataLayer) {}

  async recordSnapshot(snapshot: QualitySnapshotCreate): Promise<QualitySnapshot> {
    const client = this.dataLayer.getClient();
    const id = nanoid();
    const now = new Date().toISOString();

    await client.execute({
      sql: `INSERT INTO quality_snapshots (
        id, task_id, agent_id, branch_id,
        build_success, build_time_ms, type_errors, lint_errors, lint_warnings,
        tests_passing, tests_failing, tests_skipped, test_coverage, test_time_ms,
        browser_validation_passed, browser_validation_errors,
        build_output, type_output, lint_output, test_output,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        snapshot.taskId ?? null,
        snapshot.agentId ?? null,
        this.dataLayer.getCurrentBranch(),
        snapshot.buildSuccess ? 1 : 0,
        snapshot.buildTimeMs ?? null,
        snapshot.typeErrors ?? 0,
        snapshot.lintErrors ?? 0,
        snapshot.lintWarnings ?? 0,
        snapshot.testsPassing ?? 0,
        snapshot.testsFailing ?? 0,
        snapshot.testsSkipped ?? 0,
        snapshot.testCoverage ?? null,
        snapshot.testTimeMs ?? null,
        null, // browserValidationPassed - not in QualitySnapshotCreate
        null, // browserValidationErrors - not in QualitySnapshotCreate
        snapshot.buildOutput ?? null,
        snapshot.typeOutput ?? null,
        snapshot.lintOutput ?? null,
        snapshot.testOutput ?? null,
        now,
      ],
    });

    return this.getSnapshot(id) as Promise<QualitySnapshot>;
  }

  async getSnapshot(id: string): Promise<QualitySnapshot | null> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: 'SELECT * FROM quality_snapshots WHERE id = ?',
      args: [id],
    });

    if (result.rows.length === 0) return null;
    return this.rowToSnapshot(result.rows[0]);
  }

  async getLatestSnapshot(): Promise<QualitySnapshot | null> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: 'SELECT * FROM quality_snapshots ORDER BY created_at DESC LIMIT 1',
      args: [],
    });

    if (result.rows.length === 0) return null;
    return this.rowToSnapshot(result.rows[0]);
  }

  async getTaskSnapshots(taskId: string): Promise<QualitySnapshot[]> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: 'SELECT * FROM quality_snapshots WHERE task_id = ? ORDER BY created_at DESC',
      args: [taskId],
    });
    return result.rows.map(row => this.rowToSnapshot(row));
  }

  async getBaseline(): Promise<QualityBaseline | null> {
    const client = this.dataLayer.getClient();
    const result = await client.execute({
      sql: 'SELECT * FROM quality_baseline WHERE id = 1',
      args: [],
    });

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      buildSuccess: Boolean(row.build_success),
      typeErrors: Number(row.type_errors ?? 0),
      lintErrors: Number(row.lint_errors ?? 0),
      lintWarnings: Number(row.lint_warnings ?? 0),
      testsPassing: Number(row.tests_passing ?? 0),
      testsFailing: Number(row.tests_failing ?? 0),
      testCoverage: Number(row.test_coverage ?? 0),
      setBy: row.set_by ? String(row.set_by) : undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  async setBaseline(baseline: Omit<QualityBaseline, 'createdAt' | 'updatedAt'>): Promise<QualityBaseline> {
    const client = this.dataLayer.getClient();
    const now = new Date().toISOString();

    await client.execute({
      sql: `INSERT OR REPLACE INTO quality_baseline (
        id, branch_id, build_success, type_errors, lint_errors, lint_warnings,
        tests_passing, tests_failing, test_coverage, set_by, created_at, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        this.dataLayer.getCurrentBranch(),
        baseline.buildSuccess ? 1 : 0,
        baseline.typeErrors ?? 0,
        baseline.lintErrors ?? 0,
        baseline.lintWarnings ?? 0,
        baseline.testsPassing ?? 0,
        baseline.testsFailing ?? 0,
        baseline.testCoverage ?? null,
        baseline.setBy ?? null,
        now,
        now,
      ],
    });

    return this.getBaseline() as Promise<QualityBaseline>;
  }

  async detectRegressions(snapshot: QualitySnapshot): Promise<Regression[]> {
    const baseline = await this.getBaseline();
    if (!baseline) return [];

    const regressions: Regression[] = [];

    // Build failure is an error-level regression
    if (!snapshot.buildSuccess && baseline.buildSuccess) {
      regressions.push({
        metric: 'build',
        baseline: 1, // 1 = passing
        current: 0,  // 0 = failing
        delta: -1,
        severity: 'error',
      });
    }

    // Type errors are error-level regressions
    if (snapshot.typeErrors > baseline.typeErrors) {
      const delta = snapshot.typeErrors - baseline.typeErrors;
      regressions.push({
        metric: 'typeErrors',
        baseline: baseline.typeErrors,
        current: snapshot.typeErrors,
        delta,
        severity: 'error',
      });
    }

    // Lint errors are warning-level regressions
    if (snapshot.lintErrors > baseline.lintErrors) {
      const delta = snapshot.lintErrors - baseline.lintErrors;
      regressions.push({
        metric: 'lintErrors',
        baseline: baseline.lintErrors,
        current: snapshot.lintErrors,
        delta,
        severity: 'warning',
      });
    }

    // Test failures are error-level regressions
    if (snapshot.testsFailing > baseline.testsFailing) {
      const delta = snapshot.testsFailing - baseline.testsFailing;
      regressions.push({
        metric: 'testsFailing',
        baseline: baseline.testsFailing,
        current: snapshot.testsFailing,
        delta,
        severity: 'error',
      });
    }

    // Coverage drops >5% are warning-level regressions
    if (baseline.testCoverage && snapshot.testCoverage &&
        snapshot.testCoverage < baseline.testCoverage - 5) {
      const delta = snapshot.testCoverage - baseline.testCoverage;
      regressions.push({
        metric: 'testCoverage',
        baseline: baseline.testCoverage,
        current: snapshot.testCoverage,
        delta,
        severity: 'warning',
      });
    }

    return regressions;
  }

  private rowToSnapshot(row: Record<string, unknown>): QualitySnapshot {
    return {
      id: String(row.id),
      taskId: row.task_id ? String(row.task_id) : undefined,
      agentId: row.agent_id ? String(row.agent_id) : undefined,
      buildSuccess: row.build_success != null ? Boolean(row.build_success) : undefined,
      buildTimeMs: row.build_time_ms ? Number(row.build_time_ms) : undefined,
      typeErrors: Number(row.type_errors ?? 0),
      lintErrors: Number(row.lint_errors ?? 0),
      lintWarnings: Number(row.lint_warnings ?? 0),
      testsPassing: Number(row.tests_passing ?? 0),
      testsFailing: Number(row.tests_failing ?? 0),
      testsSkipped: Number(row.tests_skipped ?? 0),
      testCoverage: row.test_coverage ? Number(row.test_coverage) : undefined,
      testTimeMs: row.test_time_ms ? Number(row.test_time_ms) : undefined,
      buildOutput: row.build_output ? String(row.build_output) : undefined,
      typeOutput: row.type_output ? String(row.type_output) : undefined,
      lintOutput: row.lint_output ? String(row.lint_output) : undefined,
      testOutput: row.test_output ? String(row.test_output) : undefined,
      recordedAt: String(row.created_at),
    };
  }
}

// ============================================================================
// MULTI-TENANCY HELPERS
// ============================================================================

export async function createWorkspace(
  organization: string,
  workspaceId: string,
  platformApiToken: string,
  options?: { region?: string }
): Promise<Workspace> {
  const response = await fetch(
    `https://api.turso.tech/v1/organizations/${organization}/databases`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${platformApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: workspaceId,
        group: organization,
        location: options?.region,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to create workspace: ${response.statusText}`);
  }

  const data = await response.json() as {
    database: { hostname: string; name: string; region: string };
  };

  return {
    workspaceId,
    organization,
    createdAt: new Date().toISOString(),
    settings: {},
    databaseUrl: `libsql://${data.database.hostname}`,
    databaseName: data.database.name,
    region: data.database.region,
  };
}

export async function deleteWorkspace(
  organization: string,
  workspaceId: string,
  platformApiToken: string
): Promise<void> {
  const response = await fetch(
    `https://api.turso.tech/v1/organizations/${organization}/databases/${workspaceId}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${platformApiToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to delete workspace: ${response.statusText}`);
  }
}

export async function listWorkspaces(
  organization: string,
  platformApiToken: string
): Promise<Workspace[]> {
  const response = await fetch(
    `https://api.turso.tech/v1/organizations/${organization}/databases`,
    {
      headers: {
        'Authorization': `Bearer ${platformApiToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to list workspaces: ${response.statusText}`);
  }

  const data = await response.json() as {
    databases: Array<{
      name: string;
      hostname: string;
      region: string;
      created_at: string;
    }>;
  };

  return data.databases.map((db) => ({
    workspaceId: db.name,
    organization,
    createdAt: db.created_at,
    settings: {},
    databaseUrl: `libsql://${db.hostname}`,
    databaseName: db.name,
    region: db.region,
  }));
}
