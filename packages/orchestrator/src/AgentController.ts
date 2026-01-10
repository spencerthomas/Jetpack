import {
  Agent,
  AgentSkill,
  Task,
  Logger,
  generateAgentId,
  Message,
  MemoryEntry,
} from '@jetpack/shared';
import { BeadsAdapter } from '@jetpack/beads-adapter';
import { MCPMailAdapter } from '@jetpack/mcp-mail-adapter';
import { CASSAdapter } from '@jetpack/cass-adapter';
import { ClaudeCodeExecutor } from './ClaudeCodeExecutor';

export interface AgentControllerConfig {
  name: string;
  skills: AgentSkill[];
  workDir: string;
  onStatusChange?: () => void | Promise<void>;
  onTaskComplete?: (agentId: string) => void;
}

export class AgentController {
  private agent: Agent;
  private logger: Logger;
  private currentTask?: Task;
  private heartbeatInterval?: NodeJS.Timeout;
  private executor: ClaudeCodeExecutor;
  private workDir: string;
  private config: AgentControllerConfig;

  constructor(
    config: AgentControllerConfig,
    private beads: BeadsAdapter,
    private mail: MCPMailAdapter,
    private cass: CASSAdapter
  ) {
    this.config = config;
    this.workDir = config.workDir;
    this.executor = new ClaudeCodeExecutor(config.workDir);
    this.agent = {
      id: generateAgentId(config.name),
      name: config.name,
      status: 'idle',
      skills: config.skills,
      createdAt: new Date(),
      lastActive: new Date(),
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

    // Subscribe to task broadcasts
    this.mail.subscribe('task.created', this.handleTaskCreated.bind(this));
    this.mail.subscribe('task.updated', this.handleTaskUpdated.bind(this));

    // Start heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.mail.sendHeartbeat().catch(err => {
        this.logger.error('Failed to send heartbeat:', err);
      });
    }, 30000); // Every 30 seconds

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

  private async handleTaskCreated(_message: Message): Promise<void> {
    this.logger.debug('New task created, checking if suitable');
    await this.lookForWork();
  }

  private async handleTaskUpdated(message: Message): Promise<void> {
    const taskId = message.payload.taskId as string;
    if (this.currentTask?.id === taskId) {
      this.logger.info('Current task was updated');
      this.currentTask = await this.beads.getTask(taskId) || undefined;
    }
  }

  private async lookForWork(): Promise<void> {
    if (this.agent.status !== 'idle') {
      return; // Already working
    }

    const readyTasks = await this.beads.getReadyTasks();

    // Find tasks that match our skills
    const suitableTasks = readyTasks.filter(task => {
      // If task has no required skills, anyone can do it
      if (task.requiredSkills.length === 0) return true;

      // Check if we have at least one of the required skills
      return task.requiredSkills.some(skill => this.agent.skills.includes(skill));
    });

    if (suitableTasks.length === 0) {
      this.logger.debug('No suitable tasks available');
      return;
    }

    // Sort by priority and pick the first one
    suitableTasks.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    const task = suitableTasks[0];
    await this.claimAndExecuteTask(task);
  }

  private async claimAndExecuteTask(task: Task): Promise<void> {
    this.logger.info(`Attempting to claim task: ${task.id} - ${task.title}`);

    // Try to claim the task
    const claimed = await this.beads.claimTask(task.id, this.agent.id);
    if (!claimed) {
      this.logger.warn(`Failed to claim task ${task.id}, may have been claimed by another agent`);
      return;
    }

    this.currentTask = claimed;
    await this.updateStatus('busy', task.id);

    // Notify other agents
    await this.mail.publish({
      id: '',
      type: 'task.claimed',
      from: this.agent.id,
      payload: {
        taskId: task.id,
        agentName: this.agent.name,
      },
      timestamp: new Date(),
    });

    // Retrieve relevant memories for context
    const memories = await this.cass.search(task.title, 5);
    this.logger.debug(`Retrieved ${memories.length} relevant memories`);

    try {
      // Execute the task using Claude Code
      await this.executeTask(claimed, memories);

      // Mark task as completed
      await this.beads.updateTask(task.id, {
        status: 'completed',
        completedAt: new Date(),
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
        },
      });

      // Notify completion
      await this.mail.publish({
        id: '',
        type: 'task.completed',
        from: this.agent.id,
        payload: {
          taskId: task.id,
          agentName: this.agent.name,
        },
        timestamp: new Date(),
      });

      this.logger.info(`Successfully completed task: ${task.id}`);

      // Notify orchestrator of task completion for metrics
      if (this.config.onTaskComplete) {
        this.config.onTaskComplete(this.agent.id);
      }
    } catch (error) {
      this.logger.error(`Failed to execute task ${task.id}:`, error);

      await this.beads.updateTask(task.id, {
        status: 'failed',
      });

      await this.mail.publish({
        id: '',
        type: 'task.failed',
        from: this.agent.id,
        payload: {
          taskId: task.id,
          error: (error as Error).message,
        },
        timestamp: new Date(),
      });
    } finally {
      this.currentTask = undefined;
      await this.updateStatus('idle', undefined);

      // Look for more work
      setTimeout(() => this.lookForWork(), 1000);
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
}
