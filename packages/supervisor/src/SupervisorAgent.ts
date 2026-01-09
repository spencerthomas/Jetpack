import { Logger, Agent } from '@jetpack/shared';
import { BeadsAdapter } from '@jetpack/beads-adapter';
import { MCPMailAdapter } from '@jetpack/mcp-mail-adapter';
import { CASSAdapter } from '@jetpack/cass-adapter';
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
export class SupervisorAgent {
  private logger: Logger;
  private llm: LLMProvider;
  private graph?: SupervisorGraph;
  private running = false;

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
      pollIntervalMs: this.config.pollIntervalMs ?? 2000,
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
      let finalState: SupervisorState | undefined;

      for await (const update of await this.graph.stream(initialState)) {
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

      // Store execution summary in CASS memory
      await this.config.cass.store({
        type: 'agent_learning',
        content: `Supervisor executed: "${userRequest}". Completed ${finalState.completedTaskIds.length} tasks, ${finalState.failedTaskIds.length} failed, ${finalState.conflicts.length} conflicts handled.`,
        importance: 0.7,
        metadata: {
          userRequest,
          completedTasks: finalState.completedTaskIds,
          failedTasks: finalState.failedTaskIds,
          iterations: finalState.iteration,
        },
      });

      const success = finalState.completedTaskIds.length === finalState.createdTasks.length && !finalState.error;

      const result: SupervisorResult = {
        success,
        completedTasks: finalState.completedTaskIds,
        failedTasks: finalState.failedTaskIds,
        conflicts: finalState.conflicts.length,
        iterations: finalState.iteration,
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
    const lines: string[] = [
      '=== Supervisor Execution Report ===',
      '',
      `Request: "${state.userRequest}"`,
      '',
      `Tasks Created: ${state.createdTasks.length}`,
      `Tasks Completed: ${state.completedTaskIds.length}`,
      `Tasks Failed: ${state.failedTaskIds.length}`,
      `Conflicts Handled: ${state.conflicts.length}`,
      `Iterations: ${state.iteration}`,
      '',
    ];

    if (state.createdTasks.length > 0) {
      lines.push('Tasks:');
      for (const task of state.createdTasks) {
        const status = state.completedTaskIds.includes(task.id)
          ? '✓'
          : state.failedTaskIds.includes(task.id)
            ? '✗'
            : '○';
        const agent = state.assignments[task.id] || 'unassigned';
        lines.push(`  ${status} ${task.id}: ${task.title} (${agent})`);
      }
      lines.push('');
    }

    if (state.conflicts.length > 0) {
      lines.push('Conflicts:');
      for (const conflict of state.conflicts) {
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
}
