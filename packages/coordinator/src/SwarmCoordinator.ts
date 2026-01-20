import type { DataLayer, Task, Agent, TaskFilter } from '@jetpack-agent/data';
import { AgentHarness, type AgentEvent } from '@jetpack-agent/agent-harness';
import type {
  CoordinatorConfig,
  AgentSpawnConfig,
  CoordinatorEvent,
  SwarmStats,
  DistributionResult,
  ManagedAgent,
  AgentHealth,
  ClaimStrategy,
} from './types.js';

/**
 * Default configuration values
 */
const DEFAULTS = {
  maxAgents: 10,
  heartbeatTimeoutMs: 60_000, // 1 minute
  distributionIntervalMs: 5_000, // 5 seconds
  stalledTimeoutMs: 300_000, // 5 minutes
  claimStrategy: 'best-fit' as ClaimStrategy,
};

/**
 * SwarmCoordinator manages agent lifecycle and work distribution
 *
 * Unlike a monolithic orchestrator, the coordinator is:
 * - Stateless (all state in DataLayer)
 * - Fault-tolerant (agents operate independently)
 * - Horizontally scalable (multiple coordinators can run)
 */
export class SwarmCoordinator {
  private dataLayer: DataLayer;
  private config: Required<
    Pick<
      CoordinatorConfig,
      | 'workDir'
      | 'maxAgents'
      | 'heartbeatTimeoutMs'
      | 'distributionIntervalMs'
      | 'stalledTimeoutMs'
      | 'claimStrategy'
    >
  > &
    CoordinatorConfig;
  private agents: Map<string, ManagedAgent> = new Map();
  private running = false;
  private distributionInterval: ReturnType<typeof setInterval> | null = null;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private startTime: number = 0;
  private roundRobinIndex = 0;

  // Statistics tracking
  private stats = {
    completedTasks: 0,
    failedTasks: 0,
    totalTaskDurationMs: 0,
    taskCount: 0,
    distributionsLastMinute: [] as number[],
  };

  constructor(dataLayer: DataLayer, config: CoordinatorConfig) {
    this.dataLayer = dataLayer;
    this.config = {
      ...config,
      maxAgents: config.maxAgents ?? DEFAULTS.maxAgents,
      heartbeatTimeoutMs: config.heartbeatTimeoutMs ?? DEFAULTS.heartbeatTimeoutMs,
      distributionIntervalMs:
        config.distributionIntervalMs ?? DEFAULTS.distributionIntervalMs,
      stalledTimeoutMs: config.stalledTimeoutMs ?? DEFAULTS.stalledTimeoutMs,
      claimStrategy: config.claimStrategy ?? DEFAULTS.claimStrategy,
    };
  }

