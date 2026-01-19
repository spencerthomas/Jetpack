import { createClient, type Client, type ResultSet, type InValue } from '@libsql/client';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type {
  DataLayer,
  TaskOperations,
  AgentOperations,
  MessageOperations,
  LeaseOperations,
  QualityOperations,
} from './DataLayer.js';
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
  TursoConfig,
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

// Helper to get first row from result set
function getRow(result: ResultSet): Record<string, unknown> | null {
  if (result.rows.length === 0) return null;
  const row: Record<string, unknown> = {};
  for (let i = 0; i < result.columns.length; i++) {
    row[result.columns[i]] = result.rows[0][i];
  }
  return row;
}

// Helper to get all rows from result set
function getRows(result: ResultSet): Array<Record<string, unknown>> {
  return result.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < result.columns.length; i++) {
      obj[result.columns[i]] = row[i];
    }
    return obj;
  });
}

/**
 * Turso (cloud-hosted SQLite) implementation of the DataLayer interface.
 * Uses @libsql/client for async, distributed access.
 */
export class TursoDataLayer implements DataLayer {
  readonly type = 'turso' as const;
  private client: Client;
  private startTime: number;

  tasks: TaskOperations;
  agents: AgentOperations;
  messages: MessageOperations;
  leases: LeaseOperations;
  quality: QualityOperations;

  constructor(private config: TursoConfig) {
    this.client = createClient({
      url: config.url,
      authToken: config.authToken,
    });
    this.startTime = Date.now();

    // Initialize operation interfaces
    this.tasks = this.createTaskOperations();
    this.agents = this.createAgentOperations();
    this.messages = this.createMessageOperations();
    this.leases = this.createLeaseOperations();
    this.quality = this.createQualityOperations();
  }

