import type { DataLayer, Task, AgentStatus } from '@jetpack-agent/data';
import type {
  AgentHarnessConfig,
  ModelAdapter,
  AgentEventCallback,
  AgentStats,
  PromptTemplate,
  ExecutionResult,
} from './types.js';
import { DefaultPromptTemplate } from './types.js';

/**
 * Agent Harness - wraps any model adapter to participate in the swarm
 *
 * The harness handles:
 * - Registration with the swarm
 * - Heartbeat management
 * - Task claiming and execution
 * - Progress reporting
 * - Error handling and retries
 */
export class AgentHarness {
  private dataLayer: DataLayer;
  private config: AgentHarnessConfig;
  private model: ModelAdapter;
  private promptTemplate: PromptTemplate;

  private running = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private workTimer: ReturnType<typeof setInterval> | null = null;

  private currentTaskId: string | null = null;
  private currentTaskStartedAt: Date | null = null;
  private status: AgentStatus = 'idle';

  private stats: AgentStats = {
    tasksCompleted: 0,
    tasksFailed: 0,
    totalRuntimeMinutes: 0,
    currentTaskId: null,
    currentTaskStartedAt: null,
    lastHeartbeat: null,
    status: 'idle',
  };

  private eventCallbacks: AgentEventCallback[] = [];

  constructor(
    dataLayer: DataLayer,
    config: AgentHarnessConfig,
    promptTemplate: PromptTemplate = DefaultPromptTemplate
  ) {
    this.dataLayer = dataLayer;
    this.config = config;
    this.model = config.model;
    this.promptTemplate = promptTemplate;
  }

  /**
   * Start the agent
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Agent is already running');
    }

    // Check if model is available
    const available = await this.model.isAvailable();
    if (!available) {
      throw new Error(`Model ${this.model.provider}/${this.model.model} is not available`);
    }

    // Register with the swarm
    await this.dataLayer.agents.register({
      id: this.config.id,
      name: this.config.name,
      type: this.config.type,
      capabilities: {
        skills: this.config.skills,
        maxTaskMinutes: this.config.maxTaskMinutes ?? 60,
        canRunTests: this.config.canRunTests ?? true,
        canRunBuild: this.config.canRunBuild ?? true,
        canAccessBrowser: this.config.canAccessBrowser ?? false,
      },
      machine: this.config.machine
        ? {
            id: this.config.machine.id,
            hostname: this.config.machine.hostname,
            pid: process.pid,
          }
        : undefined,
    });

    this.running = true;
    this.status = 'idle';

    // Start heartbeat
    const heartbeatInterval = this.config.heartbeatIntervalMs ?? 30000;
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), heartbeatInterval);

    // Start work polling
    const workInterval = this.config.workPollingIntervalMs ?? 10000;
    this.workTimer = setInterval(() => this.lookForWork(), workInterval);

    // Send initial heartbeat
    await this.sendHeartbeat();

    // Broadcast agent started
    await this.dataLayer.messages.broadcast({
      type: 'agent.started',
      fromAgent: this.config.id,
      payload: {
        name: this.config.name,
        skills: this.config.skills,
        type: this.config.type,
      },
    });

    this.emitEvent({ type: 'started' });

    // Look for work immediately
    this.lookForWork();
  }

  /**
   * Stop the agent gracefully
   */
  async stop(reason = 'shutdown'): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;
    this.status = 'offline';

