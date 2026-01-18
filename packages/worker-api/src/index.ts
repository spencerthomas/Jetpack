/**
 * Jetpack Worker API
 *
 * Cloudflare Worker that exposes the Jetpack hybrid architecture APIs.
 * Handles tasks, messaging, and memory storage on the edge.
 *
 * @see docs/HYBRID_ARCHITECTURE.md
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { CloudflareTaskStore } from '@jetpack-agent/cf-beads-adapter';
import { CloudflareMemoryStore } from '@jetpack-agent/cf-cass-adapter';
import {
  MailboxDurableObject,
  LeaseDurableObject,
} from '@jetpack-agent/cf-mail-adapter';

// Re-export Durable Objects for Workers runtime
export { MailboxDurableObject, LeaseDurableObject };

// Environment bindings
interface Env {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  MAILBOX_DO: DurableObjectNamespace;
  LEASE_DO: DurableObjectNamespace;
  API_TOKEN?: string;
  ENVIRONMENT?: string;
}

// Type helpers
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run(): Promise<D1Result>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
}

interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  error?: string;
  meta?: object;
}

interface D1ExecResult {
  count: number;
  duration: number;
}

interface VectorizeIndex {
  query(
    vector: number[],
    options: { topK?: number; filter?: Record<string, unknown> }
  ): Promise<VectorizeMatches>;
  insert(vectors: VectorizeVector[]): Promise<VectorizeInsertResult>;
  upsert(vectors: VectorizeVector[]): Promise<VectorizeInsertResult>;
  deleteByIds(ids: string[]): Promise<void>;
}

interface VectorizeVector {
  id: string;
  values: number[];
  metadata?: Record<string, unknown>;
}

interface VectorizeMatches {
  matches: Array<{ id: string; score: number; metadata?: Record<string, unknown> }>;
}

interface VectorizeInsertResult {
  count: number;
}

// Create Hono app with typed environment
const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('*', cors());

// Auth middleware
app.use('/api/*', async (c, next) => {
  const apiToken = c.env.API_TOKEN;

  // Skip auth in development
  if (!apiToken || c.env.ENVIRONMENT === 'development') {
    return next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader || authHeader !== `Bearer ${apiToken}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  return next();
});

// Health check
app.get('/', (c) => {
  return c.json({
    service: 'jetpack-api',
    version: '0.1.0',
    status: 'healthy',
  });
});

// ============================================================================
// Task APIs
// ============================================================================

// Create task
app.post('/api/tasks', async (c) => {
  const store = new CloudflareTaskStore({ db: c.env.DB as unknown as import('@jetpack-agent/cf-beads-adapter').D1Database });
  await store.initialize();

  const input = await c.req.json();
  const task = await store.createTask(input);
  return c.json(task, 201);
});

// List tasks
app.get('/api/tasks', async (c) => {
  const store = new CloudflareTaskStore({ db: c.env.DB as unknown as import('@jetpack-agent/cf-beads-adapter').D1Database });
  await store.initialize();

  const status = c.req.query('status');
  const priority = c.req.query('priority');
  const assignedAgent = c.req.query('assignedAgent');
  const limit = c.req.query('limit');

  const tasks = await store.listTasks({
    status: status as unknown as import('@jetpack-agent/shared').TaskStatus,
    priority: priority as unknown as import('@jetpack-agent/shared').TaskPriority,
    assignedAgent,
    limit: limit ? parseInt(limit, 10) : undefined,
  });

  return c.json(tasks);
});

// Get ready tasks (must be before :id route)
app.get('/api/tasks/ready', async (c) => {
  const store = new CloudflareTaskStore({ db: c.env.DB as unknown as import('@jetpack-agent/cf-beads-adapter').D1Database });
  await store.initialize();

  const tasks = await store.getReadyTasks();
  return c.json(tasks);
});

// Get task stats (must be before :id route)
app.get('/api/tasks/stats', async (c) => {
  const store = new CloudflareTaskStore({ db: c.env.DB as unknown as import('@jetpack-agent/cf-beads-adapter').D1Database });
  await store.initialize();

  const stats = await store.getStats();
  return c.json(stats);
});

// Get task
app.get('/api/tasks/:id', async (c) => {
  const store = new CloudflareTaskStore({ db: c.env.DB as unknown as import('@jetpack-agent/cf-beads-adapter').D1Database });
  await store.initialize();

  const task = await store.getTask(c.req.param('id'));
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }
  return c.json(task);
});

// Update task
app.patch('/api/tasks/:id', async (c) => {
  const store = new CloudflareTaskStore({ db: c.env.DB as unknown as import('@jetpack-agent/cf-beads-adapter').D1Database });
  await store.initialize();

  const updates = await c.req.json();
  const task = await store.updateTask(c.req.param('id'), updates);
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }
  return c.json(task);
});

// Delete task
app.delete('/api/tasks/:id', async (c) => {
  const store = new CloudflareTaskStore({ db: c.env.DB as unknown as import('@jetpack-agent/cf-beads-adapter').D1Database });
  await store.initialize();

  const deleted = await store.deleteTask(c.req.param('id'));
  if (!deleted) {
    return c.json({ error: 'Task not found' }, 404);
  }
  return c.json({ deleted: true });
});

// Claim task
app.post('/api/tasks/:id/claim', async (c) => {
  const store = new CloudflareTaskStore({ db: c.env.DB as unknown as import('@jetpack-agent/cf-beads-adapter').D1Database });
  await store.initialize();

  const { agentId } = await c.req.json();
  if (!agentId) {
    return c.json({ error: 'agentId is required' }, 400);
  }

  const task = await store.claimTask(c.req.param('id'), agentId);
  if (!task) {
    return c.json({ error: 'Task not found or not claimable' }, 404);
  }
  return c.json(task);
});

// Release task
app.post('/api/tasks/:id/release', async (c) => {
  const store = new CloudflareTaskStore({ db: c.env.DB as unknown as import('@jetpack-agent/cf-beads-adapter').D1Database });
  await store.initialize();

  const released = await store.releaseTask(c.req.param('id'));
  if (!released) {
    return c.json({ error: 'Task not found' }, 404);
  }
  return c.json({ released: true });
});

// ============================================================================
// Mail/Messaging APIs
// ============================================================================

// Publish message
app.post('/api/mail/publish', async (c) => {
  const mailboxId = c.env.MAILBOX_DO.idFromName('global-mailbox');
  const mailbox = c.env.MAILBOX_DO.get(mailboxId);

  const message = await c.req.json();
  await mailbox.fetch(
    new Request('https://mailbox/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })
  );

  return c.json({ published: true });
});

// Subscribe to messages (WebSocket upgrade)
app.get('/api/mail/subscribe', async (c) => {
  const agentId = c.req.query('agentId');
  if (!agentId) {
    return c.json({ error: 'agentId is required' }, 400);
  }

  const mailboxId = c.env.MAILBOX_DO.idFromName('global-mailbox');
  const mailbox = c.env.MAILBOX_DO.get(mailboxId);

  const response = await mailbox.fetch(
    new Request(`https://mailbox/subscribe?agentId=${agentId}`, {
      headers: c.req.raw.headers,
    })
  );

  return response;
});

// Acquire file lease
app.post('/api/mail/lease', async (c) => {
  const { file, agentId, ttlMs } = await c.req.json();
  if (!file || !agentId || !ttlMs) {
    return c.json({ error: 'file, agentId, and ttlMs are required' }, 400);
  }

  const leaseId = c.env.LEASE_DO.idFromName(`lease:${file}`);
  const lease = c.env.LEASE_DO.get(leaseId);

  const response = await lease.fetch(
    new Request('https://lease/acquire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, agentId, ttlMs }),
    })
  );

  return response;
});

// Release file lease
app.delete('/api/mail/lease', async (c) => {
  const { file, agentId } = await c.req.json();
  if (!file || !agentId) {
    return c.json({ error: 'file and agentId are required' }, 400);
  }

  const leaseId = c.env.LEASE_DO.idFromName(`lease:${file}`);
  const lease = c.env.LEASE_DO.get(leaseId);

  await lease.fetch(
    new Request('https://lease/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, agentId }),
    })
  );

  return c.json({ released: true });
});

// Check lease status
app.get('/api/mail/lease', async (c) => {
  const file = c.req.query('file');
  if (!file) {
    return c.json({ error: 'file is required' }, 400);
  }

  const leaseId = c.env.LEASE_DO.idFromName(`lease:${file}`);
  const lease = c.env.LEASE_DO.get(leaseId);

  const response = await lease.fetch(
    new Request('https://lease/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file }),
    })
  );

  return response;
});

// ============================================================================
// Memory APIs
// ============================================================================

// Store memory
app.post('/api/memory', async (c) => {
  const store = new CloudflareMemoryStore({
    db: c.env.DB as unknown as import('@jetpack-agent/cf-cass-adapter').D1Database,
    vectorize: c.env.VECTORIZE as unknown as import('@jetpack-agent/cf-cass-adapter').VectorizeIndex,
  });
  await store.initialize();

  const input = await c.req.json();
  const id = await store.store(input);
  return c.json({ id }, 201);
});

// Get memory stats (must be before :id route)
app.get('/api/memory/stats', async (c) => {
  const store = new CloudflareMemoryStore({
    db: c.env.DB as unknown as import('@jetpack-agent/cf-cass-adapter').D1Database,
    vectorize: c.env.VECTORIZE as unknown as import('@jetpack-agent/cf-cass-adapter').VectorizeIndex,
  });
  await store.initialize();

  const stats = await store.getStats();
  return c.json(stats);
});

// Get memories by type (must be before :id route)
app.get('/api/memory/type/:type', async (c) => {
  const store = new CloudflareMemoryStore({
    db: c.env.DB as unknown as import('@jetpack-agent/cf-cass-adapter').D1Database,
    vectorize: c.env.VECTORIZE as unknown as import('@jetpack-agent/cf-cass-adapter').VectorizeIndex,
  });
  await store.initialize();

  const limit = c.req.query('limit');
  const results = await store.getByType(
    c.req.param('type') as import('@jetpack-agent/shared').MemoryType,
    limit ? parseInt(limit, 10) : undefined
  );

  return c.json(results);
});

// Get memory
app.get('/api/memory/:id', async (c) => {
  const store = new CloudflareMemoryStore({
    db: c.env.DB as unknown as import('@jetpack-agent/cf-cass-adapter').D1Database,
    vectorize: c.env.VECTORIZE as unknown as import('@jetpack-agent/cf-cass-adapter').VectorizeIndex,
  });
  await store.initialize();

  const memory = await store.retrieve(c.req.param('id'));
  if (!memory) {
    return c.json({ error: 'Memory not found' }, 404);
  }
  return c.json(memory);
});

// Delete memory
app.delete('/api/memory/:id', async (c) => {
  const store = new CloudflareMemoryStore({
    db: c.env.DB as unknown as import('@jetpack-agent/cf-cass-adapter').D1Database,
    vectorize: c.env.VECTORIZE as unknown as import('@jetpack-agent/cf-cass-adapter').VectorizeIndex,
  });
  await store.initialize();

  const deleted = await store.delete?.(c.req.param('id'));
  if (!deleted) {
    return c.json({ error: 'Memory not found' }, 404);
  }
  return c.json({ deleted: true });
});

// Text search memories
app.post('/api/memory/search', async (c) => {
  const store = new CloudflareMemoryStore({
    db: c.env.DB as unknown as import('@jetpack-agent/cf-cass-adapter').D1Database,
    vectorize: c.env.VECTORIZE as unknown as import('@jetpack-agent/cf-cass-adapter').VectorizeIndex,
  });
  await store.initialize();

  const { query, limit } = await c.req.json();
  if (!query) {
    return c.json({ error: 'query is required' }, 400);
  }

  const results = await store.search(query, limit);
  return c.json(results);
});

// Semantic search memories
app.post('/api/memory/semantic', async (c) => {
  const store = new CloudflareMemoryStore({
    db: c.env.DB as unknown as import('@jetpack-agent/cf-cass-adapter').D1Database,
    vectorize: c.env.VECTORIZE as unknown as import('@jetpack-agent/cf-cass-adapter').VectorizeIndex,
  });
  await store.initialize();

  const { embedding, query, limit } = await c.req.json();

  let results;
  if (embedding) {
    results = await store.semanticSearch(embedding, limit);
  } else if (query) {
    results = await store.semanticSearchByQuery(query, limit);
  } else {
    return c.json({ error: 'embedding or query is required' }, 400);
  }

  return c.json(results);
});

// Trigger compaction
app.post('/api/memory/compact', async (c) => {
  const store = new CloudflareMemoryStore({
    db: c.env.DB as unknown as import('@jetpack-agent/cf-cass-adapter').D1Database,
    vectorize: c.env.VECTORIZE as unknown as import('@jetpack-agent/cf-cass-adapter').VectorizeIndex,
  });
  await store.initialize();

  const { threshold } = await c.req.json();
  const removed = threshold
    ? await store.compact(threshold)
    : await store.adaptiveCompact();

  return c.json({ removed });
});

// Backfill embeddings
app.post('/api/memory/backfill', async (c) => {
  const store = new CloudflareMemoryStore({
    db: c.env.DB as unknown as import('@jetpack-agent/cf-cass-adapter').D1Database,
    vectorize: c.env.VECTORIZE as unknown as import('@jetpack-agent/cf-cass-adapter').VectorizeIndex,
  });
  await store.initialize();

  const { batchSize } = await c.req.json();
  const processed = await store.backfillEmbeddings?.(batchSize);

  return c.json({ processed: processed ?? 0 });
});

export default app;
