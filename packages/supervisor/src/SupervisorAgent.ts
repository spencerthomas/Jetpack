import { Logger, Agent } from '@jetpack-agent/shared';
import { BeadsAdapter } from '@jetpack-agent/beads-adapter';
import { MCPMailAdapter } from '@jetpack-agent/mcp-mail-adapter';
import { CASSAdapter } from '@jetpack-agent/cass-adapter';
import { LLMProvider, LLMProviderConfigInput, createLLMProvider } from './llm';
import { createSupervisorGraph, SupervisorGraph, SupervisorState } from './graph';

export interface SupervisorAgentConfig {
  llm: LLMProviderConfigInput;
  beads: BeadsAdapter;
  cass: CASSAdapter;
  getAgents: () => Agent[];
  getAgentMail: (agentId: string) => MCPMailAdapter | undefined;
  pollIntervalMs?: number;
  maxIterations?: number;
  /** Interval for background monitoring (default: 30000ms = 30s) */
  backgroundMonitorIntervalMs?: number;
}

export interface SupervisorResult {
  success: boolean;
  completedTasks: string[];
  failedTasks: string[];
  conflicts: number;
  iterations: number;
  finalReport: string;
  error?: string;
}

/**
 * SupervisorAgent orchestrates multiple agents using LangGraph
 *
 * It breaks down high-level requests into tasks, assigns them to agents,
 * monitors progress, and handles conflicts/failures.
 */
export interface BackgroundMonitoringStats {
  startedAt: Date;
  monitoringCycles: number;
  reassignedTasks: number;
  detectedStalledAgents: number;
  lastCycleAt?: Date;
}

export class SupervisorAgent {
  private logger: Logger;
  private llm: LLMProvider;
  private graph?: SupervisorGraph;
  private running = false;
  private backgroundMonitoringInterval?: NodeJS.Timeout;
  private backgroundMonitoringActive = false;
  private backgroundStats: BackgroundMonitoringStats = {
    startedAt: new Date(),
    monitoringCycles: 0,
    reassignedTasks: 0,
    detectedStalledAgents: 0,
  };

  constructor(private config: SupervisorAgentConfig) {
    this.logger = new Logger('SupervisorAgent');
    this.llm = createLLMProvider(config.llm);
  }

  /**
   * Initialize the supervisor graph
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing supervisor agent');

    this.graph = await createSupervisorGraph({
      llm: this.llm,
      beads: this.config.beads,
      getAgentMail: this.config.getAgentMail,
      pollIntervalMs: this.config.pollIntervalMs ?? 15000, // 15s between checks to give agents time
      maxIterations: this.config.maxIterations ?? 100,
    });

    this.logger.info('Supervisor agent initialized');
  }

  /**
   * Execute a high-level request through the supervisor
   */
  async execute(userRequest: string): Promise<SupervisorResult> {
    if (!this.graph) {
      throw new Error('Supervisor not initialized. Call initialize() first.');
    }

    if (this.running) {
      throw new Error('Supervisor is already running a request');
    }

    this.running = true;
    this.logger.info('Executing request:', userRequest);

    try {
      // Get current agents
      const agents = this.config.getAgents();
      this.logger.info(`Available agents: ${agents.length}`);

      // Initial state
      const initialState: Partial<SupervisorState> = {
        userRequest,
        agents,
      };

      // Run the graph with streaming updates
      // Set recursionLimit higher than maxIterations to allow for the full run
      // Each iteration goes: assigner -> monitor, so we need 2x maxIterations + some buffer
      const maxIterations = this.config.maxIterations ?? 100;
      const recursionLimit = maxIterations * 3; // Plenty of headroom

      let finalState: SupervisorState | undefined;

      for await (const update of await this.graph.stream(initialState, {
        recursionLimit,
      })) {
        // Log updates from each node
        for (const [nodeName, nodeState] of Object.entries(update)) {
          this.logger.debug(`Node ${nodeName} update:`, Object.keys(nodeState as object));

          if ((nodeState as Partial<SupervisorState>).error) {
            this.logger.error(`Error in ${nodeName}:`, (nodeState as Partial<SupervisorState>).error);
          }
        }

        // Keep track of the latest state
        finalState = update[Object.keys(update)[0]] as SupervisorState;
      }

      if (!finalState) {
        return {
          success: false,
          completedTasks: [],
          failedTasks: [],
          conflicts: 0,
          iterations: 0,
          finalReport: '',
          error: 'No final state produced',
        };
      }

      // Ensure arrays have defaults (safety against undefined state)
      const completedTaskIds = finalState.completedTaskIds || [];
      const failedTaskIds = finalState.failedTaskIds || [];
      const conflicts = finalState.conflicts || [];
      const createdTasks = finalState.createdTasks || [];

      // Store execution summary in CASS memory
      await this.config.cass.store({
        type: 'agent_learning',
        content: `Supervisor executed: "${userRequest}". Completed ${completedTaskIds.length} tasks, ${failedTaskIds.length} failed, ${conflicts.length} conflicts handled.`,
        importance: 0.7,
        metadata: {
          userRequest,
          completedTasks: completedTaskIds,
          failedTasks: failedTaskIds,
          iterations: finalState.iteration,
        },
      });

      const success = completedTaskIds.length === createdTasks.length && !finalState.error;

      const result: SupervisorResult = {
        success,
        completedTasks: completedTaskIds,
        failedTasks: failedTaskIds,
        conflicts: conflicts.length,
        iterations: finalState.iteration || 0,
        finalReport: this.generateFinalReport(finalState),
        error: finalState.error,
      };

      this.logger.info('Execution complete:', result);
      return result;
    } finally {
      this.running = false;
    }
  }

