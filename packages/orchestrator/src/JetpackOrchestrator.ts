import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync, watch, FSWatcher } from 'fs';
import {
  Task,
  TaskPriority,
  AgentSkill,
  Logger,
  generateTaskId,
  RuntimeLimits,
  RuntimeStats,
  EndState,
  RuntimeEvent,
} from '@jetpack/shared';
import { RuntimeManager } from './RuntimeManager';

// Simple frontmatter parser
interface TaskFrontmatter {
  title: string;
  description?: string;
  priority?: TaskPriority;
  skills?: AgentSkill[];
  estimate?: number;
  dependencies?: string[];
}

function parseFrontmatter(content: string): { frontmatter: TaskFrontmatter; body: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const [, yamlContent, body] = match;
  const frontmatter: TaskFrontmatter = { title: '' };

  // Simple YAML-like parsing
  for (const line of yamlContent.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Handle arrays like [typescript, backend]
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1);
      const arr = value.split(',').map(s => s.trim()).filter(Boolean);
      if (key === 'skills') frontmatter.skills = arr as AgentSkill[];
      if (key === 'dependencies') frontmatter.dependencies = arr;
    } else if (key === 'title') {
      frontmatter.title = value;
    } else if (key === 'description') {
      frontmatter.description = value;
    } else if (key === 'priority') {
      frontmatter.priority = value as TaskPriority;
    } else if (key === 'estimate') {
      frontmatter.estimate = parseInt(value, 10);
    }
  }

  return { frontmatter, body: body.trim() };
}
import { BeadsAdapter, BeadsAdapterConfig } from '@jetpack/beads-adapter';
import { MCPMailAdapter, MCPMailConfig } from '@jetpack/mcp-mail-adapter';
import { CASSAdapter, CASSConfig } from '@jetpack/cass-adapter';
import { SupervisorAgent, SupervisorResult, LLMProviderConfigInput } from '@jetpack/supervisor';
import { AgentController, AgentControllerConfig } from './AgentController';

export interface JetpackConfig {
  workDir: string;
  numAgents?: number;
  autoStart?: boolean;
  runtimeLimits?: Partial<RuntimeLimits>;
  onEndState?: (endState: EndState, stats: RuntimeStats) => void | Promise<void>;
  onRuntimeEvent?: (event: RuntimeEvent) => void;
}

export interface AgentRegistryEntry {
  id: string;
  name: string;
  status: 'idle' | 'busy' | 'offline' | 'error';
  skills: AgentSkill[];
  currentTask: string | null;
  lastHeartbeat: string;
  tasksCompleted: number;
  startedAt: string;
}

export interface AgentRegistry {
  agents: AgentRegistryEntry[];
  updatedAt: string;
}

export class JetpackOrchestrator {
  private logger: Logger;
  private beads!: BeadsAdapter;
  private cass!: CASSAdapter;
  private agents: AgentController[] = [];
  private agentMails: Map<string, MCPMailAdapter> = new Map();
  private workDir: string;
  private supervisor?: SupervisorAgent;
  private taskFileWatcher?: FSWatcher;
  private processedFiles: Set<string> = new Set();
  private agentTasksCompleted: Map<string, number> = new Map();
  private agentStartTimes: Map<string, Date> = new Map();
  private registryUpdateInterval?: NodeJS.Timeout;
  private runtimeManager?: RuntimeManager;

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

    // Initialize RuntimeManager if limits are configured
    if (this.config.runtimeLimits) {
      this.runtimeManager = new RuntimeManager({
        workDir: this.workDir,
        limits: this.config.runtimeLimits,
        onEndState: async (endState, stats) => {
          this.logger.info(`Runtime end state: ${endState}`);
          await this.handleRuntimeEndState(endState, stats);
          if (this.config.onEndState) {
            await this.config.onEndState(endState, stats);
          }
        },
        onEvent: (event) => {
          if (this.config.onRuntimeEvent) {
            this.config.onRuntimeEvent(event);
          }
        },
      });
    }

