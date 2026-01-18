import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync, watch, FSWatcher } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import { config as dotenvConfig } from 'dotenv';

// Load .env file from current working directory (or specified path)
// This must happen before any other imports that might use process.env
dotenvConfig();

// BUG-1 FIX: Increase default max listeners to prevent MaxListenersExceededWarning
// With multiple agents (each with 3 subscriptions) plus orchestrator events,
// the default of 10 is easily exceeded. 50 supports up to ~15 agents comfortably.
EventEmitter.defaultMaxListeners = 50;

const execFileAsync = promisify(execFile);
import {
  Task,
  TaskPriority,
  AgentSkill,
  Logger,
  generateTaskId,
  generateAgentId,
  RuntimeLimits,
  RuntimeStats,
  EndState,
  RuntimeEvent,
  ExecutionOutputEvent,
  AgentOutputBuffer,
  HybridMode,
  EnvironmentConfig,
  loadEnvironmentConfig,
  ITaskStore,
  IMemoryStore,
  createAdapters,
  HybridAdapterConfig,
  AdapterMode,
  MemoryConfig,
  MemoryEvent,
  MemoryStats,
  MemorySeverity,
} from '@jetpack-agent/shared';
import { RuntimeManager } from './RuntimeManager';
import { MemoryMonitor } from './MemoryMonitor';

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
import { BeadsAdapter, BeadsAdapterConfig } from '@jetpack-agent/beads-adapter';
import { MCPMailAdapter, MCPMailConfig } from '@jetpack-agent/mcp-mail-adapter';
import { CASSAdapter, CASSConfig } from '@jetpack-agent/cass-adapter';
import { SupervisorAgent, SupervisorResult, LLMProviderConfigInput } from '@jetpack-agent/supervisor';
import {
  QualityMetricsAdapter,
  RegressionDetector,
  RegressionSummary,
} from '@jetpack-agent/quality-adapter';
import { AgentController, AgentControllerConfig } from './AgentController';
import { SkillDetector } from './SkillDetector';

export interface JetpackConfig {
  workDir: string;
  numAgents?: number;
  autoStart?: boolean;
  runtimeLimits?: Partial<RuntimeLimits>;
  onEndState?: (endState: EndState, stats: RuntimeStats) => void | Promise<void>;
  onRuntimeEvent?: (event: RuntimeEvent) => void;
  /** Enable TUI mode for visual agent dashboard */
  enableTuiMode?: boolean;
  /** Callback for agent output events */
  onAgentOutput?: (event: ExecutionOutputEvent) => void;
  /** Enable quality metrics tracking (default: false) */
  enableQualityMetrics?: boolean;
  /** Callback when quality regressions are detected */
  onQualityRegression?: (summary: RegressionSummary) => void;
  /** Quality check settings (which checks to run: build, tests, lint) */
  qualitySettings?: {
    enabled?: boolean;
    checkBuild?: boolean;
    checkTests?: boolean;
    checkLint?: boolean;
    detectRegressions?: boolean;
  };
  // BUG-6 FIX: Configurable per-task timeout settings
  /** Agent timeout settings for task execution */
  agentSettings?: {
    /** Multiplier for task.estimatedMinutes to calculate timeout (default: 2.0) */
    timeoutMultiplier?: number;
    /** Minimum timeout in ms regardless of estimate (default: 5 minutes) */
    minTimeoutMs?: number;
    /** Maximum timeout in ms regardless of estimate (default: 2 hours) */
    maxTimeoutMs?: number;
    /** Time to wait after SIGTERM before sending SIGKILL (default: 30 seconds) */
    gracefulShutdownMs?: number;
    /** Interval for periodic work polling in ms (default: 30 seconds) */
    workPollingIntervalMs?: number;
  };
  /** Hybrid/edge mode settings for distributed execution */
  hybridSettings?: {
    /** Execution mode: local, edge, or hybrid */
    mode?: HybridMode;
    /** Cloudflare Worker API URL (required for edge/hybrid modes) */
    cloudflareUrl?: string;
    /** API token for authenticating with Cloudflare Worker */
    apiToken?: string;
  };
  /** Enable memory monitoring (default: true) */
  enableMemoryMonitoring?: boolean;
  /** Memory management configuration */
  memoryConfig?: Partial<MemoryConfig>;
  /** Callback for memory events */
  onMemoryEvent?: (event: MemoryEvent) => void;
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

export class JetpackOrchestrator extends EventEmitter {
  private logger: Logger;
  private beads!: BeadsAdapter;
  private cass!: CASSAdapter;
  /** Task store (may be local BeadsAdapter or HTTP adapter in hybrid mode) */
  private taskStore!: ITaskStore;
  /** Memory store (may be local CASSAdapter or HTTP adapter in hybrid mode) */
  private memoryStore!: IMemoryStore;
  /** Current adapter mode */
  private _adapterMode: AdapterMode = 'local';
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
  private _currentBranch: string = 'main';
  private _skillDetector!: SkillDetector;
  private _projectSkills: string[] = [];
  private _agentOutputBuffers: Map<string, AgentOutputBuffer> = new Map();
  private _tuiMode: boolean = false;
  private quality?: QualityMetricsAdapter;
  private regressionDetector?: RegressionDetector;
  /** Standalone mail adapter for broadcasting (works even without agents) */
  private broadcastMail?: MCPMailAdapter;
  /** Memory monitor for heap management and tiered responses */
  private memoryMonitor?: MemoryMonitor;
  /** Whether task assignment is paused due to memory pressure */
  private _tasksPausedForMemory: boolean = false;
  /** Environment configuration loaded from .env and process.env */
  private _envConfig: EnvironmentConfig;