  /**
   * Generate a human-readable final report
   */
  private generateFinalReport(state: SupervisorState): string {
    // Add null safety for all array accesses
    const createdTasks = state.createdTasks || [];
    const completedTaskIds = state.completedTaskIds || [];
    const failedTaskIds = state.failedTaskIds || [];
    const conflicts = state.conflicts || [];
    const assignments = state.assignments || {};

    const lines: string[] = [
      '=== Supervisor Execution Report ===',
      '',
      `Request: "${state.userRequest}"`,
      '',
      `Tasks Created: ${createdTasks.length}`,
      `Tasks Completed: ${completedTaskIds.length}`,
      `Tasks Failed: ${failedTaskIds.length}`,
      `Conflicts Handled: ${conflicts.length}`,
      `Iterations: ${state.iteration || 0}`,
      '',
    ];

    if (createdTasks.length > 0) {
      lines.push('Tasks:');
      for (const task of createdTasks) {
        const status = completedTaskIds.includes(task.id)
          ? '✓'
          : failedTaskIds.includes(task.id)
            ? '✗'
            : '○';
        const agent = assignments[task.id] || 'unassigned';
        lines.push(`  ${status} ${task.id}: ${task.title} (${agent})`);
      }
      lines.push('');
    }

    if (conflicts.length > 0) {
      lines.push('Conflicts:');
      for (const conflict of conflicts) {
        const status = conflict.resolved ? '✓' : '○';
        lines.push(`  ${status} ${conflict.type}: ${conflict.description}`);
        if (conflict.resolution) {
          lines.push(`      Resolution: ${conflict.resolution}`);
        }
      }
      lines.push('');
    }

    if (state.error) {
      lines.push(`Error: ${state.error}`);
      lines.push('');
    }

    lines.push('=== End Report ===');
    return lines.join('\n');
  }

  /**
   * Check if supervisor is currently running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the LLM provider info
   */
  getLLMInfo(): { name: string; model: string } {
    return {
      name: this.llm.name,
      model: this.llm.model,
    };
  }

  /**
   * Start background monitoring for proactive supervision
   *
   * This runs periodically to:
   * - Check for unassigned tasks and prompt assignment
   * - Auto-reassign failed tasks
   * - Detect stalled agents and redistribute work
   */
  startBackgroundMonitoring(): void {
    if (this.backgroundMonitoringActive) {
      this.logger.warn('Background monitoring already active');
      return;
    }

    const intervalMs = this.config.backgroundMonitorIntervalMs ?? 30000;
    this.logger.info(`Starting background monitoring (interval: ${intervalMs}ms)`);

    this.backgroundMonitoringActive = true;
    this.backgroundStats = {
      startedAt: new Date(),
      monitoringCycles: 0,
      reassignedTasks: 0,
      detectedStalledAgents: 0,
    };

    // Run monitoring cycle periodically
    this.backgroundMonitoringInterval = setInterval(() => {
      this.runMonitoringCycle().catch((err) => {
        this.logger.error('Background monitoring cycle failed:', err);
      });
    }, intervalMs);

    // Run first cycle immediately
    this.runMonitoringCycle().catch((err) => {
      this.logger.error('Initial monitoring cycle failed:', err);
    });
  }