    // Clear timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.workTimer) {
      clearInterval(this.workTimer);
      this.workTimer = null;
    }

    // Release any current task
    if (this.currentTaskId) {
      await this.dataLayer.tasks.release(this.currentTaskId, reason);
      this.currentTaskId = null;
    }

    // Release all file leases
    await this.dataLayer.leases.releaseAll(this.config.id);

    // Broadcast agent stopped
    await this.dataLayer.messages.broadcast({
      type: 'agent.stopped',
      fromAgent: this.config.id,
      payload: { reason },
    });

    // Deregister from swarm
    await this.dataLayer.agents.deregister(this.config.id);

    this.emitEvent({ type: 'stopped', reason });
  }

  /**
   * Send a heartbeat to the swarm
   */
  private async sendHeartbeat(): Promise<void> {
    try {
      await this.dataLayer.agents.heartbeat(this.config.id, {
        status: this.status,
        currentTask: this.currentTaskId
          ? {
              id: this.currentTaskId,
              progress: 0, // Would be updated during execution
            }
          : undefined,
      });
      this.stats.lastHeartbeat = new Date();
      this.emitEvent({ type: 'heartbeat' });
    } catch (error) {
      this.emitEvent({ type: 'error', error: error as Error });
    }
  }

  /**
   * Look for available work
   */
  private async lookForWork(): Promise<void> {
    if (!this.running || this.status !== 'idle') {
      return;
    }

    try {
      // Try to claim a task that matches our skills
      const task = await this.dataLayer.tasks.claim(this.config.id, {
        skills: this.config.skills,
      });

      if (task) {
        await this.executeTask(task);
      }
    } catch (error) {
      this.emitEvent({ type: 'error', error: error as Error });
    }
  }

  /**
   * Execute a claimed task
   */
  private async executeTask(task: Task): Promise<void> {
    this.currentTaskId = task.id;
    this.currentTaskStartedAt = new Date();
    this.status = 'busy';
    this.stats.currentTaskId = task.id;
    this.stats.currentTaskStartedAt = this.currentTaskStartedAt;

    // Update agent in data layer
    await this.dataLayer.agents.setCurrentTask(this.config.id, task.id);
    await this.sendHeartbeat();

    this.emitEvent({ type: 'task_claimed', taskId: task.id });

    // Broadcast task claimed
    await this.dataLayer.messages.broadcast({
      type: 'task.claimed',
      fromAgent: this.config.id,
      payload: {
        taskId: task.id,
        agentName: this.config.name,
        skills: this.config.skills,
      },
    });

    // Mark task as in progress
    await this.dataLayer.tasks.updateProgress(task.id, {
      phase: 'analyzing',
      percentComplete: 0,
      description: 'Starting task execution',
    });

    this.emitEvent({ type: 'task_started', taskId: task.id });

    try {
      // Acquire file leases for files mentioned in task
      const filesToLock = task.files || [];
      for (const file of filesToLock) {
        const acquired = await this.dataLayer.leases.acquire({
          filePath: file,
          agentId: this.config.id,
          taskId: task.id,
          durationMs: (this.config.maxTaskMinutes ?? 60) * 60 * 1000,
        });

        if (!acquired) {
          throw new Error(`Could not acquire lease on file: ${file}`);
        }
      }

      // Generate prompts
      const systemPrompt = this.promptTemplate.generateSystemPrompt({
        agentName: this.config.name,
        skills: this.config.skills,
        workDir: this.config.workDir,
      });

      const taskPrompt = this.promptTemplate.generateTaskPrompt({
        task,
        context: [], // TODO: Get context from CASS memory
      });

      // Execute with model
      const result = await this.model.execute(
        {
          task,
          systemPrompt,
          messages: [{ role: 'user', content: taskPrompt }],
          workDir: this.config.workDir,
          timeoutMs: (this.config.maxTaskMinutes ?? 60) * 60 * 1000,
        },
        (progress) => {
          // Report progress
          this.dataLayer.tasks.updateProgress(task.id, progress);
          this.emitEvent({ type: 'task_progress', taskId: task.id, progress });
        },
        (chunk) => {
          // Handle output chunk (for streaming)
          // Could be used for TUI display
        }
      );

      // Release file leases
      for (const file of filesToLock) {
        await this.dataLayer.leases.release(file, this.config.id);
      }

      if (result.success) {
        await this.completeTask(task, result);
      } else {
        await this.failTask(task, result);
      }
    } catch (error) {
      // Release file leases on error
      for (const file of task.files || []) {
        await this.dataLayer.leases.release(file, this.config.id);
      }

      await this.failTask(task, {
        success: false,
        output: '',
        filesCreated: [],
        filesModified: [],
        filesDeleted: [],
        error: (error as Error).message,
        durationMs: Date.now() - this.currentTaskStartedAt!.getTime(),
      });
    }
  }

  /**
   * Complete a task successfully
   */
  private async completeTask(task: Task, result: ExecutionResult): Promise<void> {
    const taskResult = {
      filesCreated: result.filesCreated,
      filesModified: result.filesModified,
      filesDeleted: result.filesDeleted,
      summary: result.output.substring(0, 1000), // Truncate for storage
      learnings: result.learnings,
    };

    await this.dataLayer.tasks.complete(task.id, taskResult);

    // Update stats
    const durationMinutes = result.durationMs / 60000;
    this.stats.tasksCompleted++;
    this.stats.totalRuntimeMinutes += durationMinutes;
    await this.dataLayer.agents.updateStats(this.config.id, true, durationMinutes);

    // Broadcast completion
    await this.dataLayer.messages.broadcast({
      type: 'task.completed',
      fromAgent: this.config.id,
      payload: {
        taskId: task.id,
        result: taskResult,
      },
    });

    this.emitEvent({ type: 'task_completed', taskId: task.id, result: taskResult });

    // Reset state
    this.currentTaskId = null;
    this.currentTaskStartedAt = null;
    this.status = 'idle';
    this.stats.currentTaskId = null;
    this.stats.currentTaskStartedAt = null;

    await this.dataLayer.agents.setCurrentTask(this.config.id, null);

    // Check for blocked tasks that might now be ready
    await this.dataLayer.tasks.updateBlockedToReady();
  }

  /**
   * Fail a task
   */
  private async failTask(task: Task, result: ExecutionResult): Promise<void> {
    const failure = {
      type: 'task_error' as const,
      message: result.error || 'Unknown error',
      recoverable: true,
    };

    await this.dataLayer.tasks.fail(task.id, failure);

    // Update stats
    const durationMinutes = result.durationMs / 60000;
    this.stats.tasksFailed++;
    this.stats.totalRuntimeMinutes += durationMinutes;
    await this.dataLayer.agents.updateStats(this.config.id, false, durationMinutes);

    // Broadcast failure
    await this.dataLayer.messages.broadcast({
      type: 'task.failed',
      fromAgent: this.config.id,
      payload: {
        taskId: task.id,
        failure,
      },
    });

    this.emitEvent({ type: 'task_failed', taskId: task.id, failure });

    // Reset state
    this.currentTaskId = null;
    this.currentTaskStartedAt = null;
    this.status = 'idle';
    this.stats.currentTaskId = null;
    this.stats.currentTaskStartedAt = null;

    await this.dataLayer.agents.setCurrentTask(this.config.id, null);
  }

  /**
   * Subscribe to agent events
   */
  onEvent(callback: AgentEventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      const index = this.eventCallbacks.indexOf(callback);
      if (index >= 0) {
        this.eventCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Emit an event to all subscribers
   */
  private emitEvent(event: Parameters<AgentEventCallback>[0]): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in event callback:', error);
      }
    }
  }

  /**
   * Get current agent stats
   */
  getStats(): AgentStats {
    return { ...this.stats, status: this.status };
  }

  /**
   * Get agent ID
   */
  get id(): string {
    return this.config.id;
  }

  /**
   * Get agent name
   */
  get name(): string {
    return this.config.name;
  }

  /**
   * Check if agent is running
   */
  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Check if agent is busy
   */
  get isBusy(): boolean {
    return this.status === 'busy';
  }
}
