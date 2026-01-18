/**
 * CloudflareTaskStore - D1-based task storage for Cloudflare Workers
 *
 * Implements ITaskStore interface using Cloudflare D1 database.
 * Designed for use in Cloudflare Workers environment.
 *
 * @see docs/HYBRID_ARCHITECTURE.md
 */

import {
  Task,
  TaskStatus,
  TaskPriority,
  ITaskStore,
  TaskStats,
  TaskListOptions,
  TaskInput,
  TaskUpdate,
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

export interface CloudflareTaskStoreConfig {
  db: D1Database;
}

/**
 * Task row as stored in D1
 */
interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dependencies: string | null;
  blockers: string | null;
  required_skills: string | null;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  tags: string | null;
  retry_count: number;
  max_retries: number;
  branch: string | null;
  origin_branch: string | null;
  target_branches: string | null;
  assigned_agent: string | null;
  last_error: string | null;
  failure_type: string | null;
  last_attempt_at: number | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

export class CloudflareTaskStore implements ITaskStore {
  private db: D1Database;

  constructor(config: CloudflareTaskStoreConfig) {
    this.db = config.db;
  }

  async initialize(): Promise<void> {
    // Create tables if they don't exist
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT NOT NULL DEFAULT 'medium',
        dependencies TEXT,
        blockers TEXT,
        required_skills TEXT,
        estimated_minutes INTEGER,
        actual_minutes INTEGER,
        tags TEXT,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 2,
        branch TEXT,
        origin_branch TEXT,
        target_branches TEXT,
        assigned_agent TEXT,
        last_error TEXT,
        failure_type TEXT,
        last_attempt_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(assigned_agent);
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
    `);
  }

  async close(): Promise<void> {
    // D1 connections are managed by the Workers runtime
  }

  async createTask(input: TaskInput): Promise<Task> {
    const now = Date.now();
    const id = input.id || this.generateTaskId();

    const task: Task = {
      id,
      title: input.title,
      description: input.description,
      status: input.status || 'pending',
      priority: input.priority || 'medium',
      dependencies: input.dependencies || [],
      blockers: input.blockers || [],
      requiredSkills: input.requiredSkills || [],
      estimatedMinutes: input.estimatedMinutes,
      actualMinutes: input.actualMinutes,
      tags: input.tags || [],
      retryCount: input.retryCount ?? 0,
      maxRetries: input.maxRetries ?? 2,
      branch: input.branch,
      originBranch: input.originBranch,
      targetBranches: input.targetBranches || [],
      assignedAgent: input.assignedAgent,
      lastError: input.lastError,
      failureType: input.failureType,
      lastAttemptAt: input.lastAttemptAt,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      completedAt: input.completedAt,
      metadata: input.metadata,
    };

    await this.db.prepare(`
      INSERT INTO tasks (
        id, title, description, status, priority,
        dependencies, blockers, required_skills,
        estimated_minutes, actual_minutes, tags,
        retry_count, max_retries, branch, origin_branch, target_branches,
        assigned_agent, last_error, failure_type, last_attempt_at,
        created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      task.id,
      task.title,
      task.description || null,
      task.status,
      task.priority,
      JSON.stringify(task.dependencies),
      JSON.stringify(task.blockers),
      JSON.stringify(task.requiredSkills),
      task.estimatedMinutes || null,
      task.actualMinutes || null,
      JSON.stringify(task.tags),
      task.retryCount,
      task.maxRetries,
      task.branch || null,
      task.originBranch || null,
      JSON.stringify(task.targetBranches),
      task.assignedAgent || null,
      task.lastError || null,
      task.failureType || null,
      task.lastAttemptAt?.getTime() || null,
      now,
      now,
      task.completedAt?.getTime() || null
    ).run();

    return task;
  }

  async getTask(id: string): Promise<Task | null> {
    const result = await this.db.prepare(
      'SELECT * FROM tasks WHERE id = ?'
    ).bind(id).first<TaskRow>();

    if (!result) {
      return null;
    }

    return this.rowToTask(result);
  }

  async updateTask(id: string, updates: TaskUpdate): Promise<Task | null> {
    const existing = await this.getTask(id);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const updated: Task = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date(now),
    };

    await this.db.prepare(`
      UPDATE tasks SET
        title = ?, description = ?, status = ?, priority = ?,
        dependencies = ?, blockers = ?, required_skills = ?,
        estimated_minutes = ?, actual_minutes = ?, tags = ?,
        retry_count = ?, max_retries = ?, branch = ?, origin_branch = ?,
        target_branches = ?, assigned_agent = ?, last_error = ?,
        failure_type = ?, last_attempt_at = ?, updated_at = ?, completed_at = ?
      WHERE id = ?
    `).bind(
      updated.title,
      updated.description || null,
      updated.status,
      updated.priority,
      JSON.stringify(updated.dependencies),
      JSON.stringify(updated.blockers),
      JSON.stringify(updated.requiredSkills),
      updated.estimatedMinutes || null,
      updated.actualMinutes || null,
      JSON.stringify(updated.tags),
      updated.retryCount,
      updated.maxRetries,
      updated.branch || null,
      updated.originBranch || null,
      JSON.stringify(updated.targetBranches),
      updated.assignedAgent || null,
      updated.lastError || null,
      updated.failureType || null,
      updated.lastAttemptAt?.getTime() || null,
      now,
      updated.completedAt?.getTime() || null,
      id
    ).run();

    return updated;
  }

  async deleteTask(id: string): Promise<boolean> {
    const result = await this.db.prepare(
      'DELETE FROM tasks WHERE id = ?'
    ).bind(id).run();

    return result.success;
  }

  async listTasks(options?: TaskListOptions): Promise<Task[]> {
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: unknown[] = [];

    if (options?.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      query += ` AND status IN (${statuses.map(() => '?').join(',')})`;
      params.push(...statuses);
    }

    if (options?.priority) {
      const priorities = Array.isArray(options.priority) ? options.priority : [options.priority];
      query += ` AND priority IN (${priorities.map(() => '?').join(',')})`;
      params.push(...priorities);
    }

    if (options?.assignedAgent) {
      query += ' AND assigned_agent = ?';
      params.push(options.assignedAgent);
    }

    if (options?.branch) {
      query += ' AND branch = ?';
      params.push(options.branch);
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    let stmt = this.db.prepare(query);
    for (const param of params) {
      stmt = stmt.bind(param);
    }

    const result = await stmt.all<TaskRow>();
    return (result.results || []).map(row => this.rowToTask(row));
  }

  async getReadyTasks(): Promise<Task[]> {
    const result = await this.db.prepare(`
      SELECT * FROM tasks
      WHERE status IN ('pending', 'ready')
      AND (blockers IS NULL OR blockers = '[]')
      ORDER BY
        CASE priority
          WHEN 'critical' THEN 0
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
        END,
        created_at ASC
    `).all<TaskRow>();

    const tasks = (result.results || []).map(row => this.rowToTask(row));

    // Filter tasks whose dependencies are all completed
    const readyTasks: Task[] = [];
    for (const task of tasks) {
      if (task.dependencies.length === 0) {
        readyTasks.push(task);
        continue;
      }

      // Check if all dependencies are completed
      const depResults = await Promise.all(
        task.dependencies.map(depId => this.getTask(depId))
      );

      const allDepsCompleted = depResults.every(
        dep => dep && dep.status === 'completed'
      );

      if (allDepsCompleted) {
        readyTasks.push(task);
      }
    }

    return readyTasks;
  }

  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    return this.listTasks({ status });
  }

  async getTasksByAgent(agentId: string): Promise<Task[]> {
    const result = await this.db.prepare(`
      SELECT * FROM tasks
      WHERE assigned_agent = ?
      AND status NOT IN ('completed', 'failed')
    `).bind(agentId).all<TaskRow>();

    return (result.results || []).map(row => this.rowToTask(row));
  }

  async claimTask(taskId: string, agentId: string): Promise<Task | null> {
    // Use a transaction-like approach with D1
    const task = await this.getTask(taskId);
    if (!task) {
      return null;
    }

    if (task.status !== 'ready' && task.status !== 'pending') {
      return null;
    }

    // Atomic update - D1 will handle concurrency
    const now = Date.now();
    const result = await this.db.prepare(`
      UPDATE tasks
      SET status = 'claimed', assigned_agent = ?, updated_at = ?
      WHERE id = ? AND status IN ('ready', 'pending')
    `).bind(agentId, now, taskId).run();

    if (!result.success) {
      return null;
    }

    return this.getTask(taskId);
  }

  async releaseTask(taskId: string): Promise<boolean> {
    const now = Date.now();
    const result = await this.db.prepare(`
      UPDATE tasks
      SET status = 'ready', assigned_agent = NULL, updated_at = ?
      WHERE id = ?
    `).bind(now, taskId).run();

    return result.success;
  }

  async getStats(): Promise<TaskStats> {
    const statusResult = await this.db.prepare(`
      SELECT status, COUNT(*) as count FROM tasks GROUP BY status
    `).all<{ status: string; count: number }>();

    const priorityResult = await this.db.prepare(`
      SELECT priority, COUNT(*) as count FROM tasks GROUP BY priority
    `).all<{ priority: string; count: number }>();

    const totalResult = await this.db.prepare(
      'SELECT COUNT(*) as count FROM tasks'
    ).first<{ count: number }>();

    const byStatus: Record<TaskStatus, number> = {
      pending: 0,
      ready: 0,
      claimed: 0,
      in_progress: 0,
      blocked: 0,
      completed: 0,
      failed: 0,
    };

    const byPriority: Record<TaskPriority, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const row of statusResult.results || []) {
      byStatus[row.status as TaskStatus] = row.count;
    }

    for (const row of priorityResult.results || []) {
      byPriority[row.priority as TaskPriority] = row.count;
    }

    return {
      total: totalResult?.count || 0,
      byStatus,
      byPriority,
    };
  }

  private generateTaskId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'bd-';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private rowToTask(row: TaskRow): Task {
    return {
      id: row.id,
      title: row.title,
      description: row.description || undefined,
      status: row.status as TaskStatus,
      priority: row.priority as TaskPriority,
      dependencies: JSON.parse(row.dependencies || '[]'),
      blockers: JSON.parse(row.blockers || '[]'),
      requiredSkills: JSON.parse(row.required_skills || '[]'),
      estimatedMinutes: row.estimated_minutes || undefined,
      actualMinutes: row.actual_minutes || undefined,
      tags: JSON.parse(row.tags || '[]'),
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      branch: row.branch || undefined,
      originBranch: row.origin_branch || undefined,
      targetBranches: JSON.parse(row.target_branches || '[]'),
      assignedAgent: row.assigned_agent || undefined,
      lastError: row.last_error || undefined,
      failureType: row.failure_type as Task['failureType'],
      lastAttemptAt: row.last_attempt_at ? new Date(row.last_attempt_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    };
  }
}
