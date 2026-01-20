/**
 * TursoNativeDataLayer - Properly leverages Turso's advanced features
 * 
 * This is a design document showing how to use Turso's unique capabilities:
 * 1. Embedded replicas for offline-first with cloud sync
 * 2. Native vector search to replace CASS
 * 3. Database branching for task versioning
 * 4. Multi-tenancy for workspace isolation
 */

import { createClient, type Client } from '@libsql/client';

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface TursoNativeConfig {
  /** Organization name for multi-tenancy */
  organization: string;
  /** Workspace/project identifier */
  workspaceId: string;
  /** Turso API token for database management */
  tursoApiToken: string;
  /** Auth token for database access */
  authToken: string;
  /** Enable embedded replica for offline support */
  enableEmbeddedReplica?: boolean;
  /** Local replica path (if embedded replica enabled) */
  localReplicaPath?: string;
  /** Sync interval in seconds (default: 60) */
  syncIntervalSeconds?: number;
  /** Vector dimensions for embeddings (default: 1536 for OpenAI) */
  vectorDimensions?: number;
}

// ============================================================================
// SCHEMA WITH VECTOR SUPPORT
// ============================================================================

const TURSO_NATIVE_SCHEMA = `
-- Tasks table (same as before)
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'ready',
  -- ... other fields
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Agents table (same as before)
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- ... other fields
);

-- NATIVE VECTOR TABLE - Replaces CASS for semantic search!
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  task_id TEXT,
  content TEXT NOT NULL,
  memory_type TEXT DEFAULT 'general',
  importance REAL DEFAULT 0.5,
  
  -- Turso native vector column!
  embedding F32_BLOB(1536),  -- OpenAI embedding dimensions
  
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  accessed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  access_count INTEGER DEFAULT 0,
  
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- Vector index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_memories_vector 
ON memories(libsql_vector_idx(embedding));
`;

// ============================================================================
// TURSO NATIVE DATA LAYER
// ============================================================================

export class TursoNativeDataLayer {
  private client!: Client;
  private config: Required<TursoNativeConfig>;
  private databaseUrl: string;

  constructor(config: TursoNativeConfig) {
    this.config = {
      organization: config.organization,
      workspaceId: config.workspaceId,
      tursoApiToken: config.tursoApiToken,
      authToken: config.authToken,
      enableEmbeddedReplica: config.enableEmbeddedReplica ?? true,
      localReplicaPath: config.localReplicaPath ?? `.turso/${config.workspaceId}.db`,
      syncIntervalSeconds: config.syncIntervalSeconds ?? 60,
      vectorDimensions: config.vectorDimensions ?? 1536,
    };
    
    // Multi-tenancy: each workspace gets its own database
    this.databaseUrl = `libsql://${config.workspaceId}-${config.organization}.turso.io`;
  }

  /**
   * Initialize with embedded replica for offline-first operation
   */
  async initialize(): Promise<void> {
    if (this.config.enableEmbeddedReplica) {
      // EMBEDDED REPLICA: Local SQLite that syncs with Turso cloud
      // - Reads are instant (local)
      // - Writes go local first, then sync to cloud
      // - Works offline, syncs when online
      this.client = createClient({
        url: this.databaseUrl,
        authToken: this.config.authToken,
        
        // This is the magic! Local replica with automatic sync
        syncUrl: `file:${this.config.localReplicaPath}`,
        syncInterval: this.config.syncIntervalSeconds,
      });
    } else {
      // Cloud-only mode (for serverless/edge)
      this.client = createClient({
        url: this.databaseUrl,
        authToken: this.config.authToken,
      });
    }

    await this.client.execute(TURSO_NATIVE_SCHEMA);
  }

  /**
   * Force sync local replica with cloud
   */
  async sync(): Promise<void> {
    if (this.config.enableEmbeddedReplica) {
      await this.client.sync();
    }
  }

  // ==========================================================================
  // NATIVE VECTOR SEARCH (Replaces CASS!)
  // ==========================================================================