  constructor(private config: JetpackConfig) {
    super();
    this.logger = new Logger('Jetpack');

    // Load environment configuration from .env file and process.env
    // Environment variables are loaded via dotenv at module initialization
    this._envConfig = loadEnvironmentConfig();

    // Apply environment config: workDir from env if not provided in config
    this.workDir = config.workDir || this._envConfig.workDir || process.cwd();

    // Apply hybrid settings from environment if not explicitly provided
    if (this._envConfig.mode !== 'local' && !config.hybridSettings?.mode) {
      this.config = {
        ...config,
        hybridSettings: {
          mode: this._envConfig.mode,
          cloudflareUrl: this._envConfig.cloudflareApiUrl,
          apiToken: this._envConfig.cloudflareApiToken,
          ...config.hybridSettings,
        },
      };
    }

    this._tuiMode = config.enableTuiMode ?? false;
  }

  /**
   * Get the loaded environment configuration
   */
  get environmentConfig(): EnvironmentConfig {
    return this._envConfig;
  }

  /**
   * Get whether TUI mode is enabled
   */
  get tuiMode(): boolean {
    return this._tuiMode;
  }

  /**
   * Get the current adapter mode (local, hybrid, or edge)
   */
  get adapterMode(): AdapterMode {
    return this._adapterMode;
  }

  /**
   * Get the task store interface (works for any adapter mode)
   */
  getTaskStore(): ITaskStore {
    return this.taskStore;
  }

  /**
   * Get the memory store interface (works for any adapter mode)
   */
  getMemoryStore(): IMemoryStore {
    return this.memoryStore;
  }

  /**
   * Get output buffers for all agents (for TUI dashboard)
   */
  getAgentOutputBuffers(): Map<string, AgentOutputBuffer> {
    return new Map(this._agentOutputBuffers);
  }

  /**
   * Memory leak fix: Clear output buffer for a specific agent
   * Call this when an agent stops or task changes
   */
  clearAgentBuffer(agentId: string): void {
    const buffer = this._agentOutputBuffers.get(agentId);
    if (buffer) {
      buffer.lines = [];
      buffer.currentTaskId = undefined;
      buffer.currentTaskTitle = undefined;
      this.logger.debug(`Cleared output buffer for agent ${agentId}`);
    }
  }

  /**
   * Memory leak fix: Clear all agent output buffers
   */
  clearAllAgentBuffers(): void {
    for (const agentId of this._agentOutputBuffers.keys()) {
      this.clearAgentBuffer(agentId);
    }
    this._agentOutputBuffers.clear();
    this.logger.debug('Cleared all agent output buffers');
  }