  /**
   * Stop background monitoring
   */
  stopBackgroundMonitoring(): void {
    if (!this.backgroundMonitoringActive) {
      return;
    }

    this.logger.info('Stopping background monitoring');
    this.backgroundMonitoringActive = false;

    if (this.backgroundMonitoringInterval) {
      clearInterval(this.backgroundMonitoringInterval);
      this.backgroundMonitoringInterval = undefined;
    }
  }

  /**
   * Check if background monitoring is active
   */
  isBackgroundMonitoringActive(): boolean {
    return this.backgroundMonitoringActive;
  }

  /**
   * Get background monitoring statistics
   */
  getBackgroundStats(): BackgroundMonitoringStats {
    return { ...this.backgroundStats };
  }

  /**
   * Run a single monitoring cycle
   * This is the core of background supervision
   */
  private async runMonitoringCycle(): Promise<void> {
    if (!this.backgroundMonitoringActive) {
      return;
    }

    this.backgroundStats.monitoringCycles++;
    this.backgroundStats.lastCycleAt = new Date();

    try {
      const agents = this.config.getAgents();
      const beads = this.config.beads;

      // 1. Check for unassigned ready tasks
      const readyTasks = await beads.getReadyTasks();
      const unassignedTasks = readyTasks.filter(task => !task.assignedAgent);

      if (unassignedTasks.length > 0) {
        this.logger.debug(`Found ${unassignedTasks.length} unassigned ready tasks`);
        // Agents should automatically pick these up via their polling
        // But we can publish a notification to encourage faster pickup
        await this.notifyUnassignedTasks(unassignedTasks.length);
      }

      // 2. Check for failed tasks that could be retried
      const failedTasks = await beads.listTasks({ status: 'failed' });
      for (const task of failedTasks) {
        if (task.retryCount < (task.maxRetries ?? 2)) {
          // Reset task to ready for retry
          await beads.updateTask(task.id, {
            status: 'ready',
            retryCount: task.retryCount + 1,
            assignedAgent: undefined,
          });
          this.backgroundStats.reassignedTasks++;
          this.logger.info(`Reset failed task ${task.id} for retry (attempt ${task.retryCount + 1})`);
        }
      }

      // 3. Detect stalled agents (busy but no activity in 2 minutes)
      const stalledAgents = agents.filter(agent => {
        if (agent.status !== 'busy') return false;
        if (!agent.lastActive) return false;
        const lastActive = new Date(agent.lastActive);
        const stalledMs = Date.now() - lastActive.getTime();
        return stalledMs > 120000; // 2 minutes
      });

      if (stalledAgents.length > 0) {
        this.backgroundStats.detectedStalledAgents += stalledAgents.length;
        this.logger.warn(`Detected ${stalledAgents.length} stalled agents`);

        // Find tasks claimed by stalled agents and reset them
        for (const agent of stalledAgents) {
          const agentTasks = await beads.listTasks({
            status: 'in_progress',
            assignedAgent: agent.id,
          });

          for (const task of agentTasks) {
            await beads.updateTask(task.id, {
              status: 'ready',
              assignedAgent: undefined,
            });
            this.backgroundStats.reassignedTasks++;
            this.logger.info(`Reassigned task ${task.id} from stalled agent ${agent.name}`);
          }
        }
      }

      // 4. Check for blocked tasks that may have unblocked
      const blockedTasks = await beads.listTasks({ status: 'blocked' });
      for (const task of blockedTasks) {
        // Check if all dependencies are now complete
        const deps = task.dependencies || [];
        let allDepsComplete = true;

        for (const depId of deps) {
          const depTask = await beads.getTask(depId);
          if (!depTask || depTask.status !== 'completed') {
            allDepsComplete = false;
            break;
          }
        }

        if (allDepsComplete && deps.length > 0) {
          await beads.updateTask(task.id, { status: 'ready' });
          this.logger.info(`Unblocked task ${task.id} - dependencies complete`);
        }
      }

    } catch (err) {
      this.logger.error('Monitoring cycle error:', err);
    }
  }

  /**
   * Notify agents about unassigned tasks via MCP Mail
   */
  private async notifyUnassignedTasks(count: number): Promise<void> {
    const agents = this.config.getAgents();
    if (agents.length === 0) return;

    // Get mail for first idle agent to broadcast
    const idleAgent = agents.find(a => a.status === 'idle');
    if (!idleAgent) return;

    const mail = this.config.getAgentMail(idleAgent.id);
    if (!mail) return;

    await mail.publish({
      id: '',
      type: 'task.available',
      from: 'supervisor',
      payload: {
        unassignedCount: count,
        message: `${count} tasks waiting for assignment`,
      },
      timestamp: new Date(),
    });
  }
}
