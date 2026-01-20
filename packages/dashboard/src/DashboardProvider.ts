import { EventEmitter } from 'events';
import type { DataLayer, SwarmStatus, Task, Agent, Message } from '@jetpack-agent/data';

/**
 * Dashboard configuration
 */
export interface DashboardConfig {
  /** Polling interval for status updates (ms) */
  pollingIntervalMs?: number;
  /** Enable real-time event streaming */
  enableStreaming?: boolean;
  /** Maximum events to keep in history */
  maxEventHistory?: number;
}

/**
 * Dashboard event types
 */
export type DashboardEventType =
  | 'status.updated'
  | 'task.created'
  | 'task.updated'
  | 'task.completed'
  | 'task.failed'
  | 'agent.registered'
  | 'agent.heartbeat'
  | 'agent.deregistered'
  | 'message.received'
  | 'quality.regression';

/**
 * Dashboard event payload
 */
export interface DashboardEvent {
  type: DashboardEventType;
  timestamp: Date;
  data: unknown;
}

/**
 * Aggregated metrics for display
 */
export interface DashboardMetrics {
  // Task metrics
  taskMetrics: {
    total: number;
    pending: number;
    ready: number;
    claimed: number;
    inProgress: number;
    completed: number;
    failed: number;
    blocked: number;
    avgCompletionTimeMs: number;
    throughputPerHour: number;
  };

  // Agent metrics
  agentMetrics: {
    total: number;
    idle: number;
    busy: number;
    error: number;
    offline: number;
    avgTasksPerAgent: number;
    avgUptimeMinutes: number;
  };

  // Quality metrics
  qualityMetrics: {
    buildSuccess: boolean;
    typeErrors: number;
    lintErrors: number;
    lintWarnings: number;
    testsPassing: number;
    testsFailing: number;
    testCoverage: number;
    regressionCount: number;
  };

  // System metrics
  systemMetrics: {
    uptime: number;
    memoryUsedMB: number;
    dataLayerType: 'sqlite' | 'turso';
    messagesPerSecond: number;
  };
}

/**
 * Agent with recent activity
 */
export interface AgentWithActivity extends Agent {
  recentTasks: Array<{
    id: string;
    title: string;
    status: string;
    completedAt?: string;
  }>;
  currentOutput?: string;
}

const DEFAULT_CONFIG: Required<DashboardConfig> = {
  pollingIntervalMs: 5000,
  enableStreaming: true,
  maxEventHistory: 1000,
};

/**
 * Dashboard data provider for Jetpack Swarm
 * 
 * Provides real-time metrics, status updates, and event streaming
 * for building dashboard UIs.
 */
export class DashboardProvider extends EventEmitter {
  private config: Required<DashboardConfig>;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private eventHistory: DashboardEvent[] = [];
  private lastStatus: SwarmStatus | null = null;
  private startTime: Date;
  private messageCount = 0;
  private isRunning = false;

  constructor(
    private dataLayer: DataLayer,
    config?: DashboardConfig
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startTime = new Date();
  }

  /**
   * Start the dashboard provider
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startTime = new Date();

    // Initial fetch
    await this.fetchAndEmitStatus();

    // Start polling
    if (this.config.pollingIntervalMs > 0) {
      this.pollingTimer = setInterval(
        () => this.fetchAndEmitStatus(),
        this.config.pollingIntervalMs
      );
    }
  }

  /**
   * Stop the dashboard provider
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /**
   * Get current swarm status
   */
  async getStatus(): Promise<SwarmStatus> {
    return this.dataLayer.getSwarmStatus();
  }

  /**
   * Get aggregated dashboard metrics
   */
  async getMetrics(): Promise<DashboardMetrics> {
    const status = await this.getStatus();
    const baseline = await this.dataLayer.quality.getBaseline();
    const latestSnapshot = await this.dataLayer.quality.getLatestSnapshot();

    // Calculate task throughput
    const uptimeHours = (Date.now() - this.startTime.getTime()) / 3600000;
    const completedTasks = status.tasks.completed;
    const throughputPerHour = uptimeHours > 0 ? completedTasks / uptimeHours : 0;

    // Calculate avg tasks per agent
    const totalAgents = status.agents.total;
    const avgTasksPerAgent = totalAgents > 0 ? completedTasks / totalAgents : 0;

    return {
      taskMetrics: {
        total: status.tasks.total,
        pending: status.tasks.pending,
        ready: status.tasks.ready,
        claimed: status.tasks.claimed || 0,
        inProgress: status.tasks.inProgress,
        completed: status.tasks.completed,
        failed: status.tasks.failed,
        blocked: status.tasks.blocked,
        avgCompletionTimeMs: 0, // Would require task history analysis
        throughputPerHour: Math.round(throughputPerHour * 100) / 100,
      },
      agentMetrics: {
        total: status.agents.total,
        idle: status.agents.idle,
        busy: status.agents.busy,
        error: status.agents.error,
        offline: status.agents.offline,
        avgTasksPerAgent: Math.round(avgTasksPerAgent * 100) / 100,
        avgUptimeMinutes: status.swarm.uptime,
      },
      qualityMetrics: {
        buildSuccess: latestSnapshot?.buildSuccess ?? baseline?.buildSuccess ?? true,
        typeErrors: latestSnapshot?.typeErrors ?? baseline?.typeErrors ?? 0,
        lintErrors: latestSnapshot?.lintErrors ?? baseline?.lintErrors ?? 0,
        lintWarnings: latestSnapshot?.lintWarnings ?? baseline?.lintWarnings ?? 0,
        testsPassing: latestSnapshot?.testsPassing ?? baseline?.testsPassing ?? 0,
        testsFailing: latestSnapshot?.testsFailing ?? baseline?.testsFailing ?? 0,
        testCoverage: latestSnapshot?.testCoverage ?? baseline?.testCoverage ?? 0,
        regressionCount: status.quality.regressionCount,
      },
      systemMetrics: {
        uptime: status.swarm.uptime,
        memoryUsedMB: process.memoryUsage().heapUsed / 1024 / 1024,
        dataLayerType: status.swarm.dataLayerType,
        messagesPerSecond: this.calculateMessageRate(),
      },
    };
  }