  /**
   * Start the coordinator
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Coordinator already running');
    }

    this.running = true;
    this.startTime = Date.now();

    // Start automatic work distribution if enabled
    if (this.config.autoDistribute !== false) {
      this.distributionInterval = setInterval(
        () => this.distributeWork().catch(console.error),
        this.config.distributionIntervalMs
      );
    }

    // Start health monitoring if enabled
    if (this.config.monitorHealth !== false) {
      this.healthCheckInterval = setInterval(
        () => this.checkAgentHealth().catch(console.error),
        this.config.heartbeatTimeoutMs / 2
      );
    }

    this.emit({ type: 'coordinator_started' });
  }

  /**
   * Stop the coordinator and all managed agents
   */
  async stop(reason = 'shutdown'): Promise<void> {
    if (!this.running) return;

    this.running = false;

    // Clear intervals
    if (this.distributionInterval) {
      clearInterval(this.distributionInterval);
      this.distributionInterval = null;
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Stop all agents gracefully
    const stopPromises = Array.from(this.agents.values()).map(async (managed) => {
      try {
        await managed.harness.stop();
      } catch (error) {
        console.error(`Error stopping agent ${managed.harness.id}:`, error);
      }
    });

    await Promise.all(stopPromises);
    this.agents.clear();

    this.emit({ type: 'coordinator_stopped', reason });
  }

  /**
   * Spawn a new agent
   */
  async spawnAgent(config: AgentSpawnConfig): Promise<string> {
    if (this.agents.size >= this.config.maxAgents) {
      throw new Error(`Maximum agent limit reached (${this.config.maxAgents})`);
    }

    const agentId = config.id ?? this.generateAgentId();

    const harness = new AgentHarness(
      this.dataLayer,
      {
        id: agentId,
        name: config.name,
        type: config.type,
        model: config.adapter,
        skills: config.skills ?? [],
        workDir: config.workDir,
        maxTaskMinutes: config.maxTaskMinutes ?? 60,
      },
      config.promptTemplate
    );

    // Subscribe to agent events
    harness.onEvent((event) => this.handleAgentEvent(agentId, event));

    // Start the agent
    await harness.start();

    const managed: ManagedAgent = {
      harness,
      config,
      spawnedAt: new Date(),
      health: {
        agentId,
        status: 'healthy',
        lastHeartbeat: new Date(),
        currentTaskId: null,
        taskStartedAt: null,
        taskProgress: 0,
        consecutiveFailures: 0,
        uptimeMs: 0,
      },
    };

    this.agents.set(agentId, managed);
    this.emit({ type: 'agent_spawned', agentId, name: config.name });

    return agentId;
  }

  /**
   * Stop a specific agent
   */
  async stopAgent(agentId: string, reason = 'requested'): Promise<void> {
    const managed = this.agents.get(agentId);
    if (!managed) {
      throw new Error(`Agent ${agentId} not found`);
    }

    await managed.harness.stop();
    this.agents.delete(agentId);
    this.emit({ type: 'agent_stopped', agentId, reason });
  }

  /**
   * Distribute pending work to available agents
   */
  async distributeWork(): Promise<DistributionResult> {
    const result: DistributionResult = {
      distributed: 0,
      unmatched: [],
      assignments: [],
    };

    // Get ready tasks
    const readyTasks = await this.dataLayer.tasks.list({
      status: 'ready',
      limit: 100,
    });

    if (readyTasks.length === 0) {
      return result;
    }

    // Get available agents (idle and healthy)
    const availableAgents = Array.from(this.agents.values()).filter(
      (managed) =>
        managed.health.status === 'healthy' &&
        managed.harness.getStats().currentTaskId === null
    );

    if (availableAgents.length === 0) {
      result.unmatched = readyTasks.map((t) => t.id);
      return result;
    }

    // Distribute tasks based on strategy
    for (const task of readyTasks) {
      if (availableAgents.length === 0) {
        result.unmatched.push(task.id);
        continue;
      }

      const assignment = this.selectAgent(task, availableAgents);

      if (assignment) {
        // Task will be claimed by the agent's internal loop
        // We just mark that an assignment was made
        result.distributed++;
        result.assignments.push({
          taskId: task.id,
          agentId: assignment.agentId,
          skillMatch: assignment.skillScore,
        });

        // Remove agent from available pool
        const idx = availableAgents.findIndex(
          (a) => a.harness.id === assignment.agentId
        );
        if (idx !== -1) {
          availableAgents.splice(idx, 1);
        }

        this.emit({
          type: 'task_distributed',
          taskId: task.id,
          agentId: assignment.agentId,
        });
      } else {
        result.unmatched.push(task.id);
      }
    }

    // Track throughput
    this.stats.distributionsLastMinute.push(Date.now());
    // Keep only last minute
    const oneMinuteAgo = Date.now() - 60_000;
    this.stats.distributionsLastMinute = this.stats.distributionsLastMinute.filter(
      (t) => t > oneMinuteAgo
    );

    this.emit({
      type: 'distribution_cycle',
      tasksDistributed: result.distributed,
      pendingTasks: result.unmatched.length,
    });

    return result;
  }

  /**
   * Select the best agent for a task based on claim strategy
   */
  private selectAgent(
    task: Task,
    availableAgents: ManagedAgent[]
  ): { agentId: string; skillScore: number } | null {
    const requiredSkills = task.requiredSkills || [];

    switch (this.config.claimStrategy) {
      case 'first-fit':
        return this.selectFirstFit(task, availableAgents, requiredSkills);

      case 'best-fit':
        return this.selectBestFit(task, availableAgents, requiredSkills);

      case 'round-robin':
        return this.selectRoundRobin(task, availableAgents, requiredSkills);

      case 'load-balanced':
        return this.selectLoadBalanced(task, availableAgents, requiredSkills);

      default:
        return this.selectBestFit(task, availableAgents, requiredSkills);
    }
  }

  private selectFirstFit(
    task: Task,
    agents: ManagedAgent[],
    requiredSkills: string[]
  ): { agentId: string; skillScore: number } | null {
    for (const agent of agents) {
      const agentSkills = agent.config.skills ?? [];
      const score = this.calculateSkillScore(agentSkills, requiredSkills);
      if (score > 0 || requiredSkills.length === 0) {
        return { agentId: agent.harness.id, skillScore: score };
      }
    }
    return null;
  }

  private selectBestFit(
    task: Task,
    agents: ManagedAgent[],
    requiredSkills: string[]
  ): { agentId: string; skillScore: number } | null {
    let bestAgent: ManagedAgent | null = null;
    let bestScore = -1;

    for (const agent of agents) {
      const agentSkills = agent.config.skills ?? [];
      const score = this.calculateSkillScore(agentSkills, requiredSkills);

      // Accept agents with no required skills, or matching skills
      if (requiredSkills.length === 0 || score > 0) {
        if (score > bestScore) {
          bestScore = score;
          bestAgent = agent;
        }
      }
    }

    return bestAgent
      ? { agentId: bestAgent.harness.id, skillScore: bestScore }
      : null;
  }

  private selectRoundRobin(
    task: Task,
    agents: ManagedAgent[],
    requiredSkills: string[]
  ): { agentId: string; skillScore: number } | null {
    // Filter to agents with required skills
    const qualified =
      requiredSkills.length === 0
        ? agents
        : agents.filter((a) => {
            const agentSkills = a.config.skills ?? [];
            return this.calculateSkillScore(agentSkills, requiredSkills) > 0;
          });

    if (qualified.length === 0) return null;

    this.roundRobinIndex = this.roundRobinIndex % qualified.length;
    const selected = qualified[this.roundRobinIndex];
    this.roundRobinIndex++;

    const agentSkills = selected.config.skills ?? [];
    return {
      agentId: selected.harness.id,
      skillScore: this.calculateSkillScore(agentSkills, requiredSkills),
    };
  }

  private selectLoadBalanced(
    task: Task,
    agents: ManagedAgent[],
    requiredSkills: string[]
  ): { agentId: string; skillScore: number } | null {
    // Filter to agents with required skills
    const qualified =
      requiredSkills.length === 0
        ? agents
        : agents.filter((a) => {
            const agentSkills = a.config.skills ?? [];
            return this.calculateSkillScore(agentSkills, requiredSkills) > 0;
          });

    if (qualified.length === 0) return null;

    // Select agent with fewest completed tasks (least loaded)
    let leastLoaded = qualified[0];
    let lowestLoad = leastLoaded.harness.getStats().tasksCompleted;

    for (const agent of qualified) {
      const load = agent.harness.getStats().tasksCompleted;
      if (load < lowestLoad) {
        lowestLoad = load;
        leastLoaded = agent;
      }
    }

    const agentSkills = leastLoaded.config.skills ?? [];
    return {
      agentId: leastLoaded.harness.id,
      skillScore: this.calculateSkillScore(agentSkills, requiredSkills),
    };
  }

  /**
   * Calculate skill match score
   */
  private calculateSkillScore(
    agentSkills: string[],
    requiredSkills: string[]
  ): number {
    if (requiredSkills.length === 0) return 1;
    if (agentSkills.length === 0) return 0;

    const matched = requiredSkills.filter((skill) =>
      agentSkills.some(
        (as) => as.toLowerCase() === skill.toLowerCase()
      )
    );

    return matched.length / requiredSkills.length;
  }

  /**
   * Check health of all agents
   */
  async checkAgentHealth(): Promise<void> {
    const now = Date.now();
    let healthyCount = 0;

    for (const [agentId, managed] of this.agents) {
      const stats = managed.harness.getStats();
      const lastHeartbeat = stats.lastHeartbeat
        ? new Date(stats.lastHeartbeat).getTime()
        : managed.spawnedAt.getTime();

      managed.health.uptimeMs = now - managed.spawnedAt.getTime();
      managed.health.lastHeartbeat = stats.lastHeartbeat
        ? new Date(stats.lastHeartbeat)
        : null;
      managed.health.currentTaskId = stats.currentTaskId;
      // Task progress is tracked internally from events, not from stats

      // Check for dead agent (no heartbeat)
      if (now - lastHeartbeat > this.config.heartbeatTimeoutMs) {
        if (managed.health.status !== 'dead') {
          managed.health.status = 'dead';
          await this.handleDeadAgent(agentId, managed);
        }
        continue;
      }

      // Check for stalled agent (working but no progress)
      if (stats.currentTaskId && stats.currentTaskStartedAt) {
        const taskDuration =
          now - new Date(stats.currentTaskStartedAt).getTime();
        if (taskDuration > this.config.stalledTimeoutMs) {
          managed.health.status = 'stalled';
          await this.handleStalledAgent(agentId, managed);
          continue;
        }
      }

      // Check consecutive failures
      if (managed.health.consecutiveFailures >= 3) {
        managed.health.status = 'degraded';
      } else {
        managed.health.status = 'healthy';
        healthyCount++;
      }
    }

    this.emit({
      type: 'health_check',
      healthyAgents: healthyCount,
      totalAgents: this.agents.size,
    });
  }

  /**
   * Handle a dead agent (no heartbeat)
   */
  private async handleDeadAgent(
    agentId: string,
    managed: ManagedAgent
  ): Promise<void> {
    const currentTaskId = managed.health.currentTaskId;

    // Emit crash event
    this.emit({
      type: 'agent_crashed',
      agentId,
      error: 'Heartbeat timeout - agent presumed dead',
    });

    // If agent was working on a task, mark it for retry
    if (currentTaskId) {
      await this.requeueOrphanedTask(currentTaskId, agentId);
    }

    // Call crash callback
    this.config.onAgentCrash?.(
      agentId,
      new Error('Heartbeat timeout')
    );

    // Remove the agent
    this.agents.delete(agentId);
  }

  /**
   * Handle a stalled agent
   */
  private async handleStalledAgent(
    agentId: string,
    managed: ManagedAgent
  ): Promise<void> {
    const taskId = managed.health.currentTaskId;

    // Emit event
    this.emit({
      type: 'agent_crashed',
      agentId,
      error: 'Agent stalled - no progress on task',
    });

    if (taskId) {
      await this.requeueOrphanedTask(taskId, agentId);
    }

    // Try to recover the agent by stopping and marking as unhealthy
    try {
      await managed.harness.stop();
    } catch {
      // Ignore stop errors for stalled agents
    }

    this.agents.delete(agentId);
  }

  /**
   * Requeue a task that was orphaned by a dead/stalled agent
   */
  private async requeueOrphanedTask(
    taskId: string,
    previousAgent: string
  ): Promise<void> {
    const task = await this.dataLayer.tasks.get(taskId);
    if (!task) return;

    // Only requeue if task was in progress
    if (task.status === 'in_progress' || task.status === 'claimed') {
      await this.dataLayer.tasks.fail(taskId, {
        type: 'agent_crash',
        message: `Agent ${previousAgent} died while processing`,
        recoverable: true,
      });

      this.emit({
        type: 'task_orphaned',
        taskId,
        previousAgent,
      });

      this.config.onTaskOrphaned?.(taskId, previousAgent);
    }
  }

  /**
   * Handle events from managed agents
   */
  private handleAgentEvent(agentId: string, event: AgentEvent): void {
    const managed = this.agents.get(agentId);
    if (!managed) return;

    switch (event.type) {
      case 'task_claimed':
        managed.health.currentTaskId = event.taskId ?? null;
        managed.health.taskStartedAt = new Date();
        managed.health.taskProgress = 0;
        this.emit({ type: 'task_claimed', taskId: event.taskId!, agentId });
        break;

      case 'task_progress':
        managed.health.taskProgress = event.progress?.percentComplete ?? 0;
        break;

      case 'task_completed': {
        // Calculate duration from when task started
        if (managed.health.taskStartedAt) {
          const durationMs = Date.now() - managed.health.taskStartedAt.getTime();
          this.stats.totalTaskDurationMs += durationMs;
          this.stats.taskCount++;
        }
        const completedTaskId = managed.health.currentTaskId;
        managed.health.currentTaskId = null;
        managed.health.taskStartedAt = null;
        managed.health.taskProgress = 0;
        managed.health.consecutiveFailures = 0;
        this.stats.completedTasks++;
        if (completedTaskId) {
          this.emit({ type: 'task_completed', taskId: completedTaskId, agentId });
        }
        break;
      }

      case 'task_failed': {
        const failedTaskId = managed.health.currentTaskId;
        const error = 'failure' in event ? (event as { failure?: { message?: string } }).failure?.message : undefined;
        managed.health.currentTaskId = null;
        managed.health.taskStartedAt = null;
        managed.health.taskProgress = 0;
        managed.health.consecutiveFailures++;
        this.stats.failedTasks++;
        if (failedTaskId) {
          this.emit({ type: 'task_failed', taskId: failedTaskId, agentId, error });
        }
        break;
      }

      case 'heartbeat':
        managed.health.lastHeartbeat = new Date();
        break;
    }
  }

  /**
   * Get current swarm statistics
   */
  async getStats(): Promise<SwarmStats> {
    const now = Date.now();
    let busyAgents = 0;
    let idleAgents = 0;
    let unhealthyAgents = 0;

    for (const managed of this.agents.values()) {
      if (managed.health.status === 'healthy') {
        if (managed.health.currentTaskId) {
          busyAgents++;
        } else {
          idleAgents++;
        }
      } else {
        unhealthyAgents++;
      }
    }

    // Get task counts from data layer
    const pendingTasks = await this.dataLayer.tasks.list({
      status: 'ready',
      limit: 1000,
    });
    const inProgressTasks = await this.dataLayer.tasks.list({
      status: 'in_progress',
      limit: 1000,
    });

    return {
      totalAgents: this.agents.size,
      busyAgents,
      idleAgents,
      unhealthyAgents,
      pendingTasks: pendingTasks.length,
      inProgressTasks: inProgressTasks.length,
      completedTasks: this.stats.completedTasks,
      failedTasks: this.stats.failedTasks,
      avgTaskDurationMs:
        this.stats.taskCount > 0
          ? Math.round(this.stats.totalTaskDurationMs / this.stats.taskCount)
          : 0,
      uptimeMs: this.startTime > 0 ? now - this.startTime : 0,
      throughputPerMinute: this.stats.distributionsLastMinute.length,
    };
  }

  /**
   * Get health status of all agents
   */
  getAgentHealth(): AgentHealth[] {
    return Array.from(this.agents.values()).map((m) => ({
      ...m.health,
      uptimeMs: Date.now() - m.spawnedAt.getTime(),
    }));
  }

  /**
   * Get a specific managed agent
   */
  getAgent(agentId: string): ManagedAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all managed agent IDs
   */
  getAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Check if coordinator is running
   */
  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Get number of managed agents
   */
  get agentCount(): number {
    return this.agents.size;
  }

  /**
   * Emit coordinator event
   */
  private emit(event: CoordinatorEvent): void {
    this.config.onEvent?.(event);
  }

  /**
   * Generate unique agent ID
   */
  private generateAgentId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `agent-${timestamp}-${random}`;
  }
}