  /**
   * Memory leak fix: Start periodic memory monitoring
   * Logs heap usage and triggers cleanup at high memory pressure
   */
  private startMemoryMonitoring(): void {
    const MONITOR_INTERVAL_MS = 60000; // Check every minute
    const HEAP_WARNING_THRESHOLD = 0.8; // 80% of max heap
    const HEAP_CRITICAL_THRESHOLD = 0.9; // 90% of max heap
    const WARNING_COOLDOWN_MS = 300000; // 5 minutes between warnings

    this.memoryMonitorInterval = setInterval(() => {
      const memUsage = process.memoryUsage();
      const heapUsed = memUsage.heapUsed;
      const heapTotal = memUsage.heapTotal;
      const heapUsedMB = Math.round(heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(heapTotal / 1024 / 1024);
      const heapPercent = heapUsed / heapTotal;

      // Log memory stats periodically (debug level)
      this.logger.debug(`Memory: ${heapUsedMB}MB / ${heapTotalMB}MB (${Math.round(heapPercent * 100)}%)`);

      const now = Date.now();

      if (heapPercent >= HEAP_CRITICAL_THRESHOLD) {
        // Critical: trigger aggressive cleanup
        this.logger.warn(`CRITICAL: Heap at ${Math.round(heapPercent * 100)}%, triggering memory cleanup`);
        this.triggerMemoryCleanup('critical');
        this.lastMemoryWarningTime = now;
      } else if (heapPercent >= HEAP_WARNING_THRESHOLD) {
        // Warning: log and trigger mild cleanup
        if (now - this.lastMemoryWarningTime > WARNING_COOLDOWN_MS) {
          this.logger.warn(`WARNING: Heap at ${Math.round(heapPercent * 100)}%, monitoring closely`);
          this.triggerMemoryCleanup('warning');
          this.lastMemoryWarningTime = now;
        }
      }

      // Emit memory event for TUI
      this.emit('memoryUsage', {
        heapUsedMB,
        heapTotalMB,
        heapPercent: Math.round(heapPercent * 100),
        rssMB: Math.round(memUsage.rss / 1024 / 1024),
        externalMB: Math.round(memUsage.external / 1024 / 1024),
      });
    }, MONITOR_INTERVAL_MS);

    this.logger.info('Memory monitoring started');
  }

  /**
   * Memory leak fix: Stop memory monitoring
   */
  private stopMemoryMonitoring(): void {
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
      this.memoryMonitorInterval = undefined;
      this.logger.debug('Memory monitoring stopped');
    }
  }

  /**
   * Memory leak fix: Trigger memory cleanup based on severity
   */
  private async triggerMemoryCleanup(level: 'warning' | 'critical'): Promise<void> {
    this.logger.info(`Triggering ${level} memory cleanup`);

    // Always clear agent output buffers (they can be rebuilt)
    this.clearAllAgentBuffers();

    // Trigger CASS adaptive compaction
    if (this.cass) {
      try {
        const removed = await this.cass.adaptiveCompact();
        if (removed > 0) {
          this.logger.info(`Memory cleanup: CASS removed ${removed} entries`);
        }
      } catch (error) {
        this.logger.error('Failed to run CASS adaptive compaction:', error);
      }
    }

    // Request garbage collection if available (Node.js --expose-gc flag)
    if (global.gc) {
      this.logger.debug('Requesting garbage collection');
      global.gc();
    }

    // Emit cleanup event
    this.emit('memoryCleanup', { level });
  }

  /**
   * Get current memory usage statistics
   */
  getMemoryStats(): {
    heapUsedMB: number;
    heapTotalMB: number;
    heapPercent: number;
    rssMB: number;
    externalMB: number;
  } {
    const memUsage = process.memoryUsage();
    return {
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapPercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      rssMB: Math.round(memUsage.rss / 1024 / 1024),
      externalMB: Math.round(memUsage.external / 1024 / 1024),
    };
  }