  /**
   * Get all agents with their recent activity
   */
  async getAgentsWithActivity(): Promise<AgentWithActivity[]> {
    const agents = await this.dataLayer.agents.list({});
    const result: AgentWithActivity[] = [];

    for (const agent of agents) {
      // Get recent completed tasks for this agent
      const completedTasks = await this.dataLayer.tasks.list({
        status: 'completed',
      });

      const recentTasks = completedTasks
        .filter(t => t.assignedAgent === agent.id)
        .slice(0, 5)
        .map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          completedAt: t.completedAt ?? undefined,
        }));

      result.push({
        ...agent,
        recentTasks,
        currentOutput: undefined, // Would come from live agent output
      });
    }

    return result;
  }

  /**
   * Get recent events
   */
  getEventHistory(limit = 50): DashboardEvent[] {
    return this.eventHistory.slice(-limit);
  }

  /**
   * Get tasks grouped by status for Kanban view
   */
  async getTasksByStatus(): Promise<Record<string, Task[]>> {
    const tasks = await this.dataLayer.tasks.list({});
    
    const grouped: Record<string, Task[]> = {
      pending: [],
      ready: [],
      claimed: [],
      in_progress: [],
      blocked: [],
      completed: [],
      failed: [],
    };

    for (const task of tasks) {
      const status = task.status.replace('-', '_');
      if (grouped[status]) {
        grouped[status].push(task);
      }
    }

    return grouped;
  }

  /**
   * Subscribe to specific event types
   */
  subscribe(
    eventTypes: DashboardEventType | DashboardEventType[],
    handler: (event: DashboardEvent) => void
  ): () => void {
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
    
    const listener = (event: DashboardEvent) => {
      if (types.includes(event.type)) {
        handler(event);
      }
    };

    this.on('event', listener);
    return () => this.off('event', listener);
  }

  /**
   * Record an external event (for integration with other components)
   */
  recordEvent(type: DashboardEventType, data: unknown): void {
    const event: DashboardEvent = {
      type,
      timestamp: new Date(),
      data,
    };

    this.eventHistory.push(event);

    // Trim history if needed
    if (this.eventHistory.length > this.config.maxEventHistory) {
      this.eventHistory = this.eventHistory.slice(-this.config.maxEventHistory);
    }

    this.emit('event', event);
    this.messageCount++;
  }

  /**
   * Fetch status and emit update events
   */
  private async fetchAndEmitStatus(): Promise<void> {
    try {
      const status = await this.getStatus();

      // Detect changes and emit events
      if (this.lastStatus) {
        this.detectAndEmitChanges(this.lastStatus, status);
      }

      this.lastStatus = status;
      this.recordEvent('status.updated', status);
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Detect changes between status updates
   */
  private detectAndEmitChanges(
    oldStatus: SwarmStatus,
    newStatus: SwarmStatus
  ): void {
    // Task status changes
    if (newStatus.tasks.completed > oldStatus.tasks.completed) {
      this.recordEvent('task.completed', {
        delta: newStatus.tasks.completed - oldStatus.tasks.completed,
      });
    }

    if (newStatus.tasks.failed > oldStatus.tasks.failed) {
      this.recordEvent('task.failed', {
        delta: newStatus.tasks.failed - oldStatus.tasks.failed,
      });
    }

    // Agent changes
    if (newStatus.agents.total !== oldStatus.agents.total) {
      if (newStatus.agents.total > oldStatus.agents.total) {
        this.recordEvent('agent.registered', {
          delta: newStatus.agents.total - oldStatus.agents.total,
        });
      } else {
        this.recordEvent('agent.deregistered', {
          delta: oldStatus.agents.total - newStatus.agents.total,
        });
      }
    }

    // Quality regressions
    if (newStatus.quality.regressionCount > oldStatus.quality.regressionCount) {
      this.recordEvent('quality.regression', {
        delta: newStatus.quality.regressionCount - oldStatus.quality.regressionCount,
      });
    }
  }

  /**
   * Calculate messages per second
   */
  private calculateMessageRate(): number {
    const uptimeSeconds = (Date.now() - this.startTime.getTime()) / 1000;
    return uptimeSeconds > 0 ? this.messageCount / uptimeSeconds : 0;
  }
}