    this.logger.info('Jetpack orchestrator initialized');
  }

  /**
   * Handle runtime end state by gracefully shutting down
   */
  private async handleRuntimeEndState(endState: EndState, stats: RuntimeStats): Promise<void> {
    this.logger.info(`Handling end state: ${endState}`, stats);

    // Stop accepting new tasks
    this.stopTaskFileWatcher();

    // Stop the supervisor if running
    // (supervisor will finish current iteration)

    // Stop all agents
    await this.stopAgents();
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

      // Create agent controller with status change callback
      const agentConfig: AgentControllerConfig = {
        name: agentName,
        skills,
        workDir: this.config.workDir,
        onStatusChange: () => this.writeAgentRegistry(),
        onTaskComplete: (agentId: string) => this.incrementAgentTaskCount(agentId),
      };
      const agent = new AgentController(agentConfig, this.beads, mail, this.cass);

      if (this.config.autoStart !== false) {
        await agent.start();
      }

      this.agents.push(agent);

      // Track agent start time and initialize task count
      const agentData = agent.getAgent();
      this.agentStartTimes.set(agentData.id, new Date());
      this.agentTasksCompleted.set(agentData.id, 0);
    }

    this.logger.info(`Started ${count} agents successfully`);

    // Write initial registry and start periodic updates
    await this.writeAgentRegistry();
    this.startRegistryUpdates();

    // Start watching for task files
    await this.startTaskFileWatcher();
  }

  /**
   * Start watching .beads/tasks/ for new .md task files
   */
  async startTaskFileWatcher(): Promise<void> {
    const tasksDir = path.join(this.workDir, '.beads', 'tasks');
    const processedDir = path.join(this.workDir, '.beads', 'processed');

    // Ensure directories exist
    await fs.mkdir(tasksDir, { recursive: true });
    await fs.mkdir(processedDir, { recursive: true });

    // Process any existing files first
    await this.processTaskFiles();

    // Start watching for new files
    if (existsSync(tasksDir)) {
      this.taskFileWatcher = watch(tasksDir, async (eventType, filename) => {
        if (filename && filename.endsWith('.md') && eventType === 'rename') {
          // Small delay to ensure file is fully written
          setTimeout(() => this.processTaskFiles(), 100);
        }
      });

      this.logger.info('Watching for task files in .beads/tasks/');
    }
  }

  /**
   * Process .md files in .beads/tasks/ and create tasks
   */
  private async processTaskFiles(): Promise<void> {
    const tasksDir = path.join(this.workDir, '.beads', 'tasks');
    const processedDir = path.join(this.workDir, '.beads', 'processed');

    try {
      const files = await fs.readdir(tasksDir);

      for (const filename of files) {
        if (!filename.endsWith('.md')) continue;

        const filePath = path.join(tasksDir, filename);

        // Skip if already processed
        if (this.processedFiles.has(filePath)) continue;

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const parsed = parseFrontmatter(content);

          if (!parsed || !parsed.frontmatter.title) {
            this.logger.warn(`Invalid task file: ${filename} (missing title)`);
            continue;
          }

          const { frontmatter, body } = parsed;

          // Create task
          const task = await this.createTask({
            title: frontmatter.title,
            description: frontmatter.description || body || undefined,
            priority: frontmatter.priority,
            requiredSkills: frontmatter.skills,
            estimatedMinutes: frontmatter.estimate,
            dependencies: frontmatter.dependencies,
          });

          this.logger.info(`Created task from file: ${filename} -> ${task.id}`);

          // Move to processed folder
          const processedPath = path.join(processedDir, `${task.id}-${filename}`);
          await fs.rename(filePath, processedPath);
          this.processedFiles.add(filePath);

        } catch (err) {
          this.logger.error(`Failed to process task file ${filename}: ${err}`);
        }
      }
    } catch (err) {
      // Directory might not exist yet, that's OK
    }
  }

  /**
   * Stop watching for task files
   */
  stopTaskFileWatcher(): void {
    if (this.taskFileWatcher) {
      this.taskFileWatcher.close();
      this.taskFileWatcher = undefined;
      this.logger.info('Stopped task file watcher');
    }
  }

  async stopAgents(): Promise<void> {
    this.logger.info('Stopping all agents');

    // Stop registry updates
    this.stopRegistryUpdates();

    for (const agent of this.agents) {
      await agent.stop();
    }

    for (const mail of this.agentMails.values()) {
      await mail.shutdown();
    }

    this.agents = [];
    this.agentMails.clear();
    this.agentTasksCompleted.clear();
    this.agentStartTimes.clear();

    // Clear the registry file
    await this.clearAgentRegistry();

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

    // Stop file watcher
    this.stopTaskFileWatcher();

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

  /**
   * Get current CASS configuration (for UI display)
   */
  getCASSConfig(): ReturnType<CASSAdapter['getConfig']> {
    return this.cass.getConfig();
  }

  /**
   * Reconfigure CASS settings at runtime (hot reload)
   * Call this after updating settings to apply changes immediately
   */
  async reconfigureCASS(config: Partial<CASSConfig>): Promise<void> {
    this.logger.info('Reconfiguring CASS via orchestrator');
    await this.cass.reconfigure(config);
    this.logger.info('CASS reconfiguration applied');
  }

  getAgents(): AgentController[] {
    return this.agents;
  }

  /**
   * Write agent registry to .jetpack/agents.json
   * Called periodically and on agent status changes
   */
  async writeAgentRegistry(): Promise<void> {
    const registryPath = path.join(this.workDir, '.jetpack', 'agents.json');

    const registry: AgentRegistry = {
      agents: this.agents.map(controller => {
        const agent = controller.getAgent();
        return {
          id: agent.id,
          name: agent.name,
          status: agent.status as 'idle' | 'busy' | 'offline' | 'error',
          skills: agent.skills,
          currentTask: agent.currentTask || null,
          lastHeartbeat: new Date().toISOString(),
          tasksCompleted: this.agentTasksCompleted.get(agent.id) || 0,
          startedAt: this.agentStartTimes.get(agent.id)?.toISOString() || new Date().toISOString(),
        };
      }),
      updatedAt: new Date().toISOString(),
    };

    try {
      await fs.writeFile(registryPath, JSON.stringify(registry, null, 2));
    } catch (err) {
      this.logger.error('Failed to write agent registry:', err);
    }
  }

  /**
   * Clear agent registry (called on shutdown)
   */
  async clearAgentRegistry(): Promise<void> {
    const registryPath = path.join(this.workDir, '.jetpack', 'agents.json');
    const emptyRegistry: AgentRegistry = {
      agents: [],
      updatedAt: new Date().toISOString(),
    };

    try {
      await fs.writeFile(registryPath, JSON.stringify(emptyRegistry, null, 2));
    } catch (err) {
      this.logger.error('Failed to clear agent registry:', err);
    }
  }

  /**
   * Start periodic registry updates
   */
  private startRegistryUpdates(): void {
    // Update registry every 5 seconds
    this.registryUpdateInterval = setInterval(async () => {
      await this.writeAgentRegistry();
    }, 5000);
  }

  /**
   * Stop periodic registry updates
   */
  private stopRegistryUpdates(): void {
    if (this.registryUpdateInterval) {
      clearInterval(this.registryUpdateInterval);
      this.registryUpdateInterval = undefined;
    }
  }

  /**
   * Track task completion for agent metrics
   */
  incrementAgentTaskCount(agentId: string): void {
    const current = this.agentTasksCompleted.get(agentId) || 0;
    this.agentTasksCompleted.set(agentId, current + 1);
    // Update registry immediately
    this.writeAgentRegistry().catch(() => {});
  }

  /**
   * Create and initialize a supervisor agent
   */
  async createSupervisor(llmConfig: LLMProviderConfigInput): Promise<SupervisorAgent> {
    this.logger.info('Creating supervisor agent');

    this.supervisor = new SupervisorAgent({
      llm: llmConfig,
      beads: this.beads,
      cass: this.cass,
      getAgents: () => this.agents.map(a => a.getAgent()),
      getAgentMail: (agentId: string) => this.agentMails.get(agentId),
    });

    await this.supervisor.initialize();
    this.logger.info('Supervisor agent created');

    return this.supervisor;
  }

  /**
   * Execute a high-level request through the supervisor
   */
  async supervise(userRequest: string): Promise<SupervisorResult> {
    if (!this.supervisor) {
      throw new Error('No supervisor agent. Call createSupervisor() first.');
    }

    return this.supervisor.execute(userRequest);
  }

  /**
   * Get the current supervisor agent (if any)
   */
  getSupervisor(): SupervisorAgent | undefined {
    return this.supervisor;
  }

  /**
   * Get agent mail adapter for a specific agent
   */
  getAgentMail(agentId: string): MCPMailAdapter | undefined {
    return this.agentMails.get(agentId);
  }
}