  /**
   * Handle output event from an agent
   */
  private handleAgentOutput(event: ExecutionOutputEvent): void {
    // Update the buffer for this agent
    let buffer = this._agentOutputBuffers.get(event.agentId);
    if (!buffer) {
      buffer = {
        agentId: event.agentId,
        agentName: event.agentName,
        currentTaskId: event.taskId,
        currentTaskTitle: event.taskTitle,
        lines: [],
        maxLines: 100,
      };
      this._agentOutputBuffers.set(event.agentId, buffer);
    }

    // Memory leak fix: Clear buffer when task changes
    if (buffer.currentTaskId && buffer.currentTaskId !== event.taskId) {
      this.logger.debug(`Task changed for agent ${event.agentId}, clearing buffer`);
      buffer.lines = [];
    }

    // Update current task info
    buffer.currentTaskId = event.taskId;
    buffer.currentTaskTitle = event.taskTitle;

    // Add new lines from the chunk
    const newLines = event.chunk.split('\n').filter(Boolean);
    buffer.lines.push(...newLines);

    // Trim to max lines
    if (buffer.lines.length > buffer.maxLines) {
      buffer.lines = buffer.lines.slice(-buffer.maxLines);
    }

    // Emit for TUI and other listeners
    this.emit('agentOutput', event);

    // Call config callback if provided
    if (this.config.onAgentOutput) {
      this.config.onAgentOutput(event);
    }
  }

  /**
   * Get the current git branch for the working directory
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: this.workDir,
      });
      this._currentBranch = stdout.trim();
      return this._currentBranch;
    } catch {
      this.logger.debug('Not a git repository or git not available, using default branch');
      return this._currentBranch;
    }
  }

  /**
   * Get the cached current branch (synchronous)
   */
  get currentBranch(): string {
    return this._currentBranch;
  }

  /**
   * Get the skill detector for dynamic skill analysis
   */
  get skillDetector(): SkillDetector {
    return this._skillDetector;
  }