  /**
   * Store a memory with vector embedding
   * This replaces CASS's storeEmbedding functionality
   */
  async storeMemory(memory: {
    id: string;
    agentId?: string;
    taskId?: string;
    content: string;
    type: string;
    importance: number;
    embedding: number[];  // Float array from OpenAI/etc
  }): Promise<void> {
    // Convert float array to Turso's vector blob format
    const vectorBlob = new Float32Array(memory.embedding);
    
    await this.client.execute({
      sql: `
        INSERT INTO memories (id, agent_id, task_id, content, memory_type, importance, embedding)
        VALUES (?, ?, ?, ?, ?, ?, vector32(?))
      `,
      args: [
        memory.id,
        memory.agentId ?? null,
        memory.taskId ?? null,
        memory.content,
        memory.type,
        memory.importance,
        vectorBlob,  // Turso handles Float32Array natively
      ],
    });
  }

  /**
   * Semantic search using Turso's native vector operations
   * This replaces CASS's semanticSearch functionality
   * 
   * Benefits over CASS:
   * - No separate vector database needed
   * - Integrated with task/agent data (JOINs work!)
   * - Scales with Turso's infrastructure
   * - Works offline with embedded replica
   */
  async semanticSearch(
    embedding: number[],
    limit: number = 10,
    threshold: number = 0.7
  ): Promise<Array<{
    id: string;
    content: string;
    type: string;
    importance: number;
    similarity: number;
  }>> {
    const vectorBlob = new Float32Array(embedding);
    
    // Turso native vector similarity search!
    const result = await this.client.execute({
      sql: `
        SELECT 
          id,
          content,
          memory_type as type,
          importance,
          1 - vector_distance_cos(embedding, vector32(?)) as similarity
        FROM memories
        WHERE vector_distance_cos(embedding, vector32(?)) < ?
        ORDER BY vector_distance_cos(embedding, vector32(?))
        LIMIT ?
      `,
      args: [vectorBlob, vectorBlob, 1 - threshold, vectorBlob, limit],
    });

    return result.rows.map(row => ({
      id: row.id as string,
      content: row.content as string,
      type: row.type as string,
      importance: row.importance as number,
      similarity: row.similarity as number,
    }));
  }

  /**
   * Search memories relevant to a task (with context)
   * Combines vector similarity with relational queries
   */
  async searchTaskMemories(
    taskId: string,
    queryEmbedding: number[],
    limit: number = 5
  ): Promise<Array<{ content: string; similarity: number; agentId: string }>> {
    const vectorBlob = new Float32Array(queryEmbedding);
    
    // Power of integrated vectors + relations!
    // Find memories similar to query that are also related to this task's dependencies
    const result = await this.client.execute({
      sql: `
        WITH task_deps AS (
          SELECT json_each.value as dep_id
          FROM tasks, json_each(tasks.dependencies)
          WHERE tasks.id = ?
        )
        SELECT 
          m.content,
          1 - vector_distance_cos(m.embedding, vector32(?)) as similarity,
          m.agent_id
        FROM memories m
        WHERE m.task_id IN (SELECT dep_id FROM task_deps)
          OR m.task_id = ?
        ORDER BY vector_distance_cos(m.embedding, vector32(?))
        LIMIT ?
      `,
      args: [taskId, vectorBlob, taskId, vectorBlob, limit],
    });

    return result.rows.map(row => ({
      content: row.content as string,
      similarity: row.similarity as number,
      agentId: row.agent_id as string,
    }));
  }

  // ==========================================================================
  // DATABASE BRANCHING (Git-like task versioning)
  // ==========================================================================

