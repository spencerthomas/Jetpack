import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema.js';
import type {
  DataLayer,
  TaskOperations,
  AgentOperations,
  MessageOperations,
  LeaseOperations,
  QualityOperations,
} from './DataLayer.js';
import { DataLayerError, DataLayerErrorCodes } from './DataLayer.js';
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
  SQLiteConfig,
} from './types.js';

// Generate unique IDs
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

// Convert row to Task object
function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string | null,
    status: row.status as Task['status'],
    priority: row.priority as Task['priority'],
    type: row.type as Task['type'],
    assignedAgent: row.assigned_agent as string | null,
    claimedAt: row.claimed_at as string | null,
    dependencies: JSON.parse((row.dependencies as string) || '[]'),
    blockers: JSON.parse((row.blockers as string) || '[]'),
    requiredSkills: JSON.parse((row.required_skills as string) || '[]'),
    files: JSON.parse((row.files as string) || '[]'),
    startedAt: row.started_at as string | null,
    completedAt: row.completed_at as string | null,
    estimatedMinutes: row.estimated_minutes as number | null,
    actualMinutes: row.actual_minutes as number | null,
    retryCount: row.retry_count as number,
    maxRetries: row.max_retries as number,
    lastError: row.last_error as string | null,
    failureType: row.failure_type as Task['failureType'],
    nextRetryAt: row.next_retry_at as string | null,
    previousAgents: JSON.parse((row.previous_agents as string) || '[]'),
    result: row.result ? JSON.parse(row.result as string) : null,
    branch: row.branch as string | null,
    qualitySnapshotId: row.quality_snapshot_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// Convert row to Agent object
function rowToAgent(row: Record<string, unknown>): Agent {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as Agent['type'],
    status: row.status as Agent['status'],
    skills: JSON.parse((row.skills as string) || '[]'),
    maxTaskMinutes: row.max_task_minutes as number,
    canRunTests: Boolean(row.can_run_tests),
    canRunBuild: Boolean(row.can_run_build),
    canAccessBrowser: Boolean(row.can_access_browser),
    lastHeartbeat: row.last_heartbeat as string | null,
    heartbeatCount: row.heartbeat_count as number,
    currentTaskId: row.current_task_id as string | null,
    currentTaskStartedAt: row.current_task_started_at as string | null,
    currentTaskProgress: row.current_task_progress as number,
    currentTaskPhase: row.current_task_phase as Agent['currentTaskPhase'],
    tasksCompleted: row.tasks_completed as number,
    tasksFailed: row.tasks_failed as number,
    totalRuntimeMinutes: row.total_runtime_minutes as number,
    machineId: row.machine_id as string | null,
    machineHostname: row.machine_hostname as string | null,
    pid: row.pid as number | null,
    registeredAt: row.registered_at as string,
    lastActiveAt: row.last_active_at as string,
  };
}

// Convert row to Message object
function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id: row.id as string,
    type: row.type as Message['type'],
    fromAgent: row.from_agent as string,
    toAgent: row.to_agent as string | null,
    payload: row.payload ? JSON.parse(row.payload as string) : null,
    ackRequired: Boolean(row.ack_required),
    acknowledgedAt: row.acknowledged_at as string | null,
    acknowledgedBy: row.acknowledged_by as string | null,
    deliveredAt: row.delivered_at as string | null,
    expiresAt: row.expires_at as string | null,
    createdAt: row.created_at as string,
  };
}

// Convert row to Lease object
function rowToLease(row: Record<string, unknown>): Lease {
  return {
    filePath: row.file_path as string,
    agentId: row.agent_id as string,
    taskId: row.task_id as string | null,
    acquiredAt: row.acquired_at as string,
    expiresAt: row.expires_at as string,
    renewedCount: row.renewed_count as number,
  };
}

// Convert row to QualitySnapshot object
function rowToSnapshot(row: Record<string, unknown>): QualitySnapshot {
  return {
    id: row.id as string,
    taskId: row.task_id as string | null,
    agentId: row.agent_id as string | null,
    buildSuccess: row.build_success === null ? null : Boolean(row.build_success),
    buildTimeMs: row.build_time_ms as number | null,
    typeErrors: row.type_errors as number,
    lintErrors: row.lint_errors as number,
    lintWarnings: row.lint_warnings as number,
    testsPassing: row.tests_passing as number,
    testsFailing: row.tests_failing as number,
    testsSkipped: row.tests_skipped as number,
    testCoverage: row.test_coverage as number | null,
    testTimeMs: row.test_time_ms as number | null,
    buildOutput: row.build_output as string | null,
    typeOutput: row.type_output as string | null,
    lintOutput: row.lint_output as string | null,
    testOutput: row.test_output as string | null,
    recordedAt: row.recorded_at as string,
  };
}