  /**
   * Get detected project skills
   */
  get projectSkills(): string[] {
    return this._projectSkills;
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

    // Detect current git branch for branch-tagged projects
    await this.getCurrentBranch();
    this.logger.info(`Working on branch: ${this._currentBranch}`);

    // Initialize skill detection for dynamic skills marketplace
    this._skillDetector = new SkillDetector(this.workDir);
    this._projectSkills = await this._skillDetector.getDetectedSkillIds();
    if (this._projectSkills.length > 0) {
      this.logger.info(`Detected project skills: ${this._projectSkills.join(', ')}`);
    }

    // Determine adapter mode from config
    const hybridMode = this.config.hybridSettings?.mode || 'local';
    this._adapterMode = hybridMode;

    // Build hybrid adapter config
    const hybridConfig: HybridAdapterConfig = {
      mode: hybridMode,
      cloudflare: hybridMode !== 'local' && this.config.hybridSettings?.cloudflareUrl ? {
        workerUrl: this.config.hybridSettings.cloudflareUrl,
        apiToken: this.config.hybridSettings.apiToken || '',
        accountId: '',
      } : undefined,
    };

    // Create adapters using factory (supports local, hybrid, and edge modes)
    if (hybridMode !== 'local' && hybridConfig.cloudflare) {
      this.logger.info(`Initializing adapters in ${hybridMode} mode`);

      // Use adapter factory for hybrid/edge modes
      const bundle = createAdapters(
        hybridConfig,
        {
          workDir: this.workDir,
          agentId: 'orchestrator',
        },
        {
          // Factory functions for local adapters (used when adapter type is 'local')
          createTaskStore: (config) => {
            const adapter = new BeadsAdapter({
              beadsDir: config.beadsDir,
              autoCommit: config.autoCommit,
              gitEnabled: config.gitEnabled,
            });
            return adapter;
          },
          createMailBus: (config) => {
            const adapter = new MCPMailAdapter({
              mailDir: config.mailDir,
              agentId: config.agentId,
            });
            return adapter;
          },
          createMemoryStore: (config) => {
            const adapter = new CASSAdapter({
              cassDir: config.cassDir,
              compactionThreshold: config.compactionThreshold,
              maxEntries: config.maxEntries,
              autoGenerateEmbeddings: config.autoGenerateEmbeddings,
            });
            return adapter;
          },
        }
      );

      this.taskStore = bundle.taskStore;
      this.memoryStore = bundle.memoryStore;
      await this.taskStore.initialize();
      await this.memoryStore.initialize();

      // For compatibility, also set beads/cass if they're local adapters
      if (bundle.mode === 'local' || bundle.mode === 'hybrid') {
        // In hybrid mode, we might have local adapters - cast if appropriate
        this.beads = this.taskStore as BeadsAdapter;
        this.cass = this.memoryStore as CASSAdapter;
      }

      this.logger.info(`Adapters initialized in ${bundle.mode} mode`);
    } else {
      // Local mode - use direct adapter creation (original behavior)
      this.logger.info('Initializing adapters in local mode');

      // Initialize Beads adapter
      const beadsConfig: BeadsAdapterConfig = {
        beadsDir,
        autoCommit: true,
        gitEnabled: true,
      };
      this.beads = new BeadsAdapter(beadsConfig);
      await this.beads.initialize();
      this.taskStore = this.beads;

      // Initialize CASS memory
      const cassConfig: CASSConfig = {
        cassDir,
        compactionThreshold: 0.3,
        maxEntries: 10000,
      };
      this.cass = new CASSAdapter(cassConfig);
      await this.cass.initialize();
      this.memoryStore = this.cass;
    }

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

    // Initialize Quality Metrics tracking if enabled
    if (this.config.enableQualityMetrics) {
      this.logger.info('Initializing quality metrics tracking');
      this.quality = new QualityMetricsAdapter({ workDir: this.workDir });
      await this.quality.initialize();
      this.regressionDetector = new RegressionDetector();
      this.logger.info('Quality metrics tracking initialized');
    }

    // Initialize standalone broadcast mail adapter (for task creation without agents)
    const broadcastMailConfig: MCPMailConfig = {
      mailDir: path.join(this.workDir, '.jetpack', 'mail'),
      agentId: 'orchestrator',
    };
    this.broadcastMail = new MCPMailAdapter(broadcastMailConfig);
    await this.broadcastMail.initialize();

    // Initialize Memory Monitor (enabled by default)
    if (this.config.enableMemoryMonitoring !== false) {
      this.logger.info('Initializing memory monitor');
      this.memoryMonitor = new MemoryMonitor({
        workDir: this.workDir,
        memoryConfig: this.config.memoryConfig,
        onSeverityChange: (from, to, stats) => {
          this.emit('memorySeverityChanged', { from, to, stats });
        },
        onPauseTasks: () => {
          this._tasksPausedForMemory = true;
          this.logger.warn('Tasks paused due to memory pressure');
          this.emit('tasksPaused', { reason: 'memory_pressure' });
        },
        onResumeTasks: () => {
          this._tasksPausedForMemory = false;
          this.logger.info('Tasks resumed - memory pressure reduced');
          this.emit('tasksResumed', { reason: 'memory_recovered' });
        },
        onThrottleStart: () => {
          this.logger.warn('Task throttling started due to elevated memory');
          this.emit('throttleStarted', { reason: 'memory_elevated' });
        },
        onThrottleStop: () => {
          this.logger.info('Task throttling stopped - memory recovered');
          this.emit('throttleStopped', { reason: 'memory_recovered' });
        },
        onEmergencyShutdown: async () => {
          this.logger.error('EMERGENCY: Memory critical - initiating graceful shutdown');
          await this.shutdown();
        },
      });

      // Forward memory events to config callback if provided
      if (this.config.onMemoryEvent) {
        this.memoryMonitor.on('memoryEvent', this.config.onMemoryEvent);
      }

      this.logger.info('Memory monitor initialized');
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

    // Start RuntimeManager if configured
    if (this.runtimeManager) {
      await this.runtimeManager.start();
    }

    // Start Memory Monitor
    if (this.memoryMonitor) {
      this.memoryMonitor.start();
      this.logger.info('Memory monitor started');
    }

    const skillSets: AgentSkill[][] = [
      ['typescript', 'react', 'frontend'],
      ['typescript', 'backend', 'database'],
      ['python', 'backend', 'testing'],
      ['rust', 'backend'],
      ['go', 'devops', 'backend'],
      ['typescript', 'testing', 'documentation'],
    ];

    // First, create all agent controllers (mail adapter initialization is async but lightweight)
    const agentSetupPromises = Array.from({ length: count }, async (_, i) => {
      const agentName = `agent-${i + 1}`;
      const skills = skillSets[i % skillSets.length];

      // Create MCP Mail adapter for this agent
      // Use the generated agent ID (not name) for consistent lookups
      const agentId = generateAgentId(agentName);
      const mailConfig: MCPMailConfig = {
        mailDir: path.join(this.workDir, '.jetpack', 'mail'),
        agentId: agentId,  // Use ID for mail identity
      };
      const mail = new MCPMailAdapter(mailConfig);
      await mail.initialize();
      this.agentMails.set(agentId, mail);  // Store by ID for supervisor lookup

      // Create agent controller with status change callback
      const agentConfig: AgentControllerConfig = {
        name: agentName,
        skills,
        workDir: this.config.workDir,
        onStatusChange: () => this.writeAgentRegistry(),
        onTaskComplete: (agentId: string) => this.handleAgentTaskComplete(agentId),
        onTaskFailed: (agentId: string, taskId: string, error: string) =>
          this.handleAgentTaskFailed(agentId, taskId, error),
        onCycleComplete: () => this.handleAgentCycleComplete(),
        // TUI mode: emit output events instead of writing to stdout
        enableTuiMode: this._tuiMode,
        onOutput: (event) => this.handleAgentOutput(event),
        // Quality metrics reporting (if enabled)
        onQualityReport: this.config.enableQualityMetrics
          ? async (taskId, agentId, metrics) => {
              await this.recordQualitySnapshot(taskId, agentId, metrics);
            }
          : undefined,
        // Quality check settings (which checks to run)
        qualitySettings: this.config.qualitySettings,
        // BUG-6 FIX: Pass configurable timeout settings to agents
        workPollingIntervalMs: this.config.agentSettings?.workPollingIntervalMs,
        timeoutMultiplier: this.config.agentSettings?.timeoutMultiplier,
        minTimeoutMs: this.config.agentSettings?.minTimeoutMs,
        maxTimeoutMs: this.config.agentSettings?.maxTimeoutMs,
        gracefulShutdownMs: this.config.agentSettings?.gracefulShutdownMs,
      };
      return new AgentController(agentConfig, this.beads, mail, this.cass);
    });

    // Wait for all agent controllers to be created
    const createdAgents = await Promise.all(agentSetupPromises);
    this.agents = createdAgents;

    // Track agent start times and initialize task counts
    for (const agent of this.agents) {
      const agentData = agent.getAgent();
      this.agentStartTimes.set(agentData.id, new Date());
      this.agentTasksCompleted.set(agentData.id, 0);
    }

    // Start all agents in parallel (this is the key performance improvement)
    if (this.config.autoStart !== false) {
      this.logger.info(`Starting ${count} agents in parallel...`);
      await Promise.all(this.agents.map(agent => agent.start()));
    }

    this.logger.info(`Started ${count} agents successfully`);

    // Write initial registry and start periodic updates
    await this.writeAgentRegistry();
    this.startRegistryUpdates();

    // Memory leak fix: Start memory monitoring
    this.startMemoryMonitoring();

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

    // BUG-7 FIX: Use gracefulStop to save state before exit
    for (const agent of this.agents) {
      await agent.gracefulStop();
    }

    for (const mail of this.agentMails.values()) {
      await mail.shutdown();
    }

    this.agents = [];
    this.agentMails.clear();
    this.agentTasksCompleted.clear();
    this.agentStartTimes.clear();

    // Memory leak fix: Clear all agent output buffers
    this.clearAllAgentBuffers();

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
    branch?: string;  // Optional override, defaults to current branch
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
      retryCount: 0,
      maxRetries: 2,
      branch: params.branch || this._currentBranch,
      originBranch: this._currentBranch,
      targetBranches: [],
    });