  /**
   * Create a branch of the database for experimentation
   * This is like git branch - instant, copy-on-write
   * 
   * Use cases:
   * - Experiment with different task decompositions
   * - A/B test different agent strategies
   * - Create "savepoints" before risky operations
   */
  async createBranch(branchName: string): Promise<string> {
    // This requires Turso Platform API
    const response = await fetch(
      `https://api.turso.tech/v1/organizations/${this.config.organization}/databases`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.tursoApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `${this.config.workspaceId}-${branchName}`,
          group: this.config.organization,
          // This is the key: instant fork from parent!
          from_database: this.config.workspaceId,
        }),
      }
    );

    const data = await response.json();
    return data.database.hostname;  // New branch URL
  }

  /**
   * Switch to a different branch
   */
  async switchBranch(branchName: string): Promise<void> {
    const branchUrl = `libsql://${this.config.workspaceId}-${branchName}-${this.config.organization}.turso.io`;
    
    // Reconnect to branch database
    this.client = createClient({
      url: branchUrl,
      authToken: this.config.authToken,
      syncUrl: this.config.enableEmbeddedReplica 
        ? `file:.turso/${this.config.workspaceId}-${branchName}.db`
        : undefined,
      syncInterval: this.config.syncIntervalSeconds,
    });
  }

  /**
   * List all branches for this workspace
   */
  async listBranches(): Promise<string[]> {
    const response = await fetch(
      `https://api.turso.tech/v1/organizations/${this.config.organization}/databases`,
      {
        headers: {
          'Authorization': `Bearer ${this.config.tursoApiToken}`,
        },
      }
    );

    const data = await response.json();
    return data.databases
      .filter((db: any) => db.name.startsWith(this.config.workspaceId))
      .map((db: any) => db.name.replace(`${this.config.workspaceId}-`, ''));
  }

  // ==========================================================================
  // MULTI-TENANCY HELPERS
  // ==========================================================================

  /**
   * Create a new workspace database
   * Each project/workspace gets complete isolation
   */
  static async createWorkspace(
    organization: string,
    workspaceId: string,
    tursoApiToken: string
  ): Promise<string> {
    const response = await fetch(
      `https://api.turso.tech/v1/organizations/${organization}/databases`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tursoApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: workspaceId,
          group: organization,
        }),
      }
    );

    const data = await response.json();
    return data.database.hostname;
  }

  /**
   * Delete a workspace database
   */
  static async deleteWorkspace(
    organization: string,
    workspaceId: string,
    tursoApiToken: string
  ): Promise<void> {
    await fetch(
      `https://api.turso.tech/v1/organizations/${organization}/databases/${workspaceId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${tursoApiToken}`,
        },
      }
    );
  }

  // ==========================================================================
  // CONCURRENCY - No more "database locked"!
  // ==========================================================================

  /**
   * Batch operations for better concurrency
   * Turso/libSQL handles concurrent writes better than SQLite
   */
  async batchExecute(operations: Array<{ sql: string; args: any[] }>): Promise<void> {
    // Turso's batch API is atomic and handles concurrency
    await this.client.batch(
      operations.map(op => ({ sql: op.sql, args: op.args })),
      'write'  // Ensures all operations are in same transaction
    );
  }

  /**
   * Interactive transaction with automatic retry on conflict
   */
  async withTransaction<T>(
    fn: (tx: any) => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.client.transaction(async (tx) => {
          return await fn(tx);
        });
      } catch (error) {
        lastError = error as Error;
        // Turso may throw on concurrent write conflicts
        // Retry with exponential backoff
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 100));
        }
      }
    }
    
    throw lastError;
  }
}

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

/*
// Initialize with all Turso features:
const dataLayer = new TursoNativeDataLayer({
  organization: 'my-org',
  workspaceId: 'my-project',
  tursoApiToken: process.env.TURSO_API_TOKEN!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
  enableEmbeddedReplica: true,  // Offline-first!
  localReplicaPath: '.turso/my-project.db',
  syncIntervalSeconds: 30,
});

await dataLayer.initialize();

// Store memory with embedding (replaces CASS):
await dataLayer.storeMemory({
  id: 'mem-1',
  agentId: 'agent-1',
  content: 'Learned that the auth module uses JWT tokens',
  type: 'codebase_knowledge',
  importance: 0.8,
  embedding: await getEmbedding('Learned that the auth module uses JWT tokens'),
});

// Semantic search (replaces CASS):
const relevant = await dataLayer.semanticSearch(
  await getEmbedding('How does authentication work?'),
  5,  // limit
  0.7 // similarity threshold
);

// Create branch for experimentation:
await dataLayer.createBranch('experiment-new-decomposition');
await dataLayer.switchBranch('experiment-new-decomposition');
// ... make changes ...
// If good, merge by copying; if bad, just delete the branch

// Force sync when going online:
await dataLayer.sync();
*/
