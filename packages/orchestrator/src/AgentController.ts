import {
  Agent,
  AgentSkill,
  Task,
  Logger,
  generateAgentId,
  Message,
  MemoryEntry,
  getSkillRegistry,
  TaskPhase,
  TaskClaimedPayload,
  TaskProgressPayload,
  TaskCompletedPayload,
  TaskFailedPayload,
  AgentStatusPayload,
  ExecutionOutputEvent,
  QualitySettings,
} from '@jetpack-agent/shared';
import { spawn } from 'child_process';
import { BeadsAdapter } from '@jetpack-agent/beads-adapter';
import { MCPMailAdapter } from '@jetpack-agent/mcp-mail-adapter';
import { CASSAdapter } from '@jetpack-agent/cass-adapter';
import { ClaudeCodeExecutor } from './ClaudeCodeExecutor';

/** Quality metrics to report after task completion */
export interface TaskQualityMetrics {
  lintErrors?: number;
  lintWarnings?: number;
  typeErrors?: number;
  testsPassing?: number;
  testsFailing?: number;
  testCoverage?: number;
  buildSuccess?: boolean;
}

export interface AgentControllerConfig {
  name: string;
  skills: AgentSkill[];
  workDir: string;
  onStatusChange?: () => void | Promise<void>;
  onTaskComplete?: (agentId: string) => void;
  onTaskFailed?: (agentId: string, taskId: string, error: string) => void;
  onCycleComplete?: () => void;
  /** Callback for agent output events (for TUI dashboard) */
  onOutput?: (event: ExecutionOutputEvent) => void;
  /** Enable TUI mode (emit events instead of writing to stdout) */
  enableTuiMode?: boolean;
  /** Callback to report quality metrics after task completion (optional) */
  onQualityReport?: (taskId: string, agentId: string, metrics: TaskQualityMetrics) => Promise<void>;
  /** Interval for periodic work polling in ms (default: 30000 = 30 seconds) - BUG-5 fix */
  workPollingIntervalMs?: number;
  /** Quality check settings (default: check build and tests) */
  qualitySettings?: Partial<QualitySettings>;
}

/**
 * Agent statistics for rich messaging
 */
interface AgentStats {
  tasksCompleted: number;
  tasksFailed: number;
  totalCompletionMs: number;
  startTime: Date;
}

export class AgentController {
  private agent: Agent;
  private logger: Logger;
  private currentTask?: Task;
  private currentTaskStartTime?: Date;
  private currentPhase: TaskPhase = 'analyzing';
  private heartbeatInterval?: NodeJS.Timeout;
  private statusInterval?: NodeJS.Timeout;
  private workPollingTimer?: NodeJS.Timeout;  // BUG-5 fix: periodic work polling
  private executor: ClaudeCodeExecutor;
  private workDir: string;
  private config: AgentControllerConfig;
  private stats: AgentStats;

  constructor(
    config: AgentControllerConfig,
    private beads: BeadsAdapter,
    private mail: MCPMailAdapter,
    private cass: CASSAdapter
  ) {
    this.config = config;
    this.workDir = config.workDir;

    // Create executor with TUI mode if enabled
    this.executor = new ClaudeCodeExecutor(config.workDir, {
      emitOutputEvents: config.enableTuiMode ?? false,
    });

    // Forward executor output events to config callback
    if (config.onOutput) {
      this.executor.on('output', config.onOutput);
    }

    this.agent = {
      id: generateAgentId(config.name),
      name: config.name,
      status: 'idle',
      skills: config.skills,
      acquiredSkills: [],  // Dynamically acquired skills during runtime
      createdAt: new Date(),
      lastActive: new Date(),
    };
    this.stats = {
      tasksCompleted: 0,
      tasksFailed: 0,
      totalCompletionMs: 0,
      startTime: new Date(),
    };
    this.logger = new Logger(`Agent[${this.agent.name}]`);
  }