    this.logger.info(`Created task: ${task.id} - ${task.title}`);

    // Broadcast to agents via MCP Mail
    // Use the standalone broadcastMail adapter (always available after initialize())
    if (this.broadcastMail) {
      await this.broadcastMail.publish({
        id: '',
        type: 'task.created',
        from: 'orchestrator',
        payload: {
          taskId: task.id,
          title: task.title,
          requiredSkills: task.requiredSkills,
          priority: task.priority,
          branch: task.branch,
        },
        timestamp: new Date(),
      });
      this.logger.debug(`Broadcast task.created for ${task.id}`);
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

    // Stop Memory Monitor first
    if (this.memoryMonitor) {
      this.memoryMonitor.stop();
      this.logger.info('Memory monitor stopped');
    }

    // Stop RuntimeManager if running
    if (this.runtimeManager?.isRunning()) {
      await this.runtimeManager.stop('manual_stop');
    }

    // Memory leak fix: Stop memory monitoring
    this.stopMemoryMonitoring();

    // Stop file watcher
    this.stopTaskFileWatcher();

    await this.stopAgents();

    if (this.cass) {
      this.cass.close();
    }

    // Close quality metrics adapter
    if (this.quality) {
      await this.quality.close();
    }

    // Close broadcast mail adapter
    if (this.broadcastMail) {
      await this.broadcastMail.shutdown();
    }

    this.logger.info('Jetpack shut down complete');
  }

