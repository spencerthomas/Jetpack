import * as path from 'path';
import * as fs from 'fs/promises';
import {
  Task,
  TaskPriority,
  AgentSkill,
  Logger,
  generateTaskId,
} from '@jetpack/shared';
import { BeadsAdapter, BeadsAdapterConfig } from '@jetpack/beads-adapter';
import { MCPMailAdapter, MCPMailConfig } from '@jetpack/mcp-mail-adapter';
import { CASSAdapter, CASSConfig } from '@jetpack/cass-adapter';
import { AgentController, AgentControllerConfig } from './AgentController';

export interface JetpackConfig {
  workDir: string;
  numAgents?: number;
  autoStart?: boolean;
}

export class JetpackOrchestrator {
  private logger: Logger;
  private beads!: BeadsAdapter;
  private cass!: CASSAdapter;
  private agents: AgentController[] = [];
  private agentMails: Map<string, MCPMailAdapter> = new Map();
  private workDir: string;

  constructor(private config: JetpackConfig) {
    this.logger = new Logger('Jetpack');
    this.workDir = config.workDir;
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Jetpack orchestrator');

    // Create work directories
    const beadsDir = path.join(this.workDir, '.beads');
    const cassDir = path.join(this.workDir, '.cass');
    const mailDir = path.join(this.workDir, '.jetpack', 'mail');

    await fs.mkdir(beadsDir, { recursive: true });
    await fs.mkdir(cassDir, { recursive: true });
    await fs.mkdir(mailDir, { recursive: true });

    // Initialize Beads adapter
    const beadsConfig: BeadsAdapterConfig = {
      beadsDir,
      autoCommit: true,
      gitEnabled: true,
    };
    this.beads = new BeadsAdapter(beadsConfig);
    await this.beads.initialize();

    // Initialize CASS memory
    const cassConfig: CASSConfig = {
      cassDir,
      compactionThreshold: 0.3,
      maxEntries: 10000,
    };
    this.cass = new CASSAdapter(cassConfig);
    await this.cass.initialize();

    this.logger.info('Jetpack orchestrator initialized');
  }

  async startAgents(count: number = 3): Promise<void> {
    this.logger.info(`Starting ${count} agents`);

    const skillSets: AgentSkill[][] = [
      ['typescript', 'react', 'frontend'],
      ['typescript', 'backend', 'database'],
      ['python', 'backend', 'testing'],
      ['rust', 'backend'],
      ['go', 'devops', 'backend'],
      ['typescript', 'testing', 'documentation'],
    ];

    for (let i = 0; i < count; i++) {
      const agentName = `agent-${i + 1}`;
      const skills = skillSets[i % skillSets.length];

      // Create MCP Mail adapter for this agent
      const mailConfig: MCPMailConfig = {
        mailDir: path.join(this.workDir, '.jetpack', 'mail'),
        agentId: agentName,
      };
      const mail = new MCPMailAdapter(mailConfig);
      await mail.initialize();
      this.agentMails.set(agentName, mail);

      // Create agent controller
      const agentConfig: AgentControllerConfig = {
        name: agentName,
        skills,
      };
      const agent = new AgentController(agentConfig, this.beads, mail, this.cass);

      if (this.config.autoStart !== false) {
        await agent.start();
      }

      this.agents.push(agent);
    }

    this.logger.info(`Started ${count} agents successfully`);
  }

  async stopAgents(): Promise<void> {
    this.logger.info('Stopping all agents');

    for (const agent of this.agents) {
      await agent.stop();
    }

    for (const mail of this.agentMails.values()) {
      await mail.shutdown();
    }

    this.agents = [];
    this.agentMails.clear();

    this.logger.info('All agents stopped');
  }

  async createTask(params: {
    title: string;
    description?: string;
    priority?: TaskPriority;
    dependencies?: string[];
    requiredSkills?: AgentSkill[];
    estimatedMinutes?: number;
  }): Promise<Task> {
    const task = await this.beads.createTask({
      id: generateTaskId(),
      title: params.title,
      description: params.description,
      status: 'pending',
      priority: params.priority || 'medium',
      dependencies: params.dependencies || [],
      blockers: [],
      requiredSkills: params.requiredSkills || [],
      estimatedMinutes: params.estimatedMinutes,
      tags: [],
    });

    this.logger.info(`Created task: ${task.id} - ${task.title}`);

    // Broadcast to agents
    // Since we have multiple mail adapters, broadcast from the first agent
    if (this.agentMails.size > 0) {
      const firstMail = this.agentMails.values().next().value as MCPMailAdapter;
      await firstMail.publish({
        id: '',
        type: 'task.created',
        from: 'orchestrator',
        payload: {
          taskId: task.id,
          title: task.title,
          requiredSkills: task.requiredSkills,
        },
        timestamp: new Date(),
      });
    }

    return task;
  }

  async getStatus(): Promise<{
    agents: Array<{ name: string; status: string; currentTask?: string }>;
    tasks: {
      total: number;
      pending: number;
      inProgress: number;
      completed: number;
      failed: number;
    };
    memory: {
      total: number;
      avgImportance: number;
    };
  }> {
    const taskStats = await this.beads.getStats();
    const memoryStats = await this.cass.getStats();

    return {
      agents: this.agents.map(a => {
        const agent = a.getAgent();
        return {
          name: agent.name,
          status: agent.status,
          currentTask: agent.currentTask,
        };
      }),
      tasks: {
        total: taskStats.total,
        pending: taskStats.byStatus.pending + taskStats.byStatus.ready,
        inProgress: taskStats.byStatus.claimed + taskStats.byStatus.in_progress,
        completed: taskStats.byStatus.completed,
        failed: taskStats.byStatus.failed,
      },
      memory: {
        total: memoryStats.total,
        avgImportance: memoryStats.avgImportance,
      },
    };
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Jetpack');

    await this.stopAgents();

    if (this.cass) {
      this.cass.close();
    }

    this.logger.info('Jetpack shut down complete');
  }

  getBeadsAdapter(): BeadsAdapter {
    return this.beads;
  }

  getCASSAdapter(): CASSAdapter {
    return this.cass;
  }

  getAgents(): AgentController[] {
    return this.agents;
  }
}