  /**
   * Update agent status and notify via callback
   */
  private async updateStatus(status: Agent['status'], currentTask?: string): Promise<void> {
    this.agent.status = status;
    this.agent.currentTask = currentTask;
    this.agent.lastActive = new Date();

    // Notify orchestrator of status change
    if (this.config.onStatusChange) {
      try {
        await this.config.onStatusChange();
      } catch (err) {
        this.logger.error('Failed to notify status change:', err);
      }
    }
  }

  async start(): Promise<void> {
    this.logger.info(`Starting agent ${this.agent.name}`);
    this.stats.startTime = new Date();

    // Subscribe to task broadcasts
    this.mail.subscribe('task.created', this.handleTaskCreated.bind(this));
    this.mail.subscribe('task.updated', this.handleTaskUpdated.bind(this));
    this.mail.subscribe('task.assigned', this.handleTaskAssigned.bind(this));

    // Start heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.mail.sendHeartbeat().catch(err => {
        this.logger.error('Failed to send heartbeat:', err);
      });
    }, 30000); // Every 30 seconds

    // Start rich status broadcasting (every 10 seconds)
    this.statusInterval = setInterval(() => {
      this.broadcastStatus().catch(err => {
        this.logger.error('Failed to broadcast status:', err);
      });
    }, 10000);

    // BUG-5 FIX: Start periodic work polling to catch missed events or newly-ready tasks
    // This ensures agents proactively look for work even if task.created/assigned messages are missed
    const pollingInterval = this.config.workPollingIntervalMs ?? 30000; // Default: 30 seconds
    this.workPollingTimer = setInterval(() => {
      if (this.agent.status === 'idle') {
        this.logger.debug('Periodic work poll triggered');
        this.lookForWork().catch(err => {
          this.logger.error('Error in periodic work poll:', err);
        });
      }
    }, pollingInterval);
    this.logger.info(`Work polling enabled every ${pollingInterval / 1000}s`);

    // Announce startup
    await this.mail.publish({
      id: '',
      type: 'agent.started',
      from: this.agent.id,
      payload: {
        name: this.agent.name,
        skills: this.agent.skills,
      },
      timestamp: new Date(),
    });

    // Start looking for work
    await this.lookForWork();

    this.logger.info(`Agent ${this.agent.name} started successfully`);
  }

  async stop(): Promise<void> {
    this.logger.info(`Stopping agent ${this.agent.name}`);

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }

    // BUG-5 FIX: Clear work polling timer
    if (this.workPollingTimer) {
      clearInterval(this.workPollingTimer);
      this.workPollingTimer = undefined;
    }

    // Announce shutdown
    await this.mail.publish({
      id: '',
      type: 'agent.stopped',
      from: this.agent.id,
      payload: {
        name: this.agent.name,
      },
      timestamp: new Date(),
    });

    await this.updateStatus('offline', undefined);
  }

  private async handleTaskCreated(message: Message): Promise<void> {
    // Acknowledge receipt if required
    if (message.ackRequired && message.id) {
      await this.mail.acknowledge(message.id, this.agent.id);
      this.logger.debug(`Acknowledged message ${message.id}`);
    }

    this.logger.debug('New task created, checking if suitable');
    await this.lookForWork();
  }

  private async handleTaskUpdated(message: Message): Promise<void> {
    // Acknowledge receipt if required
    if (message.ackRequired && message.id) {
      await this.mail.acknowledge(message.id, this.agent.id);
      this.logger.debug(`Acknowledged message ${message.id}`);
    }

    const taskId = message.payload.taskId as string;
    if (this.currentTask?.id === taskId) {
      this.logger.info('Current task was updated');
      this.currentTask = await this.beads.getTask(taskId) || undefined;
    }
  }

  private async handleTaskAssigned(message: Message): Promise<void> {
    // Acknowledge receipt if required
    if (message.ackRequired && message.id) {
      await this.mail.acknowledge(message.id, this.agent.id);
      this.logger.debug(`Acknowledged message ${message.id}`);
    }

    // Check if this task is assigned to us
    const targetAgentId = message.to;
    if (targetAgentId && targetAgentId === this.agent.id) {
      const taskId = message.payload.taskId as string;
      this.logger.info(`Task ${taskId} assigned to me, checking for work`);
      await this.lookForWork();
    } else if (!targetAgentId) {
      // Broadcast assignment - check if we should look for work
      this.logger.debug('Task assigned (broadcast), checking if suitable');
      await this.lookForWork();
    }
  }

  private async lookForWork(): Promise<void> {
    if (this.agent.status !== 'idle') {
      return; // Already working
    }

    const readyTasks = await this.beads.getReadyTasks();
    const registry = getSkillRegistry();

    // Score and filter tasks based on skill matching
    const scoredTasks = readyTasks.map(task => {
      // If task has no required skills, anyone can do it
      if (task.requiredSkills.length === 0) {
        return { task, score: 1, canAcquire: false, missingSkills: [] };
      }

      // Calculate match score using registry
      const score = registry.calculateMatchScore(this.agent.skills, task.requiredSkills);

      // Identify missing skills that could be acquired
      const missingSkills = registry.suggestSkillsToAcquire(
        this.agent.skills,
        task.requiredSkills
      );

      // Consider task if we have partial match (score > 0) or can acquire all missing skills
      const canAcquire = missingSkills.length > 0 && score < 1;

      return { task, score, canAcquire, missingSkills };
    });

    // Filter to tasks with at least partial match (score > 0) or acquirable skills
    const suitableTasks = scoredTasks.filter(
      ({ score, canAcquire }) => score > 0 || canAcquire
    );

    if (suitableTasks.length === 0) {
      this.logger.debug('No suitable tasks available');
      return;
    }

    // Sort by priority first, then by skill match score
    suitableTasks.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityOrder[b.task.priority] - priorityOrder[a.task.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.score - a.score;  // Higher score first
    });

    const { task, missingSkills } = suitableTasks[0];

    // Dynamically acquire missing skills if needed
    if (missingSkills.length > 0) {
      this.logger.info(`Acquiring skills for task: ${missingSkills.join(', ')}`);
      this.agent.skills.push(...missingSkills);
      if (!this.agent.acquiredSkills) {
        this.agent.acquiredSkills = [];
      }
      this.agent.acquiredSkills.push(...missingSkills);
      registry.normalizeSkills(this.agent.skills);  // Normalize to canonical IDs
    }

    await this.claimAndExecuteTask(task);
  }

  private async claimAndExecuteTask(
    task: Task,
    claimContext?: { readyTaskCount: number; matchedSkills: string[]; skillScore: number }
  ): Promise<void> {
    this.logger.info(`Attempting to claim task: ${task.id} - ${task.title}`);

    // Try to claim the task
    const claimed = await this.beads.claimTask(task.id, this.agent.id);
    if (!claimed) {
      this.logger.warn(`Failed to claim task ${task.id}, may have been claimed by another agent`);
      return;
    }

    this.currentTask = claimed;
    this.currentTaskStartTime = new Date();
    this.currentPhase = 'analyzing';
    await this.updateStatus('busy', task.id);

    // Build rich claim payload with reasoning
    const matchedSkills = claimContext?.matchedSkills || [];
    const skillScore = claimContext?.skillScore || 0;
    const readyTaskCount = claimContext?.readyTaskCount || 1;

    const claimPayload: TaskClaimedPayload = {
      taskId: task.id,
      taskTitle: task.title,
      agentName: this.agent.name,
      agentId: this.agent.id,
      reasoning: {
        matchedSkills,
        skillScore,
        why: this.buildClaimReasoning(task, matchedSkills, skillScore, readyTaskCount),
        estimatedDuration: task.estimatedMinutes || 30,
        alternativesConsidered: readyTaskCount - 1,
      },
      context: {
        totalReadyTasks: readyTaskCount,
        busyAgentCount: 0, // Would need orchestrator context
        taskPriority: task.priority,
        taskType: task.tags?.find(t => t.startsWith('type:'))?.replace('type:', ''),
      },
    };

    // Notify other agents with rich payload
    await this.mail.publish({
      id: '',
      type: 'task.claimed',
      from: this.agent.id,
      payload: claimPayload as unknown as Record<string, unknown>,
      timestamp: new Date(),
    });

    // Retrieve relevant memories for context using semantic search
    const queryText = `${task.title} ${task.description || ''}`;
    const memories = await this.cass.semanticSearchByQuery(queryText, 5);
    this.logger.debug(`Retrieved ${memories.length} relevant memories via semantic search`);

    try {
      // Broadcast progress: analyzing
      await this.broadcastProgress('analyzing', `Analyzing task: ${task.title}`, 10);

      // Execute the task with file locking protection
      await this.broadcastProgress('executing', `Executing task with file locking protection`, 30);
      await this.executeTaskWithLocking(claimed, memories);

      // Calculate duration
      const durationMs = this.currentTaskStartTime
        ? Date.now() - this.currentTaskStartTime.getTime()
        : 0;
      const actualMinutes = Math.round(durationMs / 60000);

      // Update stats
      this.stats.tasksCompleted++;
      this.stats.totalCompletionMs += durationMs;

      // Mark task as completed
      await this.beads.updateTask(task.id, {
        status: 'completed',
        completedAt: new Date(),
        actualMinutes,
      });

      // Store learnings in CASS
      await this.cass.store({
        type: 'agent_learning',
        content: `Completed task: ${task.title}. ${task.description || ''}`,
        importance: 0.6,
        metadata: {
          taskId: task.id,
          agentId: this.agent.id,
          skills: task.requiredSkills,
          durationMs,
        },
      });

      // Build rich completion payload
      const completedPayload: TaskCompletedPayload = {
        taskId: task.id,
        taskTitle: task.title,
        agentName: this.agent.name,
        agentId: this.agent.id,
        summary: `Successfully completed "${task.title}"`,
        durationMs,
        actualMinutes,
      };

      // Notify completion with rich payload
      await this.mail.publish({
        id: '',
        type: 'task.completed',
        from: this.agent.id,
        payload: completedPayload as unknown as Record<string, unknown>,
        timestamp: new Date(),
      });

      this.logger.info(`Successfully completed task: ${task.id} in ${actualMinutes}m`);

      // Notify orchestrator of task completion for metrics
      if (this.config.onTaskComplete) {
        this.config.onTaskComplete(this.agent.id);
      }

      // Report quality metrics if callback is configured (Enhancement 5)
      // Runs actual build/test/lint checks based on qualitySettings
      if (this.config.onQualityReport) {
        try {
          await this.broadcastProgress('validating', 'Running quality checks (build, tests)', 90);
          const metrics = await this.collectQualityMetrics();
          this.logger.info(`Quality metrics for task ${task.id}:`, metrics);
          await this.config.onQualityReport(task.id, this.agent.id, metrics);
        } catch (err) {
          this.logger.warn('Failed to collect quality metrics:', err);
          // Report partial metrics on error
          await this.config.onQualityReport(task.id, this.agent.id, {
            buildSuccess: true, // Assume success if we can't check
          });
        }
      }
    } catch (error) {
      const errorMessage = (error as Error).message;
      this.logger.error(`Failed to execute task ${task.id}:`, error);

      // Calculate duration even on failure
      const durationMs = this.currentTaskStartTime
        ? Date.now() - this.currentTaskStartTime.getTime()
        : 0;

      // Determine failure type from error message
      let failureType: 'error' | 'timeout' | 'stalled' | 'blocked' = 'error';
      if (errorMessage.includes('timed out')) {
        failureType = 'timeout';
      } else if (errorMessage.includes('stalled') || errorMessage.includes('no output')) {
        failureType = 'stalled';
      } else if (errorMessage.includes('FILE_LOCKED') || errorMessage.includes('blocked')) {
        failureType = 'blocked';
      }

      // Implement retry logic with exponential backoff
      const currentRetryCount = task.retryCount || 0;
      const maxRetries = task.maxRetries ?? 2;
      const nextRetryCount = currentRetryCount + 1;
      const willRetry = nextRetryCount <= maxRetries;

      // Build rich failure payload
      const failedPayload: TaskFailedPayload = {
        taskId: task.id,
        taskTitle: task.title,
        agentName: this.agent.name,
        agentId: this.agent.id,
        error: errorMessage,
        failureType,
        phase: this.currentPhase,
        durationMs,
        retryCount: nextRetryCount,
        maxRetries,
        willRetry,
        nextRetryIn: willRetry ? 30000 * Math.pow(2, currentRetryCount) : undefined,
      };

      if (willRetry) {
        // Calculate exponential backoff: 30s, 60s, 120s
        const backoffMs = 30000 * Math.pow(2, currentRetryCount);

        this.logger.info(
          `Task ${task.id} failed (${failureType}) at ${this.currentPhase} phase, scheduling retry ${nextRetryCount}/${maxRetries} in ${backoffMs / 1000}s`
        );

        // Update task for retry - set status back to 'ready' so it can be claimed again
        await this.beads.updateTask(task.id, {
          status: 'ready',
          assignedAgent: undefined, // Release the task so any agent can claim it
          retryCount: nextRetryCount,
          lastError: errorMessage,
          lastAttemptAt: new Date(),
          failureType,
        });

        // Notify about retry scheduling with rich payload
        await this.mail.publish({
          id: '',
          type: 'task.retry_scheduled',
          from: this.agent.id,
          payload: failedPayload as unknown as Record<string, unknown>,
          timestamp: new Date(),
        });

        // Schedule a delayed lookup for work (to handle the backoff)
        // Note: The task is now 'ready' and any agent can pick it up
        // This delay just gives some breathing room
      } else {
        // Max retries exceeded - mark as permanently failed
        this.logger.error(
          `Task ${task.id} permanently failed after ${maxRetries} retries at ${this.currentPhase} phase: ${errorMessage}`
        );

        // Update stats on permanent failure
        this.stats.tasksFailed++;

        await this.beads.updateTask(task.id, {
          status: 'failed',
          retryCount: nextRetryCount,
          lastError: `Failed after ${maxRetries} retries: ${errorMessage}`,
          lastAttemptAt: new Date(),
          failureType,
        });

        // Publish rich failure message
        await this.mail.publish({
          id: '',
          type: 'task.failed',
          from: this.agent.id,
          payload: failedPayload as unknown as Record<string, unknown>,
          timestamp: new Date(),
        });

        // Notify orchestrator of permanent task failure
        if (this.config.onTaskFailed) {
          this.config.onTaskFailed(this.agent.id, task.id, errorMessage);
        }
      }
    } finally {
      this.currentTask = undefined;
      this.currentTaskStartTime = undefined;
      this.currentPhase = 'analyzing'; // Reset to initial phase
      await this.updateStatus('idle', undefined);

      // Notify orchestrator of cycle completion
      if (this.config.onCycleComplete) {
        this.config.onCycleComplete();
      }

      // Look for more work
      setTimeout(() => this.lookForWork(), 1000);
    }
  }

  /**
   * Extract file paths mentioned in task title/description for pre-locking
   */
  private predictFilesToModify(task: Task): string[] {
    // Match common source file patterns
    const filePattern = /(?:src|lib|packages|apps|test|tests)\/[\w\/.-]+\.\w+/g;
    const mentioned = [
      ...(task.title.match(filePattern) || []),
      ...(task.description?.match(filePattern) || []),
    ];
    return [...new Set(mentioned)];
  }

  /**
   * Execute task with file locking to prevent concurrent edits
   */
  private async executeTaskWithLocking(task: Task, memories: MemoryEntry[]): Promise<void> {
    const filesToModify = this.predictFilesToModify(task);
    const acquiredLeases: string[] = [];

    try {
      // Acquire leases for predicted files
      for (const file of filesToModify) {
        const acquired = await this.mail.acquireLease(file, 120000); // 2 min lease
        if (!acquired) {
          const status = await this.mail.isLeased(file);
          this.logger.warn(`File ${file} locked by ${status.agentId}, cannot proceed`);
          throw new Error(`FILE_LOCKED:${file}:${status.agentId}`);
        }
        acquiredLeases.push(file);
        this.logger.debug(`Acquired lease on ${file}`);
      }

      // Broadcast lock acquisition if we have files
      if (acquiredLeases.length > 0) {
        await this.mail.publish({
          id: '',
          type: 'file.lock',
          from: this.agent.id,
          payload: { files: acquiredLeases, taskId: task.id },
          timestamp: new Date(),
        });
      }

      // Execute the actual task
      await this.executeTask(task, memories);

    } finally {
      // Release all acquired leases
      for (const file of acquiredLeases) {
        await this.mail.releaseLease(file);
        this.logger.debug(`Released lease on ${file}`);
      }

      // Broadcast unlock if we had files
      if (acquiredLeases.length > 0) {
        await this.mail.publish({
          id: '',
          type: 'file.unlock',
          from: this.agent.id,
          payload: { files: acquiredLeases, taskId: task.id },
          timestamp: new Date(),
        });
      }
    }
  }

  private async executeTask(task: Task, memories: MemoryEntry[]): Promise<void> {
    this.logger.info(`Executing task: ${task.title}`);

    await this.beads.updateTask(task.id, { status: 'in_progress' });

    // Execute using Claude Code CLI
    const result = await this.executor.execute({
      task,
      memories,
      workDir: this.workDir,
      agentId: this.agent.id,
      agentName: this.agent.name,
      agentSkills: this.agent.skills,
    });

    if (!result.success) {
      throw new Error(result.error || 'Task execution failed');
    }

    this.logger.info(`Task executed in ${result.duration}ms`);

    // Store the execution output as a learning
    if (result.output) {
      await this.cass.store({
        type: 'agent_learning',
        content: `Task "${task.title}" output: ${result.output.slice(0, 500)}`,
        importance: 0.5,
        metadata: {
          taskId: task.id,
          agentId: this.agent.id,
          duration: result.duration,
        },
      });
    }
  }

  getAgent(): Agent {
    return { ...this.agent };
  }

  getCurrentTask(): Task | undefined {
    return this.currentTask;
  }

  // ============================================================================
  // Rich Agent Messaging (Enhancement 4)
  // ============================================================================

  /**
   * Broadcast detailed agent status
   */
  private async broadcastStatus(): Promise<void> {
    const avgCompletionMs = this.stats.tasksCompleted > 0
      ? this.stats.totalCompletionMs / this.stats.tasksCompleted
      : 0;

    const payload: AgentStatusPayload = {
      agentId: this.agent.id,
      agentName: this.agent.name,
      status: this.agent.status,
      currentTask: this.currentTask && this.currentTaskStartTime ? {
        taskId: this.currentTask.id,
        taskTitle: this.currentTask.title,
        phase: this.currentPhase,
        startedAt: this.currentTaskStartTime.toISOString(),
        elapsedMs: Date.now() - this.currentTaskStartTime.getTime(),
      } : undefined,
      stats: {
        tasksCompleted: this.stats.tasksCompleted,
        tasksFailed: this.stats.tasksFailed,
        avgCompletionMs: Math.round(avgCompletionMs),
        uptime: Date.now() - this.stats.startTime.getTime(),
      },
      skills: this.agent.skills,
      acquiredSkills: this.agent.acquiredSkills || [],
    };

    await this.mail.publish({
      id: '',
      type: 'agent.status',
      from: this.agent.id,
      payload: payload as unknown as Record<string, unknown>,
      timestamp: new Date(),
    });
  }

  /**
   * Broadcast progress during task execution
   */
  private async broadcastProgress(
    phase: TaskPhase,
    description: string,
    percentComplete: number
  ): Promise<void> {
    if (!this.currentTask || !this.currentTaskStartTime) return;

    this.currentPhase = phase;

    const payload: TaskProgressPayload = {
      taskId: this.currentTask.id,
      taskTitle: this.currentTask.title,
      agentName: this.agent.name,
      agentId: this.agent.id,
      phase,
      description,
      percentComplete,
      elapsedMs: Date.now() - this.currentTaskStartTime.getTime(),
    };

    await this.mail.publish({
      id: '',
      type: 'task.progress',
      from: this.agent.id,
      payload: payload as unknown as Record<string, unknown>,
      timestamp: new Date(),
    });
  }

  /**
   * Build a rich "why I claimed this task" explanation
   */
  private buildClaimReasoning(
    task: Task,
    matchedSkills: string[],
    skillScore: number,
    readyTaskCount: number
  ): string {
    const reasons: string[] = [];

    if (task.priority === 'critical') {
      reasons.push('critical priority task');
    } else if (task.priority === 'high') {
      reasons.push('high priority task');
    }

    if (skillScore >= 0.9) {
      reasons.push('excellent skill match');
    } else if (skillScore >= 0.7) {
      reasons.push('good skill match');
    }

    if (matchedSkills.length > 0) {
      reasons.push(`matched skills: ${matchedSkills.join(', ')}`);
    }

    if (readyTaskCount === 1) {
      reasons.push('only available task');
    }

    return reasons.length > 0
      ? reasons.join('; ')
      : 'selected based on availability';
  }

  getStats(): AgentStats {
    return { ...this.stats };
  }

  // ============================================================================
  // Quality Metrics Collection (Enhancement 5)
  // ============================================================================

  /**
   * Run a shell command and capture output
   */
  private async runShellCommand(
    command: string,
    args: string[],
    timeoutMs: number = 120000
  ): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        cwd: this.workDir,
        shell: true,
        timeout: timeoutMs,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          stdout,
          stderr,
          exitCode: code,
        });
      });

      proc.on('error', (err) => {
        resolve({
          success: false,
          stdout,
          stderr: err.message,
          exitCode: null,
        });
      });
    });
  }

  /**
   * Parse test output to extract pass/fail counts
   * Supports common test runners: vitest, jest, mocha
   */
  private parseTestOutput(output: string): { passing: number; failing: number } {
    let passing = 0;
    let failing = 0;

    // Vitest format: "✓ Tests  3 passed (3)"  or "Tests  3 passed | 1 failed"
    const vitestMatch = output.match(/Tests?\s+(\d+)\s+passed(?:\s+\|?\s*(\d+)\s+failed)?/i);
    if (vitestMatch) {
      passing = parseInt(vitestMatch[1], 10);
      failing = vitestMatch[2] ? parseInt(vitestMatch[2], 10) : 0;
      return { passing, failing };
    }

    // Jest format: "Tests:       3 passed, 1 failed, 4 total"
    const jestMatch = output.match(/Tests:\s*(\d+)\s+passed,?\s*(\d+)?\s*failed?/i);
    if (jestMatch) {
      passing = parseInt(jestMatch[1], 10);
      failing = jestMatch[2] ? parseInt(jestMatch[2], 10) : 0;
      return { passing, failing };
    }

    // Mocha format: "3 passing" and "1 failing"
    const mochaPassMatch = output.match(/(\d+)\s+passing/i);
    const mochaFailMatch = output.match(/(\d+)\s+failing/i);
    if (mochaPassMatch) {
      passing = parseInt(mochaPassMatch[1], 10);
    }
    if (mochaFailMatch) {
      failing = parseInt(mochaFailMatch[1], 10);
    }

    return { passing, failing };
  }

  /**
   * Parse lint output to extract error/warning counts
   * Supports common linters: eslint, tsc
   */
  private parseLintOutput(output: string): { errors: number; warnings: number } {
    let errors = 0;
    let warnings = 0;

    // ESLint format: "✖ 5 problems (2 errors, 3 warnings)"
    const eslintMatch = output.match(/(\d+)\s+problems?\s*\((\d+)\s+errors?,?\s*(\d+)\s+warnings?\)/i);
    if (eslintMatch) {
      errors = parseInt(eslintMatch[2], 10);
      warnings = parseInt(eslintMatch[3], 10);
      return { errors, warnings };
    }

    // Alternative ESLint: "2 errors and 3 warnings"
    const altMatch = output.match(/(\d+)\s+errors?\s+and\s+(\d+)\s+warnings?/i);
    if (altMatch) {
      errors = parseInt(altMatch[1], 10);
      warnings = parseInt(altMatch[2], 10);
      return { errors, warnings };
    }

    // TypeScript: "Found 5 errors"
    const tscMatch = output.match(/Found\s+(\d+)\s+errors?/i);
    if (tscMatch) {
      errors = parseInt(tscMatch[1], 10);
      return { errors, warnings: 0 };
    }

    // Count "error" lines as a fallback
    const errorLines = (output.match(/error\s*:/gi) || []).length;
    const warningLines = (output.match(/warning\s*:/gi) || []).length;

    return { errors: errorLines, warnings: warningLines };
  }

  /**
   * Collect quality metrics by running build/test/lint commands
   * This runs actual quality checks on the codebase
   */
  private async collectQualityMetrics(): Promise<TaskQualityMetrics> {
    const settings = this.config.qualitySettings ?? {};
    const checkBuild = settings.checkBuild !== false; // Default: true
    const checkTests = settings.checkTests !== false; // Default: true
    const checkLint = settings.checkLint ?? false;     // Default: false (can be slow)

    this.logger.debug('Collecting quality metrics...', { checkBuild, checkTests, checkLint });

    const metrics: TaskQualityMetrics = {};

    // Run checks in parallel for efficiency
    const checks: Promise<void>[] = [];

    // Build check (pnpm build or npm run build)
    if (checkBuild) {
      checks.push(
        this.runShellCommand('pnpm', ['build'], 180000).then((result) => {
          metrics.buildSuccess = result.success;
          if (!result.success) {
            // Try to extract type errors from build output
            const { errors } = this.parseLintOutput(result.stderr + result.stdout);
            metrics.typeErrors = errors;
            this.logger.debug(`Build failed: ${errors} type errors detected`);
          } else {
            metrics.typeErrors = 0;
            this.logger.debug('Build succeeded');
          }
        }).catch((err) => {
          this.logger.warn('Build check failed:', err);
          metrics.buildSuccess = false;
        })
      );
    }

    // Test check (pnpm test --run or npm test -- --run)
    if (checkTests) {
      checks.push(
        this.runShellCommand('pnpm', ['test', '--run'], 180000).then((result) => {
          const { passing, failing } = this.parseTestOutput(result.stdout + result.stderr);
          metrics.testsPassing = passing;
          metrics.testsFailing = failing;
          this.logger.debug(`Tests: ${passing} passing, ${failing} failing`);
        }).catch((err) => {
          this.logger.warn('Test check failed:', err);
          metrics.testsFailing = 1;
          metrics.testsPassing = 0;
        })
      );
    }

    // Lint check (pnpm lint)
    if (checkLint) {
      checks.push(
        this.runShellCommand('pnpm', ['lint'], 120000).then((result) => {
          const { errors, warnings } = this.parseLintOutput(result.stdout + result.stderr);
          metrics.lintErrors = errors;
          metrics.lintWarnings = warnings;
          this.logger.debug(`Lint: ${errors} errors, ${warnings} warnings`);
        }).catch((err) => {
          this.logger.warn('Lint check failed:', err);
          metrics.lintErrors = 0;
          metrics.lintWarnings = 0;
        })
      );
    }

    // Wait for all checks to complete
    await Promise.allSettled(checks);

    return metrics;
  }
}