  /**
   * Get the RuntimeManager instance (if configured)
   */
  getRuntimeManager(): RuntimeManager | undefined {
    return this.runtimeManager;
  }

  /**
   * Get current runtime stats (if RuntimeManager is configured)
   */
  getRuntimeStats(): RuntimeStats | null {
    return this.runtimeManager?.getStats() || null;
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
   * Get the quality metrics adapter (if enabled)
   */
  getQualityAdapter(): QualityMetricsAdapter | undefined {
    return this.quality;
  }

  /**
   * Get the regression detector (if quality metrics enabled)
   */
  getRegressionDetector(): RegressionDetector | undefined {
    return this.regressionDetector;
  }

  /**
   * Check if quality metrics tracking is enabled
   */
  isQualityMetricsEnabled(): boolean {
    return !!this.quality;
  }

  /**
   * Get the memory monitor instance (if enabled)
   */
  getMemoryMonitor(): MemoryMonitor | undefined {
    return this.memoryMonitor;
  }

  /**
   * Check if memory monitoring is enabled
   */
  isMemoryMonitoringEnabled(): boolean {
    return !!this.memoryMonitor;
  }

  /**
   * Get current memory stats (if memory monitoring is enabled)
   */
  getMemoryStats(): MemoryStats | null {
    return this.memoryMonitor?.getStats() || null;
  }

  /**
   * Check if tasks are paused due to memory pressure
   */
  isTasksPausedForMemory(): boolean {
    return this._tasksPausedForMemory;
  }

  /**
   * Get current memory severity level
   */
  getMemorySeverity(): MemorySeverity | null {
    return this.memoryMonitor?.getSeverity() || null;
  }

  /**
   * Record a quality snapshot after task completion
   * Called by agents to report metrics for a completed task
   */
  async recordQualitySnapshot(
    taskId: string,
    agentId: string,
    metrics: {
      lintErrors?: number;
      lintWarnings?: number;
      typeErrors?: number;
      testsPassing?: number;
      testsFailing?: number;
      testCoverage?: number;
      buildSuccess?: boolean;
    }
  ): Promise<RegressionSummary | null> {
    if (!this.quality || !this.regressionDetector) {
      return null;
    }

    // Create snapshot with provided or default metrics
    const snapshot = await this.quality.saveSnapshot({
      id: this.quality.generateSnapshotId(),
      taskId,
      timestamp: new Date(),
      isBaseline: false,
      metrics: {
        lintErrors: metrics.lintErrors ?? 0,
        lintWarnings: metrics.lintWarnings ?? 0,
        typeErrors: metrics.typeErrors ?? 0,
        testsPassing: metrics.testsPassing ?? 0,
        testsFailing: metrics.testsFailing ?? 0,
        testCoverage: metrics.testCoverage ?? 0,
        buildSuccess: metrics.buildSuccess ?? true,
      },
      tags: [`agent:${agentId}`, `task:${taskId}`],
    });

    this.logger.debug(`Recorded quality snapshot ${snapshot.id} for task ${taskId}`);

    // Check for regressions against baseline
    const baseline = await this.quality.getBaseline();
    if (!baseline) {
      // No baseline yet - consider making this the first baseline
      this.logger.debug('No quality baseline set - snapshot recorded without regression check');
      return null;
    }

    // Detect regressions
    const regressions = this.regressionDetector.detectRegressions(baseline, snapshot, taskId);

    if (regressions.length > 0) {
      const summary = this.regressionDetector.summarizeRegressions(regressions);

      this.logger.warn(
        `Quality regressions detected for task ${taskId}: ${summary.total} regressions`,
        summary.descriptions
      );

      // Notify via callback if configured
      if (this.config.onQualityRegression) {
        this.config.onQualityRegression(summary);
      }

      // Emit event for other listeners
      this.emit('qualityRegression', { taskId, agentId, summary, regressions });

      return summary;
    }

    return null;
  }

  /**
   * Set a quality snapshot as the baseline for regression detection
   */
  async setQualityBaseline(snapshotId: string): Promise<void> {
    if (!this.quality) {
      throw new Error('Quality metrics not enabled');
    }
    await this.quality.setBaseline(snapshotId);
    this.logger.info(`Set quality baseline to snapshot ${snapshotId}`);
  }

  /**
   * Create a baseline snapshot from current project state
   * Useful for establishing initial quality baseline
   */
  async createQualityBaseline(metrics: {
    lintErrors: number;
    lintWarnings: number;
    typeErrors: number;
    testsPassing: number;
    testsFailing: number;
    testCoverage: number;
    buildSuccess: boolean;
  }): Promise<string> {
    if (!this.quality) {
      throw new Error('Quality metrics not enabled');
    }

    const snapshot = await this.quality.saveSnapshot({
      id: this.quality.generateSnapshotId(),
      timestamp: new Date(),
      isBaseline: true,
      metrics,
      tags: ['baseline', 'initial'],
    });

    this.logger.info(`Created quality baseline snapshot ${snapshot.id}`);
    return snapshot.id;
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
   * Handle agent task completion - updates metrics and notifies RuntimeManager
   */
  private handleAgentTaskComplete(agentId: string): void {
    // Update metrics
    const current = this.agentTasksCompleted.get(agentId) || 0;
    this.agentTasksCompleted.set(agentId, current + 1);
    this.writeAgentRegistry().catch(() => {});

    // Notify RuntimeManager
    if (this.runtimeManager) {
      const agent = this.agents.find(a => a.getAgent().id === agentId);
      const taskId = agent?.getCurrentTask()?.id || 'unknown';
      this.runtimeManager.recordTaskComplete(taskId);
    }
  }

  /**
   * Handle agent task failure - notifies RuntimeManager
   */
  private handleAgentTaskFailed(_agentId: string, taskId: string, error: string): void {
    if (this.runtimeManager) {
      this.runtimeManager.recordTaskFailed(taskId, error);
    }
  }

  /**
   * Handle agent work cycle completion - notifies RuntimeManager
   */
  private handleAgentCycleComplete(): void {
    if (this.runtimeManager) {
      this.runtimeManager.recordCycle();
    }

    // Check if all tasks are complete (for natural end state)
    this.checkAllTasksComplete().catch(() => {});
  }

  /**
   * Check if all tasks are complete for natural end state
   */
  private async checkAllTasksComplete(): Promise<void> {
    if (!this.runtimeManager) return;

    const stats = await this.beads.getStats();
    const pendingOrActive =
      stats.byStatus.pending +
      stats.byStatus.ready +
      stats.byStatus.claimed +
      stats.byStatus.in_progress;

    if (pendingOrActive === 0 && stats.total > 0) {
      this.runtimeManager.signalAllTasksComplete();
    }
  }

  /**
   * Create and initialize a supervisor agent
   * @param llmConfig - LLM provider configuration
   * @param options - Additional supervisor options
   */
  async createSupervisor(
    llmConfig: LLMProviderConfigInput,
    options?: {
      /** Interval for background monitoring (default: 30000ms = 30s) */
      backgroundMonitorIntervalMs?: number;
      /** Poll interval for task status checks (default: 2000ms) */
      pollIntervalMs?: number;
      /** Max iterations for request execution (default: 100) */
      maxIterations?: number;
    }
  ): Promise<SupervisorAgent> {
    this.logger.info('Creating supervisor agent');

    this.supervisor = new SupervisorAgent({
      llm: llmConfig,
      beads: this.beads,
      cass: this.cass,
      getAgents: () => this.agents.map(a => a.getAgent()),
      getAgentMail: (agentId: string) => this.agentMails.get(agentId),
      backgroundMonitorIntervalMs: options?.backgroundMonitorIntervalMs,
      pollIntervalMs: options?.pollIntervalMs,
      maxIterations: options?.maxIterations,
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
