import {
  Agent,
  AgentStatus,
  AgentSkill,
  Task,
  Logger,
  generateAgentId,
  Message,
} from '@jetpack/shared';
import { BeadsAdapter } from '@jetpack/beads-adapter';
import { MCPMailAdapter } from '@jetpack/mcp-mail-adapter';
import { CASSAdapter } from '@jetpack/cass-adapter';

export interface AgentControllerConfig {
  name: string;
  skills: AgentSkill[];
}

export class AgentController {
  private agent: Agent;
  private logger: Logger;
  private currentTask?: Task;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(
    config: AgentControllerConfig,
    private beads: BeadsAdapter,
    private mail: MCPMailAdapter,
    private cass: CASSAdapter
  ) {
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

    this.agent.status = 'offline';
  }

  private async handleTaskCreated(message: Message): Promise<void> {
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
    this.agent.status = 'busy';
    this.agent.currentTask = task.id;

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
      // Execute the task
      await this.executeTask(claimed);

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
      this.agent.status = 'idle';
      this.agent.currentTask = undefined;
      this.agent.lastActive = new Date();

      // Look for more work
      setTimeout(() => this.lookForWork(), 1000);
    }
  }

  private async executeTask(task: Task): Promise<void> {
    // This is where the actual work happens
    // In a real implementation, this would:
    // 1. Analyze the task requirements
    // 2. Execute the necessary operations (code changes, tests, etc.)
    // 3. Use file leasing to prevent conflicts with other agents
    // 4. Report progress

    this.logger.info(`Executing task: ${task.title}`);

    await this.beads.updateTask(task.id, { status: 'in_progress' });

    // Simulate work
    const workDuration = task.estimatedMinutes
      ? task.estimatedMinutes * 60000
      : Math.random() * 30000 + 10000;

    await new Promise(resolve => setTimeout(resolve, workDuration));

    // In a real implementation:
    // - Parse task description
    // - Make code changes
    // - Run tests
    // - Commit changes
    // - Update documentation
  }

  getAgent(): Agent {
    return { ...this.agent };
  }

  getCurrentTask(): Task | undefined {
    return this.currentTask;
  }
}