  async initialize(): Promise<void> {
    // Load and execute schema
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    // Split schema into individual statements and execute
    // Turso doesn't support multi-statement exec directly
    const statements = schema
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      try {
        await this.client.execute(stmt);
      } catch (error) {
        // Ignore "already exists" errors
        if (!(error as Error).message?.includes('already exists')) {
          console.warn(`Schema statement warning: ${(error as Error).message}`);
        }
      }
    }
  }

  async close(): Promise<void> {
    this.client.close();
  }

  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.client.execute('SELECT 1 as ok');
      return getRow(result)?.ok === 1;
    } catch {
      return false;
    }
  }

  // Note: Turso doesn't support synchronous transactions like better-sqlite3
  // Use batch() for atomic operations instead

  async getSwarmStatus(): Promise<SwarmStatus> {
    const now = Date.now();
    const uptime = now - this.startTime;

    // Get agent counts
    const agentCountsResult = await this.client.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'idle' THEN 1 ELSE 0 END) as idle,
        SUM(CASE WHEN status = 'busy' THEN 1 ELSE 0 END) as busy,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
        SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline
      FROM agents
    `);
    const agentCounts = getRow(agentCountsResult) || {};

    // Get agent by type counts
    const agentsByTypeResult = await this.client.execute(
      'SELECT type, COUNT(*) as count FROM agents GROUP BY type'
    );
    const byType: Record<string, number> = {};
    for (const row of getRows(agentsByTypeResult)) {
      byType[row.type as string] = row.count as number;
    }

    // Get task counts
    const taskCountsResult = await this.client.execute(`
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
    `);
    const taskCounts = getRow(taskCountsResult) || {};

    // Get quality info
    const baseline = await this.quality.getBaseline();
    const lastSnapshot = await this.quality.getLatestSnapshot();
    const regressionCount = lastSnapshot
      ? (await this.quality.detectRegressions(lastSnapshot)).length
      : 0;

    // Determine health status
    const hasErrors = (agentCounts.error as number) > 0;
    const totalAgents = (agentCounts.total as number) || 0;
    const offlineAgents = (agentCounts.offline as number) || 0;
    const hasOffline = totalAgents > 0 && offlineAgents > totalAgents * 0.5;
    const swarmStatus = hasErrors || hasOffline ? 'degraded' : 'healthy';

    return {
      swarm: {
        status: swarmStatus,
        uptime,
        dataLayerType: 'turso',
      },
      agents: {
        total: totalAgents,
        idle: (agentCounts.idle as number) || 0,
        busy: (agentCounts.busy as number) || 0,
        error: (agentCounts.error as number) || 0,
        offline: offlineAgents,
        byType,
      },
      tasks: {
        total: (taskCounts.total as number) || 0,
        pending: (taskCounts.pending as number) || 0,
        ready: (taskCounts.ready as number) || 0,
        claimed: (taskCounts.claimed as number) || 0,
        inProgress: (taskCounts.in_progress as number) || 0,
        completed: (taskCounts.completed as number) || 0,
        failed: (taskCounts.failed as number) || 0,
        blocked: (taskCounts.blocked as number) || 0,
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
    const client = this.client;

    return {
      create: async (task: TaskCreate): Promise<Task> => {
        const id = task.id || generateId('task');
        const now = new Date().toISOString();
        const hasDeps = task.dependencies && task.dependencies.length > 0;
        const status = hasDeps ? 'blocked' : 'ready';

        await client.execute({
          sql: `
            INSERT INTO tasks (
              id, title, description, status, priority, type,
              dependencies, required_skills, files, estimated_minutes, branch,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
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
            now,
          ],
        });

        const result = await client.execute({
          sql: 'SELECT * FROM tasks WHERE id = ?',
          args: [id],
        });
        return rowToTask(getRow(result)!);
      },

      get: async (id: string): Promise<Task | null> => {
        const result = await client.execute({
          sql: 'SELECT * FROM tasks WHERE id = ?',
          args: [id],
        });
        const row = getRow(result);
        return row ? rowToTask(row) : null;
      },

      update: async (id: string, updates: Partial<Task>): Promise<Task | null> => {
        const existing = await client.execute({
          sql: 'SELECT * FROM tasks WHERE id = ?',
          args: [id],
        });
        if (!getRow(existing)) return null;

        const setClauses: string[] = [];
        const values: InValue[] = [];

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
            const processedValue = jsonFields.includes(key) ? JSON.stringify(value) : value;
            values.push(processedValue as InValue);
          }
        }

        if (setClauses.length === 0) return rowToTask(getRow(existing)!);

        values.push(id);
        await client.execute({
          sql: `UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ?`,
          args: values,
        });

        const result = await client.execute({
          sql: 'SELECT * FROM tasks WHERE id = ?',
          args: [id],
        });
        return rowToTask(getRow(result)!);
      },

      delete: async (id: string): Promise<boolean> => {
        const result = await client.execute({
          sql: 'DELETE FROM tasks WHERE id = ?',
          args: [id],
        });
        return result.rowsAffected > 0;
      },

      list: async (filter?: TaskFilter): Promise<Task[]> => {
        let sql = 'SELECT * FROM tasks WHERE 1=1';
        const args: InValue[] = [];

        if (filter) {
          if (filter.status) {
            const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
            sql += ` AND status IN (${statuses.map(() => '?').join(',')})`;
            args.push(...statuses);
          }
          if (filter.priority) {
            const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
            sql += ` AND priority IN (${priorities.map(() => '?').join(',')})`;
            args.push(...priorities);
          }
          if (filter.type) {
            const types = Array.isArray(filter.type) ? filter.type : [filter.type];
            sql += ` AND type IN (${types.map(() => '?').join(',')})`;
            args.push(...types);
          }
          if (filter.assignedAgent) {
            sql += ' AND assigned_agent = ?';
            args.push(filter.assignedAgent);
          }
          if (filter.branch) {
            sql += ' AND branch = ?';
            args.push(filter.branch);
          }
          if (filter.excludeIds && filter.excludeIds.length > 0) {
            sql += ` AND id NOT IN (${filter.excludeIds.map(() => '?').join(',')})`;
            args.push(...filter.excludeIds);
          }
        }

        sql += ' ORDER BY priority_order ASC, created_at ASC';

        if (filter?.limit) {
          sql += ' LIMIT ?';
          args.push(filter.limit);
        }
        if (filter?.offset) {
          sql += ' OFFSET ?';
          args.push(filter.offset);
        }

        const result = await client.execute({ sql, args });
        return getRows(result).map(rowToTask);
      },

      count: async (filter?: TaskFilter): Promise<number> => {
        let sql = 'SELECT COUNT(*) as count FROM tasks WHERE 1=1';
        const args: InValue[] = [];

        if (filter) {
          if (filter.status) {
            const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
            sql += ` AND status IN (${statuses.map(() => '?').join(',')})`;
            args.push(...statuses);
          }
          if (filter.priority) {
            const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
            sql += ` AND priority IN (${priorities.map(() => '?').join(',')})`;
            args.push(...priorities);
          }
          if (filter.assignedAgent) {
            sql += ' AND assigned_agent = ?';
            args.push(filter.assignedAgent);
          }
        }

        const result = await client.execute({ sql, args });
        return (getRow(result)?.count as number) || 0;
      },

      claim: async (agentId: string, filter?: TaskFilter): Promise<Task | null> => {
        // Turso doesn't have true transactions, use batch for atomicity
        let sql = `
          SELECT id FROM tasks
          WHERE status = 'ready'
          AND (assigned_agent IS NULL OR assigned_agent = ?)
        `;
        const args: InValue[] = [agentId];

        if (filter?.excludeIds && filter.excludeIds.length > 0) {
          sql += ` AND id NOT IN (${filter.excludeIds.map(() => '?').join(',')})`;
          args.push(...(filter.excludeIds as InValue[]));
        }

        sql += ' ORDER BY priority_order ASC, created_at ASC LIMIT 1';

        const selectResult = await client.execute({ sql, args });
        const row = getRow(selectResult);
        if (!row) return null;

        const taskId = row.id as string;
        const now = new Date().toISOString();

        // Try to claim - this may fail if another agent claimed it
        const updateResult = await client.execute({
          sql: `
            UPDATE tasks
            SET status = 'claimed', assigned_agent = ?, claimed_at = ?
            WHERE id = ? AND status = 'ready'
          `,
          args: [agentId, now, taskId],
        });

        if (updateResult.rowsAffected === 0) {
          // Someone else claimed it, return null
          return null;
        }

        const result = await client.execute({
          sql: 'SELECT * FROM tasks WHERE id = ?',
          args: [taskId],
        });
        return rowToTask(getRow(result)!);
      },

      release: async (taskId: string, reason: string): Promise<boolean> => {
        const result = await client.execute({
          sql: `
            UPDATE tasks
            SET status = 'ready', assigned_agent = NULL, claimed_at = NULL, last_error = ?
            WHERE id = ? AND status IN ('claimed', 'in_progress')
          `,
          args: [reason, taskId],
        });
        return result.rowsAffected > 0;
      },

      updateProgress: async (taskId: string, progress: TaskProgress): Promise<boolean> => {
        const result = await client.execute({
          sql: `
            UPDATE tasks SET status = 'in_progress'
            WHERE id = ? AND status IN ('claimed', 'in_progress')
          `,
          args: [taskId],
        });

        // Update agent's current task progress if assigned
        const taskResult = await client.execute({
          sql: 'SELECT assigned_agent FROM tasks WHERE id = ?',
          args: [taskId],
        });
        const task = getRow(taskResult);
        if (task?.assigned_agent) {
          await client.execute({
            sql: `
              UPDATE agents
              SET current_task_progress = ?, current_task_phase = ?
              WHERE id = ?
            `,
            args: [progress.percentComplete, progress.phase, task.assigned_agent as string],
          });
        }

        return result.rowsAffected > 0;
      },

      complete: async (taskId: string, taskResult: TaskResult): Promise<Task | null> => {
        const existing = await client.execute({
          sql: 'SELECT * FROM tasks WHERE id = ?',
          args: [taskId],
        });
        const task = getRow(existing);
        if (!task) return null;

        const now = new Date().toISOString();
        const startedAt = task.started_at as string;
        const actualMinutes = startedAt
          ? Math.round((Date.now() - new Date(startedAt).getTime()) / 60000)
          : null;

        await client.execute({
          sql: `
            UPDATE tasks
            SET status = 'completed', completed_at = ?, actual_minutes = ?, result = ?
            WHERE id = ?
          `,
          args: [now, actualMinutes, JSON.stringify(taskResult), taskId],
        });

        const result = await client.execute({
          sql: 'SELECT * FROM tasks WHERE id = ?',
          args: [taskId],
        });
        return rowToTask(getRow(result)!);
      },

      fail: async (taskId: string, failure: TaskFailure): Promise<Task | null> => {
        const existing = await client.execute({
          sql: 'SELECT * FROM tasks WHERE id = ?',
          args: [taskId],
        });
        const task = getRow(existing);
        if (!task) return null;

        const retryCount = (task.retry_count as number) + 1;
        const maxRetries = task.max_retries as number;
        const shouldRetry = failure.recoverable && retryCount < maxRetries;

        const newStatus = shouldRetry ? 'pending_retry' : 'failed';
        const nextRetryAt = shouldRetry
          ? new Date(Date.now() + Math.pow(2, retryCount) * 30000).toISOString()
          : null;

        const previousAgents = JSON.parse((task.previous_agents as string) || '[]');
        if (task.assigned_agent) {
          previousAgents.push(task.assigned_agent);
        }

        await client.execute({
          sql: `
            UPDATE tasks
            SET status = ?, retry_count = ?, last_error = ?, failure_type = ?,
                next_retry_at = ?, previous_agents = ?, assigned_agent = NULL
            WHERE id = ?
          `,
          args: [
            newStatus,
            retryCount,
            failure.message,
            failure.type,
            nextRetryAt,
            JSON.stringify(previousAgents),
            taskId,
          ],
        });

        const result = await client.execute({
          sql: 'SELECT * FROM tasks WHERE id = ?',
          args: [taskId],
        });
        return rowToTask(getRow(result)!);
      },

      findRetryEligible: async (now: number): Promise<Task[]> => {
        const nowStr = new Date(now).toISOString();
        const result = await client.execute({
          sql: `
            SELECT * FROM tasks
            WHERE status = 'pending_retry' AND next_retry_at <= ?
            ORDER BY priority_order ASC, next_retry_at ASC
          `,
          args: [nowStr],
        });
        return getRows(result).map(rowToTask);
      },

      resetForRetry: async (taskId: string): Promise<boolean> => {
        const result = await client.execute({
          sql: `
            UPDATE tasks
            SET status = 'ready', next_retry_at = NULL
            WHERE id = ? AND status = 'pending_retry'
          `,
          args: [taskId],
        });
        return result.rowsAffected > 0;
      },

      updateBlockedToReady: async (): Promise<number> => {
        const blockedResult = await client.execute(
          "SELECT id, dependencies FROM tasks WHERE status = 'blocked'"
        );
        const blockedTasks = getRows(blockedResult);

        let updated = 0;
        for (const task of blockedTasks) {
          const taskId = task.id as string;
          const deps = JSON.parse(task.dependencies as string) as string[];
          if (deps.length === 0) {
            await client.execute({
              sql: "UPDATE tasks SET status = 'ready' WHERE id = ?",
              args: [taskId],
            });
            updated++;
            continue;
          }

          const completedResult = await client.execute({
            sql: `
              SELECT COUNT(*) as count FROM tasks
              WHERE id IN (${deps.map(() => '?').join(',')})
              AND status = 'completed'
            `,
            args: deps,
          });
          const completedCount = getRow(completedResult)?.count as number;

          if (completedCount === deps.length) {
            await client.execute({
              sql: "UPDATE tasks SET status = 'ready' WHERE id = ?",
              args: [taskId],
            });
            updated++;
          }
        }

        return updated;
      },

      getAgentTasks: async (agentId: string): Promise<Task[]> => {
        const result = await client.execute({
          sql: 'SELECT * FROM tasks WHERE assigned_agent = ?',
          args: [agentId],
        });
        return getRows(result).map(rowToTask);
      },
    };
  }

  // ============================================================================
  // AGENT OPERATIONS
  // ============================================================================

  private createAgentOperations(): AgentOperations {
    const client = this.client;

    return {
      register: async (agent: AgentRegistration): Promise<Agent> => {
        const now = new Date().toISOString();

        await client.execute({
          sql: `
            INSERT INTO agents (
              id, name, type, status, skills, max_task_minutes,
              can_run_tests, can_run_build, can_access_browser,
              machine_id, machine_hostname, pid,
              last_heartbeat, registered_at, last_active_at
            ) VALUES (?, ?, ?, 'idle', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
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
            now,
          ],
        });

        const result = await client.execute({
          sql: 'SELECT * FROM agents WHERE id = ?',
          args: [agent.id],
        });
        return rowToAgent(getRow(result)!);
      },

      get: async (id: string): Promise<Agent | null> => {
        const result = await client.execute({
          sql: 'SELECT * FROM agents WHERE id = ?',
          args: [id],
        });
        const row = getRow(result);
        return row ? rowToAgent(row) : null;
      },

      heartbeat: async (agentId: string, heartbeat: AgentHeartbeat): Promise<boolean> => {
        const now = new Date().toISOString();

        let sql = `
          UPDATE agents
          SET status = ?, last_heartbeat = ?, heartbeat_count = heartbeat_count + 1,
              last_active_at = ?
        `;
        const args: InValue[] = [heartbeat.status, now, now];

        if (heartbeat.currentTask) {
          sql += ', current_task_id = ?, current_task_progress = ?, current_task_phase = ?';
          args.push(
            heartbeat.currentTask.id,
            heartbeat.currentTask.progress || 0,
            heartbeat.currentTask.phase || null
          );
        }

        sql += ' WHERE id = ?';
        args.push(agentId);

        const result = await client.execute({ sql, args });
        return result.rowsAffected > 0;
      },

      deregister: async (agentId: string): Promise<boolean> => {
        const result = await client.execute({
          sql: 'DELETE FROM agents WHERE id = ?',
          args: [agentId],
        });
        return result.rowsAffected > 0;
      },

      list: async (filter?: AgentFilter): Promise<Agent[]> => {
        let sql = 'SELECT * FROM agents WHERE 1=1';
        const args: InValue[] = [];

        if (filter) {
          if (filter.status) {
            const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
            sql += ` AND status IN (${statuses.map(() => '?').join(',')})`;
            args.push(...statuses);
          }
          if (filter.type) {
            const types = Array.isArray(filter.type) ? filter.type : [filter.type];
            sql += ` AND type IN (${types.map(() => '?').join(',')})`;
            args.push(...types);
          }
          if (filter.machineId) {
            sql += ' AND machine_id = ?';
            args.push(filter.machineId);
          }
        }

        sql += ' ORDER BY registered_at ASC';

        const result = await client.execute({ sql, args });
        return getRows(result).map(rowToAgent);
      },

      count: async (filter?: AgentFilter): Promise<number> => {
        let sql = 'SELECT COUNT(*) as count FROM agents WHERE 1=1';
        const args: InValue[] = [];

        if (filter) {
          if (filter.status) {
            const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
            sql += ` AND status IN (${statuses.map(() => '?').join(',')})`;
            args.push(...statuses);
          }
          if (filter.type) {
            const types = Array.isArray(filter.type) ? filter.type : [filter.type];
            sql += ` AND type IN (${types.map(() => '?').join(',')})`;
            args.push(...types);
          }
        }

        const result = await client.execute({ sql, args });
        return (getRow(result)?.count as number) || 0;
      },

      findStale: async (thresholdMs: number): Promise<Agent[]> => {
        const threshold = new Date(Date.now() - thresholdMs).toISOString();
        const result = await client.execute({
          sql: `
            SELECT * FROM agents
            WHERE last_heartbeat < ? AND status != 'offline'
          `,
          args: [threshold],
        });
        return getRows(result).map(rowToAgent);
      },

      updateStats: async (
        agentId: string,
        completed: boolean,
        runtimeMinutes: number
      ): Promise<boolean> => {
        const field = completed ? 'tasks_completed' : 'tasks_failed';
        const result = await client.execute({
          sql: `
            UPDATE agents
            SET ${field} = ${field} + 1, total_runtime_minutes = total_runtime_minutes + ?
            WHERE id = ?
          `,
          args: [runtimeMinutes, agentId],
        });
        return result.rowsAffected > 0;
      },

      setCurrentTask: async (agentId: string, taskId: string | null): Promise<boolean> => {
        const now = taskId ? new Date().toISOString() : null;
        const result = await client.execute({
          sql: `
            UPDATE agents
            SET current_task_id = ?, current_task_started_at = ?,
                current_task_progress = 0, current_task_phase = NULL
            WHERE id = ?
          `,
          args: [taskId, now, agentId],
        });
        return result.rowsAffected > 0;
      },
    };
  }

  // ============================================================================
  // MESSAGE OPERATIONS
  // ============================================================================

  private createMessageOperations(): MessageOperations {
    const client = this.client;

    return {
      send: async (message: MessageCreate): Promise<Message> => {
        const id = generateId('msg');
        const now = new Date().toISOString();
        const expiresAt = message.expiresIn
          ? new Date(Date.now() + message.expiresIn).toISOString()
          : null;

        await client.execute({
          sql: `
            INSERT INTO messages (
              id, type, from_agent, to_agent, payload,
              ack_required, expires_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            id,
            message.type,
            message.fromAgent,
            message.toAgent || null,
            message.payload ? JSON.stringify(message.payload) : null,
            message.ackRequired ? 1 : 0,
            expiresAt,
            now,
          ],
        });

        const result = await client.execute({
          sql: 'SELECT * FROM messages WHERE id = ?',
          args: [id],
        });
        return rowToMessage(getRow(result)!);
      },

      get: async (id: string): Promise<Message | null> => {
        const result = await client.execute({
          sql: 'SELECT * FROM messages WHERE id = ?',
          args: [id],
        });
        const row = getRow(result);
        return row ? rowToMessage(row) : null;
      },

      receive: async (agentId: string, filter?: MessageFilter): Promise<Message[]> => {
        let sql = 'SELECT * FROM messages WHERE (to_agent = ? OR to_agent IS NULL)';
        const args: InValue[] = [agentId];

        if (filter) {
          if (filter.type) {
            const types = Array.isArray(filter.type) ? filter.type : [filter.type];
            sql += ` AND type IN (${types.map(() => '?').join(',')})`;
            args.push(...types);
          }
          if (filter.fromAgent) {
            sql += ' AND from_agent = ?';
            args.push(filter.fromAgent);
          }
          if (filter.unreadOnly) {
            sql += ' AND delivered_at IS NULL';
          }
          if (filter.unackedOnly) {
            sql += ' AND ack_required = 1 AND acknowledged_at IS NULL';
          }
          if (filter.since) {
            sql += ' AND created_at > ?';
            args.push(filter.since);
          }
        }

        sql += ' AND (expires_at IS NULL OR expires_at > ?)';
        args.push(new Date().toISOString());

        sql += ' ORDER BY created_at ASC';

        if (filter?.limit) {
          sql += ' LIMIT ?';
          args.push(filter.limit);
        }

        const result = await client.execute({ sql, args });
        return getRows(result).map(rowToMessage);
      },

      markDelivered: async (messageIds: string[], agentId: string): Promise<number> => {
        if (messageIds.length === 0) return 0;

        const now = new Date().toISOString();
        const result = await client.execute({
          sql: `
            UPDATE messages
            SET delivered_at = ?
            WHERE id IN (${messageIds.map(() => '?').join(',')})
            AND (to_agent = ? OR to_agent IS NULL)
            AND delivered_at IS NULL
          `,
          args: [now, ...messageIds, agentId],
        });
        return result.rowsAffected;
      },

      acknowledge: async (messageId: string, agentId: string): Promise<boolean> => {
        const now = new Date().toISOString();
        const result = await client.execute({
          sql: `
            UPDATE messages
            SET acknowledged_at = ?, acknowledged_by = ?
            WHERE id = ? AND ack_required = 1 AND acknowledged_at IS NULL
          `,
          args: [now, agentId, messageId],
        });
        return result.rowsAffected > 0;
      },

      broadcast: async (message: Omit<MessageCreate, 'toAgent'>): Promise<Message> => {
        const id = generateId('msg');
        const now = new Date().toISOString();
        const expiresAt = message.expiresIn
          ? new Date(Date.now() + message.expiresIn).toISOString()
          : null;

        await client.execute({
          sql: `
            INSERT INTO messages (
              id, type, from_agent, to_agent, payload,
              ack_required, expires_at, created_at
            ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)
          `,
          args: [
            id,
            message.type,
            message.fromAgent,
            message.payload ? JSON.stringify(message.payload) : null,
            message.ackRequired ? 1 : 0,
            expiresAt,
            now,
          ],
        });

        const result = await client.execute({
          sql: 'SELECT * FROM messages WHERE id = ?',
          args: [id],
        });
        return rowToMessage(getRow(result)!);
      },

      getUnacknowledged: async (olderThanMs?: number): Promise<Message[]> => {
        let sql =
          'SELECT * FROM messages WHERE ack_required = 1 AND acknowledged_at IS NULL';
        const args: InValue[] = [];

        if (olderThanMs) {
          const threshold = new Date(Date.now() - olderThanMs).toISOString();
          sql += ' AND created_at < ?';
          args.push(threshold);
        }

        sql += ' ORDER BY created_at ASC';

        const result = await client.execute({ sql, args });
        return getRows(result).map(rowToMessage);
      },

      deleteExpired: async (): Promise<number> => {
        const now = new Date().toISOString();
        const result = await client.execute({
          sql: 'DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at < ?',
          args: [now],
        });
        return result.rowsAffected;
      },
    };
  }

  // ============================================================================
  // LEASE OPERATIONS
  // ============================================================================

  private createLeaseOperations(): LeaseOperations {
    const client = this.client;

    return {
      acquire: async (request: LeaseRequest): Promise<boolean> => {
        const now = new Date().toISOString();
        const expiresAt = new Date(Date.now() + request.durationMs).toISOString();

        try {
          await client.execute({
            sql: `
              INSERT INTO leases (file_path, agent_id, task_id, acquired_at, expires_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(file_path) DO UPDATE
              SET agent_id = excluded.agent_id,
                  task_id = excluded.task_id,
                  acquired_at = excluded.acquired_at,
                  expires_at = excluded.expires_at,
                  renewed_count = 0
              WHERE expires_at < ?
            `,
            args: [
              request.filePath,
              request.agentId,
              request.taskId || null,
              now,
              expiresAt,
              now,
            ],
          });

          const result = await client.execute({
            sql: 'SELECT agent_id FROM leases WHERE file_path = ?',
            args: [request.filePath],
          });
          const row = getRow(result);

          return row?.agent_id === request.agentId;
        } catch {
          return false;
        }
      },

      release: async (filePath: string, agentId: string): Promise<boolean> => {
        const result = await client.execute({
          sql: 'DELETE FROM leases WHERE file_path = ? AND agent_id = ?',
          args: [filePath, agentId],
        });
        return result.rowsAffected > 0;
      },

      forceRelease: async (filePath: string): Promise<boolean> => {
        const result = await client.execute({
          sql: 'DELETE FROM leases WHERE file_path = ?',
          args: [filePath],
        });
        return result.rowsAffected > 0;
      },

      check: async (filePath: string): Promise<Lease | null> => {
        const result = await client.execute({
          sql: 'SELECT * FROM leases WHERE file_path = ?',
          args: [filePath],
        });
        const row = getRow(result);
        if (!row) return null;

        const lease = rowToLease(row);

        if (new Date(lease.expiresAt) < new Date()) {
          await client.execute({
            sql: 'DELETE FROM leases WHERE file_path = ?',
            args: [filePath],
          });
          return null;
        }

        return lease;
      },

      extend: async (filePath: string, agentId: string, durationMs: number): Promise<boolean> => {
        const expiresAt = new Date(Date.now() + durationMs).toISOString();
        const result = await client.execute({
          sql: `
            UPDATE leases
            SET expires_at = ?, renewed_count = renewed_count + 1
            WHERE file_path = ? AND agent_id = ?
          `,
          args: [expiresAt, filePath, agentId],
        });
        return result.rowsAffected > 0;
      },

      getAgentLeases: async (agentId: string): Promise<Lease[]> => {
        const result = await client.execute({
          sql: 'SELECT * FROM leases WHERE agent_id = ?',
          args: [agentId],
        });
        return getRows(result).map(rowToLease);
      },

      findExpired: async (): Promise<Lease[]> => {
        const now = new Date().toISOString();
        const result = await client.execute({
          sql: 'SELECT * FROM leases WHERE expires_at < ?',
          args: [now],
        });
        return getRows(result).map(rowToLease);
      },

      releaseAll: async (agentId: string): Promise<number> => {
        const result = await client.execute({
          sql: 'DELETE FROM leases WHERE agent_id = ?',
          args: [agentId],
        });
        return result.rowsAffected;
      },
    };
  }

  // ============================================================================
  // QUALITY OPERATIONS
  // ============================================================================

  private createQualityOperations(): QualityOperations {
    const client = this.client;
    const self = this;

    return {
      recordSnapshot: async (snapshot: QualitySnapshotCreate): Promise<QualitySnapshot> => {
        const id = generateId('snap');
        const now = new Date().toISOString();

        await client.execute({
          sql: `
            INSERT INTO quality_snapshots (
              id, task_id, agent_id,
              build_success, build_time_ms,
              type_errors, lint_errors, lint_warnings,
              tests_passing, tests_failing, tests_skipped,
              test_coverage, test_time_ms,
              build_output, type_output, lint_output, test_output,
              recorded_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
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
            now,
          ],
        });

        const result = await client.execute({
          sql: 'SELECT * FROM quality_snapshots WHERE id = ?',
          args: [id],
        });
        return rowToSnapshot(getRow(result)!);
      },

      getSnapshot: async (id: string): Promise<QualitySnapshot | null> => {
        const result = await client.execute({
          sql: 'SELECT * FROM quality_snapshots WHERE id = ?',
          args: [id],
        });
        const row = getRow(result);
        return row ? rowToSnapshot(row) : null;
      },

      getLatestSnapshot: async (): Promise<QualitySnapshot | null> => {
        const result = await client.execute(
          'SELECT * FROM quality_snapshots ORDER BY recorded_at DESC LIMIT 1'
        );
        const row = getRow(result);
        return row ? rowToSnapshot(row) : null;
      },

      getTaskSnapshots: async (taskId: string): Promise<QualitySnapshot[]> => {
        const result = await client.execute({
          sql: 'SELECT * FROM quality_snapshots WHERE task_id = ? ORDER BY recorded_at ASC',
          args: [taskId],
        });
        return getRows(result).map(rowToSnapshot);
      },

      getBaseline: async (): Promise<QualityBaseline | null> => {
        const result = await client.execute('SELECT * FROM quality_baseline WHERE id = 1');
        const row = getRow(result);
        return row ? rowToBaseline(row) : null;
      },

      setBaseline: async (
        baseline: Omit<QualityBaseline, 'createdAt' | 'updatedAt'>
      ): Promise<QualityBaseline> => {
        const now = new Date().toISOString();

        await client.execute({
          sql: `
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
          `,
          args: [
            baseline.buildSuccess ? 1 : 0,
            baseline.typeErrors,
            baseline.lintErrors,
            baseline.lintWarnings,
            baseline.testsPassing,
            baseline.testsFailing,
            baseline.testCoverage,
            baseline.setBy || null,
            now,
            now,
          ],
        });

        const result = await client.execute('SELECT * FROM quality_baseline WHERE id = 1');
        return rowToBaseline(getRow(result)!);
      },

      detectRegressions: async (snapshot: QualitySnapshot): Promise<Regression[]> => {
        const baseline = await self.quality.getBaseline();
        if (!baseline) return [];

        const regressions: Regression[] = [];

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