// Convert row to QualityBaseline object
function rowToBaseline(row: Record<string, unknown>): QualityBaseline {
  return {
    buildSuccess: Boolean(row.build_success),
    typeErrors: row.type_errors as number,
    lintErrors: row.lint_errors as number,
    lintWarnings: row.lint_warnings as number,
    testsPassing: row.tests_passing as number,
    testsFailing: row.tests_failing as number,
    testCoverage: row.test_coverage as number,
    setBy: row.set_by as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * SQLite implementation of the DataLayer interface.
 * Uses better-sqlite3 for synchronous, high-performance local storage.
 */
export class SQLiteDataLayer implements DataLayer {
  readonly type = 'sqlite' as const;
  private db: Database.Database;
  private startTime: number;

  tasks: TaskOperations;
  agents: AgentOperations;
  messages: MessageOperations;
  leases: LeaseOperations;
  quality: QualityOperations;

  constructor(private config: SQLiteConfig) {
    this.db = new Database(config.dbPath);
    this.startTime = Date.now();

    // Configure database
    if (config.walMode !== false) {
      this.db.pragma('journal_mode = WAL');
    }
    this.db.pragma(`busy_timeout = ${config.busyTimeout || 5000}`);
    this.db.pragma('foreign_keys = ON');

    // Initialize operation interfaces
    this.tasks = this.createTaskOperations();
    this.agents = this.createAgentOperations();
    this.messages = this.createMessageOperations();
    this.leases = this.createLeaseOperations();
    this.quality = this.createQualityOperations();
  }

  async initialize(): Promise<void> {
    // Execute embedded schema (SQLite handles IF NOT EXISTS)
    this.db.exec(SCHEMA_SQL);
  }

  async close(): Promise<void> {
    this.db.close();
  }

  async isHealthy(): Promise<boolean> {
    try {
      const result = this.db.prepare('SELECT 1 as ok').get() as { ok: number };
      return result?.ok === 1;
    } catch {
      return false;
    }
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  async getSwarmStatus(): Promise<SwarmStatus> {
    const now = Date.now();
    const uptime = now - this.startTime;

    // Get agent counts
    const agentCounts = this.db
      .prepare(
        `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'idle' THEN 1 ELSE 0 END) as idle,
          SUM(CASE WHEN status = 'busy' THEN 1 ELSE 0 END) as busy,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
          SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline
        FROM agents
      `
      )
      .get() as Record<string, number>;

    // Get agent by type counts
    const agentsByType = this.db
      .prepare('SELECT type, COUNT(*) as count FROM agents GROUP BY type')
      .all() as Array<{ type: string; count: number }>;

    const byType: Record<string, number> = {};
    for (const row of agentsByType) {
      byType[row.type] = row.count;
    }

    // Get task counts
    const taskCounts = this.db
      .prepare(
        `
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
      `
      )
      .get() as Record<string, number>;

    // Get quality info
    const baseline = await this.quality.getBaseline();
    const lastSnapshot = await this.quality.getLatestSnapshot();
    const regressionCount = lastSnapshot
      ? (await this.quality.detectRegressions(lastSnapshot)).length
      : 0;

    // Determine health status
    const hasErrors = agentCounts.error > 0;
    const hasOffline = agentCounts.offline > agentCounts.total * 0.5;
    const swarmStatus = hasErrors || hasOffline ? 'degraded' : 'healthy';

    return {
      swarm: {
        status: swarmStatus,
        uptime,
        dataLayerType: 'sqlite',
      },
      agents: {
        total: agentCounts.total || 0,
        idle: agentCounts.idle || 0,
        busy: agentCounts.busy || 0,
        error: agentCounts.error || 0,
        offline: agentCounts.offline || 0,
        byType,
      },
      tasks: {
        total: taskCounts.total || 0,
        pending: taskCounts.pending || 0,
        ready: taskCounts.ready || 0,
        claimed: taskCounts.claimed || 0,
        inProgress: taskCounts.in_progress || 0,
        completed: taskCounts.completed || 0,
        failed: taskCounts.failed || 0,
        blocked: taskCounts.blocked || 0,
      },
      quality: {
        baseline,
        lastSnapshot,
        regressionCount,
      },
    };
  }

  // ============================================================================
  // TASK OPERATIONS
  // ============================================================================

  private createTaskOperations(): TaskOperations {
    const db = this.db;

    return {
      create: async (task: TaskCreate): Promise<Task> => {
        const id = task.id || generateId('task');
        const now = new Date().toISOString();

        // Determine initial status based on dependencies
        const hasDeps = task.dependencies && task.dependencies.length > 0;
        const status = hasDeps ? 'blocked' : 'ready';

        const stmt = db.prepare(`
          INSERT INTO tasks (
            id, title, description, status, priority, type,
            dependencies, required_skills, files, estimated_minutes, branch,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          id,
          task.title,
          task.description || null,
          status,
          task.priority || 'medium',
          task.type || 'code',
          JSON.stringify(task.dependencies || []),
          JSON.stringify(task.requiredSkills || []),
          JSON.stringify(task.files || []),
          task.estimatedMinutes || null,
          task.branch || null,
          now,
          now
        );

        const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
        return rowToTask(row as Record<string, unknown>);
      },

      get: async (id: string): Promise<Task | null> => {
        const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
        return row ? rowToTask(row as Record<string, unknown>) : null;
      },

      update: async (id: string, updates: Partial<Task>): Promise<Task | null> => {
        const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
        if (!existing) return null;

        const setClauses: string[] = [];
        const values: unknown[] = [];

        // Map camelCase to snake_case and handle JSON fields
        const fieldMap: Record<string, string> = {
          title: 'title',
          description: 'description',
          status: 'status',
          priority: 'priority',
          type: 'type',
          assignedAgent: 'assigned_agent',
          claimedAt: 'claimed_at',
          dependencies: 'dependencies',
          blockers: 'blockers',
          requiredSkills: 'required_skills',
          files: 'files',
          startedAt: 'started_at',
          completedAt: 'completed_at',
          estimatedMinutes: 'estimated_minutes',
          actualMinutes: 'actual_minutes',
          retryCount: 'retry_count',
          maxRetries: 'max_retries',
          lastError: 'last_error',
          failureType: 'failure_type',
          nextRetryAt: 'next_retry_at',
          previousAgents: 'previous_agents',
          result: 'result',
          branch: 'branch',
          qualitySnapshotId: 'quality_snapshot_id',
        };

        const jsonFields = [
          'dependencies',
          'blockers',
          'requiredSkills',
          'files',
          'previousAgents',
          'result',
        ];

        for (const [key, value] of Object.entries(updates)) {
          const dbField = fieldMap[key];
          if (dbField) {
            setClauses.push(`${dbField} = ?`);
            values.push(jsonFields.includes(key) ? JSON.stringify(value) : value);
          }
        }

        if (setClauses.length === 0) return rowToTask(existing as Record<string, unknown>);

        values.push(id);
        db.prepare(`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);

        const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
        return rowToTask(row as Record<string, unknown>);
      },

      delete: async (id: string): Promise<boolean> => {
        const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
        return result.changes > 0;
      },

      list: async (filter?: TaskFilter): Promise<Task[]> => {
        let sql = 'SELECT * FROM tasks WHERE 1=1';
        const params: unknown[] = [];

        if (filter) {
          if (filter.status) {
            const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
            sql += ` AND status IN (${statuses.map(() => '?').join(',')})`;
            params.push(...statuses);
          }
          if (filter.priority) {
            const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
            sql += ` AND priority IN (${priorities.map(() => '?').join(',')})`;
            params.push(...priorities);
          }
          if (filter.type) {
            const types = Array.isArray(filter.type) ? filter.type : [filter.type];
            sql += ` AND type IN (${types.map(() => '?').join(',')})`;
            params.push(...types);
          }
          if (filter.assignedAgent) {
            sql += ' AND assigned_agent = ?';
            params.push(filter.assignedAgent);
          }
          if (filter.branch) {
            sql += ' AND branch = ?';
            params.push(filter.branch);
          }
          if (filter.excludeIds && filter.excludeIds.length > 0) {
            sql += ` AND id NOT IN (${filter.excludeIds.map(() => '?').join(',')})`;
            params.push(...filter.excludeIds);
          }
        }

        sql += ' ORDER BY priority_order ASC, created_at ASC';

        if (filter?.limit) {
          sql += ' LIMIT ?';
          params.push(filter.limit);
        }
        if (filter?.offset) {
          sql += ' OFFSET ?';
          params.push(filter.offset);
        }

        const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
        return rows.map(rowToTask);
      },

      count: async (filter?: TaskFilter): Promise<number> => {
        let sql = 'SELECT COUNT(*) as count FROM tasks WHERE 1=1';
        const params: unknown[] = [];

        if (filter) {
          if (filter.status) {
            const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
            sql += ` AND status IN (${statuses.map(() => '?').join(',')})`;
            params.push(...statuses);
          }
          if (filter.priority) {
            const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
            sql += ` AND priority IN (${priorities.map(() => '?').join(',')})`;
            params.push(...priorities);
          }
          if (filter.assignedAgent) {
            sql += ' AND assigned_agent = ?';
            params.push(filter.assignedAgent);
          }
        }

        const result = db.prepare(sql).get(...params) as { count: number };
        return result.count;
      },

      claim: async (agentId: string, filter?: TaskFilter): Promise<Task | null> => {
        // Use a transaction for atomic claiming
        return db.transaction(() => {
          // Build query for ready tasks
          let sql = `
            SELECT * FROM tasks
            WHERE status = 'ready'
            AND (assigned_agent IS NULL OR assigned_agent = ?)
          `;
          const params: unknown[] = [agentId];

          if (filter?.skills && filter.skills.length > 0) {
            // Check if task requires any of the agent's skills
            for (const skill of filter.skills) {
              sql += ` AND (required_skills = '[]' OR required_skills LIKE ?)`;
              params.push(`%"${skill}"%`);
            }
          }

          if (filter?.excludeIds && filter.excludeIds.length > 0) {
            sql += ` AND id NOT IN (${filter.excludeIds.map(() => '?').join(',')})`;
            params.push(...filter.excludeIds);
          }

          sql += ' ORDER BY priority_order ASC, created_at ASC LIMIT 1';

          const row = db.prepare(sql).get(...params) as Record<string, unknown> | undefined;
          if (!row) return null;

          const now = new Date().toISOString();
          db.prepare(`
            UPDATE tasks
            SET status = 'claimed', assigned_agent = ?, claimed_at = ?
            WHERE id = ? AND status = 'ready'
          `).run(agentId, now, row.id);

          const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(row.id);
          return rowToTask(updated as Record<string, unknown>);
        })();
      },

      release: async (taskId: string, reason: string): Promise<boolean> => {
        const result = db
          .prepare(
            `
          UPDATE tasks
          SET status = 'ready', assigned_agent = NULL, claimed_at = NULL, last_error = ?
          WHERE id = ? AND status IN ('claimed', 'in_progress')
        `
          )
          .run(reason, taskId);
        return result.changes > 0;
      },

      updateProgress: async (taskId: string, progress: TaskProgress): Promise<boolean> => {
        const result = db
          .prepare(
            `
          UPDATE tasks SET status = 'in_progress'
          WHERE id = ? AND status IN ('claimed', 'in_progress')
        `
          )
          .run(taskId);

        // Also update agent's current task progress if assigned
        const task = db.prepare('SELECT assigned_agent FROM tasks WHERE id = ?').get(taskId) as {
          assigned_agent: string | null;
        };
        if (task?.assigned_agent) {
          db.prepare(
            `
            UPDATE agents
            SET current_task_progress = ?, current_task_phase = ?
            WHERE id = ?
          `
          ).run(progress.percentComplete, progress.phase, task.assigned_agent);
        }

        return result.changes > 0;
      },

      complete: async (taskId: string, result: TaskResult): Promise<Task | null> => {
        const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
        if (!task) return null;

        const now = new Date().toISOString();
        const startedAt = (task as Record<string, unknown>).started_at as string;
        const actualMinutes = startedAt
          ? Math.round((Date.now() - new Date(startedAt).getTime()) / 60000)
          : null;

        db.prepare(
          `
          UPDATE tasks
          SET status = 'completed', completed_at = ?, actual_minutes = ?, result = ?
          WHERE id = ?
        `
        ).run(now, actualMinutes, JSON.stringify(result), taskId);

        const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
        return rowToTask(updated as Record<string, unknown>);
      },

      fail: async (taskId: string, failure: TaskFailure): Promise<Task | null> => {
        const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<
          string,
          unknown
        >;
        if (!task) return null;

        const retryCount = (task.retry_count as number) + 1;
        const maxRetries = task.max_retries as number;
        const shouldRetry = failure.recoverable && retryCount < maxRetries;

        const newStatus = shouldRetry ? 'pending_retry' : 'failed';
        const nextRetryAt = shouldRetry
          ? new Date(Date.now() + Math.pow(2, retryCount) * 30000).toISOString()
          : null;

        // Track the agent that failed
        const previousAgents = JSON.parse((task.previous_agents as string) || '[]');
        if (task.assigned_agent) {
          previousAgents.push(task.assigned_agent);
        }

        db.prepare(
          `
          UPDATE tasks
          SET status = ?, retry_count = ?, last_error = ?, failure_type = ?,
              next_retry_at = ?, previous_agents = ?, assigned_agent = NULL
          WHERE id = ?
        `
        ).run(
          newStatus,
          retryCount,
          failure.message,
          failure.type,
          nextRetryAt,
          JSON.stringify(previousAgents),
          taskId
        );

        const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
        return rowToTask(updated as Record<string, unknown>);
      },

      findRetryEligible: async (now: number): Promise<Task[]> => {
        const nowStr = new Date(now).toISOString();
        const rows = db
          .prepare(
            `
          SELECT * FROM tasks
          WHERE status = 'pending_retry' AND next_retry_at <= ?
          ORDER BY priority_order ASC, next_retry_at ASC
        `
          )
          .all(nowStr) as Array<Record<string, unknown>>;
        return rows.map(rowToTask);
      },

      resetForRetry: async (taskId: string): Promise<boolean> => {
        const result = db
          .prepare(
            `
          UPDATE tasks
          SET status = 'ready', next_retry_at = NULL
          WHERE id = ? AND status = 'pending_retry'
        `
          )
          .run(taskId);
        return result.changes > 0;
      },

      updateBlockedToReady: async (): Promise<number> => {
        // Find blocked tasks whose dependencies are all completed
        const blockedTasks = db
          .prepare("SELECT id, dependencies FROM tasks WHERE status = 'blocked'")
          .all() as Array<{ id: string; dependencies: string }>;

        let updated = 0;
        for (const task of blockedTasks) {
          const deps = JSON.parse(task.dependencies);
          if (deps.length === 0) {
            db.prepare("UPDATE tasks SET status = 'ready' WHERE id = ?").run(task.id);
            updated++;
            continue;
          }

          // Check if all dependencies are completed
          const completedCount = db
            .prepare(
              `
              SELECT COUNT(*) as count FROM tasks
              WHERE id IN (${deps.map(() => '?').join(',')})
              AND status = 'completed'
            `
            )
            .get(...deps) as { count: number };

          if (completedCount.count === deps.length) {
            db.prepare("UPDATE tasks SET status = 'ready' WHERE id = ?").run(task.id);
            updated++;
          }
        }

        return updated;
      },

      getAgentTasks: async (agentId: string): Promise<Task[]> => {
        const rows = db
          .prepare('SELECT * FROM tasks WHERE assigned_agent = ?')
          .all(agentId) as Array<Record<string, unknown>>;
        return rows.map(rowToTask);
      },
    };
  }

  // ============================================================================
  // AGENT OPERATIONS
  // ============================================================================

  private createAgentOperations(): AgentOperations {
    const db = this.db;

    return {
      register: async (agent: AgentRegistration): Promise<Agent> => {
        const now = new Date().toISOString();

        const stmt = db.prepare(`
          INSERT INTO agents (
            id, name, type, status, skills, max_task_minutes,
            can_run_tests, can_run_build, can_access_browser,
            machine_id, machine_hostname, pid,
            last_heartbeat, registered_at, last_active_at
          ) VALUES (?, ?, ?, 'idle', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          agent.id,
          agent.name,
          agent.type,
          JSON.stringify(agent.capabilities.skills),
          agent.capabilities.maxTaskMinutes || 60,
          agent.capabilities.canRunTests !== false ? 1 : 0,
          agent.capabilities.canRunBuild !== false ? 1 : 0,
          agent.capabilities.canAccessBrowser === true ? 1 : 0,
          agent.machine?.id || null,
          agent.machine?.hostname || null,
          agent.machine?.pid || null,
          now,
          now,
          now
        );

        const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(agent.id);
        return rowToAgent(row as Record<string, unknown>);
      },

      get: async (id: string): Promise<Agent | null> => {
        const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
        return row ? rowToAgent(row as Record<string, unknown>) : null;
      },

      heartbeat: async (agentId: string, heartbeat: AgentHeartbeat): Promise<boolean> => {
        const now = new Date().toISOString();

        let sql = `
          UPDATE agents
          SET status = ?, last_heartbeat = ?, heartbeat_count = heartbeat_count + 1,
              last_active_at = ?
        `;
        const params: unknown[] = [heartbeat.status, now, now];

        if (heartbeat.currentTask) {
          sql += ', current_task_id = ?, current_task_progress = ?, current_task_phase = ?';
          params.push(
            heartbeat.currentTask.id,
            heartbeat.currentTask.progress || 0,
            heartbeat.currentTask.phase || null
          );
        }

        sql += ' WHERE id = ?';
        params.push(agentId);

        const result = db.prepare(sql).run(...params);
        return result.changes > 0;
      },

      deregister: async (agentId: string): Promise<boolean> => {
        const result = db.prepare('DELETE FROM agents WHERE id = ?').run(agentId);
        return result.changes > 0;
      },

      list: async (filter?: AgentFilter): Promise<Agent[]> => {
        let sql = 'SELECT * FROM agents WHERE 1=1';
        const params: unknown[] = [];

        if (filter) {
          if (filter.status) {
            const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
            sql += ` AND status IN (${statuses.map(() => '?').join(',')})`;
            params.push(...statuses);
          }
          if (filter.type) {
            const types = Array.isArray(filter.type) ? filter.type : [filter.type];
            sql += ` AND type IN (${types.map(() => '?').join(',')})`;
            params.push(...types);
          }
          if (filter.machineId) {
            sql += ' AND machine_id = ?';
            params.push(filter.machineId);
          }
        }

        sql += ' ORDER BY registered_at ASC';

        const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
        return rows.map(rowToAgent);
      },

      count: async (filter?: AgentFilter): Promise<number> => {
        let sql = 'SELECT COUNT(*) as count FROM agents WHERE 1=1';
        const params: unknown[] = [];

        if (filter) {
          if (filter.status) {
            const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
            sql += ` AND status IN (${statuses.map(() => '?').join(',')})`;
            params.push(...statuses);
          }
          if (filter.type) {
            const types = Array.isArray(filter.type) ? filter.type : [filter.type];
            sql += ` AND type IN (${types.map(() => '?').join(',')})`;
            params.push(...types);
          }
        }

        const result = db.prepare(sql).get(...params) as { count: number };
        return result.count;
      },

      findStale: async (thresholdMs: number): Promise<Agent[]> => {
        const threshold = new Date(Date.now() - thresholdMs).toISOString();
        const rows = db
          .prepare(
            `
          SELECT * FROM agents
          WHERE last_heartbeat < ? AND status != 'offline'
        `
          )
          .all(threshold) as Array<Record<string, unknown>>;
        return rows.map(rowToAgent);
      },

      updateStats: async (
        agentId: string,
        completed: boolean,
        runtimeMinutes: number
      ): Promise<boolean> => {
        const field = completed ? 'tasks_completed' : 'tasks_failed';
        const result = db
          .prepare(
            `
          UPDATE agents
          SET ${field} = ${field} + 1, total_runtime_minutes = total_runtime_minutes + ?
          WHERE id = ?
        `
          )
          .run(runtimeMinutes, agentId);
        return result.changes > 0;
      },

      setCurrentTask: async (agentId: string, taskId: string | null): Promise<boolean> => {
        const now = taskId ? new Date().toISOString() : null;
        const result = db
          .prepare(
            `
          UPDATE agents
          SET current_task_id = ?, current_task_started_at = ?,
              current_task_progress = 0, current_task_phase = NULL
          WHERE id = ?
        `
          )
          .run(taskId, now, agentId);
        return result.changes > 0;
      },
    };
  }

  // ============================================================================
  // MESSAGE OPERATIONS
  // ============================================================================

  private createMessageOperations(): MessageOperations {
    const db = this.db;

    return {
      send: async (message: MessageCreate): Promise<Message> => {
        const id = generateId('msg');
        const now = new Date().toISOString();
        const expiresAt = message.expiresIn
          ? new Date(Date.now() + message.expiresIn).toISOString()
          : null;

        db.prepare(
          `
          INSERT INTO messages (
            id, type, from_agent, to_agent, payload,
            ack_required, expires_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          id,
          message.type,
          message.fromAgent,
          message.toAgent || null,
          message.payload ? JSON.stringify(message.payload) : null,
          message.ackRequired ? 1 : 0,
          expiresAt,
          now
        );

        const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
        return rowToMessage(row as Record<string, unknown>);
      },

      get: async (id: string): Promise<Message | null> => {
        const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
        return row ? rowToMessage(row as Record<string, unknown>) : null;
      },

      receive: async (agentId: string, filter?: MessageFilter): Promise<Message[]> => {
        let sql = 'SELECT * FROM messages WHERE (to_agent = ? OR to_agent IS NULL)';
        const params: unknown[] = [agentId];

        if (filter) {
          if (filter.type) {
            const types = Array.isArray(filter.type) ? filter.type : [filter.type];
            sql += ` AND type IN (${types.map(() => '?').join(',')})`;
            params.push(...types);
          }
          if (filter.fromAgent) {
            sql += ' AND from_agent = ?';
            params.push(filter.fromAgent);
          }
          if (filter.unreadOnly) {
            sql += ' AND delivered_at IS NULL';
          }
          if (filter.unackedOnly) {
            sql += ' AND ack_required = 1 AND acknowledged_at IS NULL';
          }
          if (filter.since) {
            sql += ' AND created_at > ?';
            params.push(filter.since);
          }
        }

        // Exclude expired messages
        sql += ' AND (expires_at IS NULL OR expires_at > ?)';
        params.push(new Date().toISOString());

        sql += ' ORDER BY created_at ASC';

        if (filter?.limit) {
          sql += ' LIMIT ?';
          params.push(filter.limit);
        }

        const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
        return rows.map(rowToMessage);
      },

      markDelivered: async (messageIds: string[], agentId: string): Promise<number> => {
        if (messageIds.length === 0) return 0;

        const now = new Date().toISOString();
        const result = db
          .prepare(
            `
          UPDATE messages
          SET delivered_at = ?
          WHERE id IN (${messageIds.map(() => '?').join(',')})
          AND (to_agent = ? OR to_agent IS NULL)
          AND delivered_at IS NULL
        `
          )
          .run(now, ...messageIds, agentId);
        return result.changes;
      },

      acknowledge: async (messageId: string, agentId: string): Promise<boolean> => {
        const now = new Date().toISOString();
        const result = db
          .prepare(
            `
          UPDATE messages
          SET acknowledged_at = ?, acknowledged_by = ?
          WHERE id = ? AND ack_required = 1 AND acknowledged_at IS NULL
        `
          )
          .run(now, agentId, messageId);
        return result.changes > 0;
      },

      broadcast: async (message: Omit<MessageCreate, 'toAgent'>): Promise<Message> => {
        const id = generateId('msg');
        const now = new Date().toISOString();
        const expiresAt = message.expiresIn
          ? new Date(Date.now() + message.expiresIn).toISOString()
          : null;

        db.prepare(
          `
          INSERT INTO messages (
            id, type, from_agent, to_agent, payload,
            ack_required, expires_at, created_at
          ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)
        `
        ).run(
          id,
          message.type,
          message.fromAgent,
          message.payload ? JSON.stringify(message.payload) : null,
          message.ackRequired ? 1 : 0,
          expiresAt,
          now
        );

        const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
        return rowToMessage(row as Record<string, unknown>);
      },

      getUnacknowledged: async (olderThanMs?: number): Promise<Message[]> => {
        let sql =
          'SELECT * FROM messages WHERE ack_required = 1 AND acknowledged_at IS NULL';
        const params: unknown[] = [];

        if (olderThanMs) {
          const threshold = new Date(Date.now() - olderThanMs).toISOString();
          sql += ' AND created_at < ?';
          params.push(threshold);
        }

        sql += ' ORDER BY created_at ASC';

        const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
        return rows.map(rowToMessage);
      },

      deleteExpired: async (): Promise<number> => {
        const now = new Date().toISOString();
        const result = db
          .prepare('DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at < ?')
          .run(now);
        return result.changes;
      },
    };
  }

  // ============================================================================
  // LEASE OPERATIONS
  // ============================================================================

  private createLeaseOperations(): LeaseOperations {
    const db = this.db;

    return {
      acquire: async (request: LeaseRequest): Promise<boolean> => {
        const now = new Date().toISOString();
        const expiresAt = new Date(Date.now() + request.durationMs).toISOString();

        try {
          // Try to insert or update expired lease
          db.prepare(
            `
            INSERT INTO leases (file_path, agent_id, task_id, acquired_at, expires_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(file_path) DO UPDATE
            SET agent_id = excluded.agent_id,
                task_id = excluded.task_id,
                acquired_at = excluded.acquired_at,
                expires_at = excluded.expires_at,
                renewed_count = 0
            WHERE expires_at < ?
          `
          ).run(
            request.filePath,
            request.agentId,
            request.taskId || null,
            now,
            expiresAt,
            now
          );

          // Verify we own the lease
          const lease = db
            .prepare('SELECT agent_id FROM leases WHERE file_path = ?')
            .get(request.filePath) as { agent_id: string } | undefined;

          return lease?.agent_id === request.agentId;
        } catch (error) {
          // Constraint violation means lease is held by another agent
          if ((error as Error).message?.includes('UNIQUE constraint')) {
            return false;
          }
          throw error;
        }
      },

      release: async (filePath: string, agentId: string): Promise<boolean> => {
        const result = db
          .prepare('DELETE FROM leases WHERE file_path = ? AND agent_id = ?')
          .run(filePath, agentId);
        return result.changes > 0;
      },

      forceRelease: async (filePath: string): Promise<boolean> => {
        const result = db.prepare('DELETE FROM leases WHERE file_path = ?').run(filePath);
        return result.changes > 0;
      },

      check: async (filePath: string): Promise<Lease | null> => {
        const row = db.prepare('SELECT * FROM leases WHERE file_path = ?').get(filePath);
        if (!row) return null;

        const lease = rowToLease(row as Record<string, unknown>);

        // Check if expired
        if (new Date(lease.expiresAt) < new Date()) {
          db.prepare('DELETE FROM leases WHERE file_path = ?').run(filePath);
          return null;
        }

        return lease;
      },

      extend: async (filePath: string, agentId: string, durationMs: number): Promise<boolean> => {
        const expiresAt = new Date(Date.now() + durationMs).toISOString();
        const result = db
          .prepare(
            `
          UPDATE leases
          SET expires_at = ?, renewed_count = renewed_count + 1
          WHERE file_path = ? AND agent_id = ?
        `
          )
          .run(expiresAt, filePath, agentId);
        return result.changes > 0;
      },

      getAgentLeases: async (agentId: string): Promise<Lease[]> => {
        const rows = db
          .prepare('SELECT * FROM leases WHERE agent_id = ?')
          .all(agentId) as Array<Record<string, unknown>>;
        return rows.map(rowToLease);
      },

      findExpired: async (): Promise<Lease[]> => {
        const now = new Date().toISOString();
        const rows = db.prepare('SELECT * FROM leases WHERE expires_at < ?').all(now) as Array<
          Record<string, unknown>
        >;
        return rows.map(rowToLease);
      },

      releaseAll: async (agentId: string): Promise<number> => {
        const result = db.prepare('DELETE FROM leases WHERE agent_id = ?').run(agentId);
        return result.changes;
      },
    };
  }

  // ============================================================================
  // QUALITY OPERATIONS
  // ============================================================================

  private createQualityOperations(): QualityOperations {
    const db = this.db;

    return {
      recordSnapshot: async (snapshot: QualitySnapshotCreate): Promise<QualitySnapshot> => {
        const id = generateId('snap');
        const now = new Date().toISOString();

        db.prepare(
          `
          INSERT INTO quality_snapshots (
            id, task_id, agent_id,
            build_success, build_time_ms,
            type_errors, lint_errors, lint_warnings,
            tests_passing, tests_failing, tests_skipped,
            test_coverage, test_time_ms,
            build_output, type_output, lint_output, test_output,
            recorded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          id,
          snapshot.taskId || null,
          snapshot.agentId || null,
          snapshot.buildSuccess === undefined ? null : snapshot.buildSuccess ? 1 : 0,
          snapshot.buildTimeMs || null,
          snapshot.typeErrors || 0,
          snapshot.lintErrors || 0,
          snapshot.lintWarnings || 0,
          snapshot.testsPassing || 0,
          snapshot.testsFailing || 0,
          snapshot.testsSkipped || 0,
          snapshot.testCoverage || null,
          snapshot.testTimeMs || null,
          snapshot.buildOutput || null,
          snapshot.typeOutput || null,
          snapshot.lintOutput || null,
          snapshot.testOutput || null,
          now
        );

        const row = db.prepare('SELECT * FROM quality_snapshots WHERE id = ?').get(id);
        return rowToSnapshot(row as Record<string, unknown>);
      },

      getSnapshot: async (id: string): Promise<QualitySnapshot | null> => {
        const row = db.prepare('SELECT * FROM quality_snapshots WHERE id = ?').get(id);
        return row ? rowToSnapshot(row as Record<string, unknown>) : null;
      },

      getLatestSnapshot: async (): Promise<QualitySnapshot | null> => {
        const row = db
          .prepare('SELECT * FROM quality_snapshots ORDER BY recorded_at DESC LIMIT 1')
          .get();
        return row ? rowToSnapshot(row as Record<string, unknown>) : null;
      },

      getTaskSnapshots: async (taskId: string): Promise<QualitySnapshot[]> => {
        const rows = db
          .prepare('SELECT * FROM quality_snapshots WHERE task_id = ? ORDER BY recorded_at ASC')
          .all(taskId) as Array<Record<string, unknown>>;
        return rows.map(rowToSnapshot);
      },

      getBaseline: async (): Promise<QualityBaseline | null> => {
        const row = db.prepare('SELECT * FROM quality_baseline WHERE id = 1').get();
        return row ? rowToBaseline(row as Record<string, unknown>) : null;
      },

      setBaseline: async (
        baseline: Omit<QualityBaseline, 'createdAt' | 'updatedAt'>
      ): Promise<QualityBaseline> => {
        const now = new Date().toISOString();

        db.prepare(
          `
          INSERT INTO quality_baseline (
            id, build_success, type_errors, lint_errors, lint_warnings,
            tests_passing, tests_failing, test_coverage, set_by,
            created_at, updated_at
          ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            build_success = excluded.build_success,
            type_errors = excluded.type_errors,
            lint_errors = excluded.lint_errors,
            lint_warnings = excluded.lint_warnings,
            tests_passing = excluded.tests_passing,
            tests_failing = excluded.tests_failing,
            test_coverage = excluded.test_coverage,
            set_by = excluded.set_by,
            updated_at = excluded.updated_at
        `
        ).run(
          baseline.buildSuccess ? 1 : 0,
          baseline.typeErrors,
          baseline.lintErrors,
          baseline.lintWarnings,
          baseline.testsPassing,
          baseline.testsFailing,
          baseline.testCoverage,
          baseline.setBy || null,
          now,
          now
        );

        const row = db.prepare('SELECT * FROM quality_baseline WHERE id = 1').get();
        return rowToBaseline(row as Record<string, unknown>);
      },

      detectRegressions: async (snapshot: QualitySnapshot): Promise<Regression[]> => {
        const baseline = await this.quality.getBaseline();
        if (!baseline) return [];

        const regressions: Regression[] = [];

        // Check each metric
        if (snapshot.buildSuccess === false && baseline.buildSuccess) {
          regressions.push({
            metric: 'buildSuccess',
            baseline: 1,
            current: 0,
            delta: -1,
            severity: 'error',
          });
        }

        if (snapshot.typeErrors > baseline.typeErrors) {
          regressions.push({
            metric: 'typeErrors',
            baseline: baseline.typeErrors,
            current: snapshot.typeErrors,
            delta: snapshot.typeErrors - baseline.typeErrors,
            severity: 'error',
          });
        }

        if (snapshot.lintErrors > baseline.lintErrors) {
          regressions.push({
            metric: 'lintErrors',
            baseline: baseline.lintErrors,
            current: snapshot.lintErrors,
            delta: snapshot.lintErrors - baseline.lintErrors,
            severity: 'error',
          });
        }

        if (snapshot.testsFailing > baseline.testsFailing) {
          regressions.push({
            metric: 'testsFailing',
            baseline: baseline.testsFailing,
            current: snapshot.testsFailing,
            delta: snapshot.testsFailing - baseline.testsFailing,
            severity: 'error',
          });
        }

        const currentCoverage = snapshot.testCoverage;
        if (currentCoverage != null && currentCoverage < baseline.testCoverage - 5) {
          regressions.push({
            metric: 'testCoverage',
            baseline: baseline.testCoverage,
            current: currentCoverage,
            delta: currentCoverage - baseline.testCoverage,
            severity: 'warning',
          });
        }

        return regressions;
      },
    };
  }
}
