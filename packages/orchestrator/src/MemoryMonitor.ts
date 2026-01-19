import { EventEmitter } from 'events';
import * as v8 from 'v8';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  MemoryConfig,
  MemoryConfigSchema,
  HeapStats,
  MemorySeverity,
  MemoryEvent,
  MemoryAction,
  formatBytes,
  bytesToMb,
  Logger,
} from '@jetpack-agent/shared';

export interface MemoryMonitorConfig {
  /** Working directory for heap dumps */
  workDir: string;
  /** Memory configuration (uses defaults if not provided) */
  memoryConfig?: Partial<MemoryConfig>;
  /** Callback when severity level changes */
  onSeverityChange?: (from: MemorySeverity, to: MemorySeverity, stats: HeapStats) => void;
  /** Callback when tasks should be paused */
  onPauseTasks?: () => void;
  /** Callback when tasks can be resumed */
  onResumeTasks?: () => void;
  /** Callback when throttling should start */
  onThrottleStart?: () => void;
  /** Callback when throttling should stop */
  onThrottleStop?: () => void;
  /** Callback for emergency shutdown */
  onEmergencyShutdown?: () => void;
}

export class MemoryMonitor extends EventEmitter {
  private logger: Logger;
  private config: MemoryConfig;
  private workDir: string;
  private checkInterval?: NodeJS.Timeout;
  private currentSeverity: MemorySeverity = 'normal';
  private lastGCTime: number = 0;
  private isThrottling: boolean = false;
  private isPaused: boolean = false;
  private callbacks: {
    onSeverityChange?: MemoryMonitorConfig['onSeverityChange'];
    onPauseTasks?: MemoryMonitorConfig['onPauseTasks'];
    onResumeTasks?: MemoryMonitorConfig['onResumeTasks'];
    onThrottleStart?: MemoryMonitorConfig['onThrottleStart'];
    onThrottleStop?: MemoryMonitorConfig['onThrottleStop'];
    onEmergencyShutdown?: MemoryMonitorConfig['onEmergencyShutdown'];
  };

  constructor(config: MemoryMonitorConfig) {
    super();
    this.logger = new Logger('MemoryMonitor');
    this.workDir = config.workDir;
    this.config = MemoryConfigSchema.parse(config.memoryConfig || {});
    this.callbacks = {
      onSeverityChange: config.onSeverityChange,
      onPauseTasks: config.onPauseTasks,
      onResumeTasks: config.onResumeTasks,
      onThrottleStart: config.onThrottleStart,
      onThrottleStop: config.onThrottleStop,
      onEmergencyShutdown: config.onEmergencyShutdown,
    };
  }

  /**
   * Start monitoring memory usage
   */
  start(): void {
    if (!this.config.enabled) {
      this.logger.info('Memory monitoring disabled');
      return;
    }

    this.logger.info('Starting memory monitor', {
      checkInterval: this.config.checkIntervalMs,
      thresholds: this.config.thresholds,
    });

    // Initial check
    this.checkMemory();

    // Start periodic checks
    this.checkInterval = setInterval(() => {
      this.checkMemory();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop monitoring memory usage
   * @param cleanup If true, also removes all event listeners (default: false for reconfigure compatibility)
   */
  stop(cleanup: boolean = false): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
      this.logger.info('Memory monitor stopped');
    }

    // Clean up all event listeners when shutting down completely
    if (cleanup) {
      this.removeAllListeners();
    }
  }

  /**
   * Check if monitoring is active
   */
  isRunning(): boolean {
    return !!this.checkInterval;
  }

  /**
   * Get current memory statistics
   */
  getStats(): HeapStats {
    const mem = process.memoryUsage();
    return {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      rss: mem.rss,
      arrayBuffers: mem.arrayBuffers,
      severity: this.currentSeverity,
      timestamp: new Date(),
    };
  }

  /**
   * Get current severity level
   */
  getSeverity(): MemorySeverity {
    return this.currentSeverity;
  }

  /**
   * Check if tasks are currently paused due to memory pressure
   */
  isTasksPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Check if task intake is being throttled
   */
  isThrottled(): boolean {
    return this.isThrottling;
  }

  /**
   * Force a garbage collection (if available)
   */
  forceGC(reason: string = 'manual'): boolean {
    const now = Date.now();

    // Check cooldown
    if (now - this.lastGCTime < this.config.gcCooldownMs) {
      this.logger.debug('GC cooldown active, skipping');
      return false;
    }

    // gc() is only available when Node is run with --expose-gc flag
    if (global.gc) {
      this.logger.info(`Forcing garbage collection: ${reason}`);
      global.gc();
      this.lastGCTime = now;

      const stats = this.getStats();
      this.emitEvent({ type: 'gc_triggered', stats, reason });
      return true;
    } else {
      this.logger.debug('GC not available (run with --expose-gc to enable)');
      return false;
    }
  }

  /**
   * Create a heap dump for debugging
   */
  async createHeapDump(): Promise<string | null> {
    try {
      const dumpDir = path.join(this.workDir, '.jetpack', 'heapdumps');
      await fs.mkdir(dumpDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dumpPath = path.join(dumpDir, `heapdump-${timestamp}.heapsnapshot`);

      // v8.writeHeapSnapshot returns the filename
      const actualPath = v8.writeHeapSnapshot(dumpPath);

      this.logger.info(`Heap dump created: ${actualPath}`);

      const stats = this.getStats();
      this.emitEvent({ type: 'heap_dump_created', path: actualPath, stats });

      return actualPath;
    } catch (err) {
      this.logger.error('Failed to create heap dump:', err);
      return null;
    }
  }

  /**
   * Check memory usage and take appropriate actions
   */
  private checkMemory(): void {
    const stats = this.getStats();
    const heapUsedMB = bytesToMb(stats.heapUsed);
    const newSeverity = this.calculateSeverity(heapUsedMB);

    // Log periodic status at debug level
    this.logger.debug(`Memory check: ${formatBytes(stats.heapUsed)} heap used, severity: ${newSeverity}`);

    // Handle severity changes
    if (newSeverity !== this.currentSeverity) {
      this.handleSeverityChange(this.currentSeverity, newSeverity, stats);
    }

    // Execute actions for current severity
    this.executeActions(newSeverity, stats);
  }

  /**
   * Calculate severity based on heap usage
   */
  private calculateSeverity(heapUsedMB: number): MemorySeverity {
    const { thresholds } = this.config;

    if (heapUsedMB >= thresholds.emergencyMB) {
      return 'emergency';
    } else if (heapUsedMB >= thresholds.criticalMB) {
      return 'critical';
    } else if (heapUsedMB >= thresholds.elevatedMB) {
      return 'elevated';
    } else if (heapUsedMB >= thresholds.warningMB) {
      return 'warning';
    }
    return 'normal';
  }

  /**
   * Handle a severity level change
   */
  private handleSeverityChange(from: MemorySeverity, to: MemorySeverity, stats: HeapStats): void {
    const isEscalating = this.severityLevel(to) > this.severityLevel(from);

    if (isEscalating) {
      this.logger.warn(`Memory severity ESCALATED: ${from} → ${to}`, {
        heapUsed: formatBytes(stats.heapUsed),
      });
    } else {
      this.logger.info(`Memory severity decreased: ${from} → ${to}`, {
        heapUsed: formatBytes(stats.heapUsed),
      });
    }

    this.currentSeverity = to;
    this.emitEvent({ type: 'severity_changed', from, to, stats });

    if (this.callbacks.onSeverityChange) {
      this.callbacks.onSeverityChange(from, to, stats);
    }

    // Handle transitions
    this.handleStateTransitions(from, to, stats);
  }

  /**
   * Handle state transitions for throttling and pausing
   */
  private handleStateTransitions(_from: MemorySeverity, to: MemorySeverity, stats: HeapStats): void {
    const toLevel = this.severityLevel(to);

    // Throttling: starts at elevated, stops below elevated
    const throttleLevel = this.severityLevel('elevated');
    if (toLevel >= throttleLevel && !this.isThrottling) {
      this.isThrottling = true;
      this.emitEvent({ type: 'throttle_started', stats });
      if (this.callbacks.onThrottleStart) {
        this.callbacks.onThrottleStart();
      }
    } else if (toLevel < throttleLevel && this.isThrottling) {
      this.isThrottling = false;
      this.emitEvent({ type: 'throttle_stopped', stats });
      if (this.callbacks.onThrottleStop) {
        this.callbacks.onThrottleStop();
      }
    }

    // Pausing: starts at critical, stops below critical
    const pauseLevel = this.severityLevel('critical');
    if (toLevel >= pauseLevel && !this.isPaused) {
      this.isPaused = true;
      this.emitEvent({ type: 'tasks_paused', stats });
      if (this.callbacks.onPauseTasks) {
        this.callbacks.onPauseTasks();
      }
    } else if (toLevel < pauseLevel && this.isPaused) {
      this.isPaused = false;
      this.emitEvent({ type: 'tasks_resumed', stats });
      if (this.callbacks.onResumeTasks) {
        this.callbacks.onResumeTasks();
      }
    }
  }

  /**
   * Execute actions based on current severity
   */
  private executeActions(severity: MemorySeverity, stats: HeapStats): void {
    const actions = this.getActionsForSeverity(severity);

    for (const action of actions) {
      this.executeAction(action, severity, stats);
    }
  }

  /**
   * Get actions for a given severity level
   */
  private getActionsForSeverity(severity: MemorySeverity): MemoryAction[] {
    switch (severity) {
      case 'warning':
        return this.config.behavior.onWarning;
      case 'elevated':
        return this.config.behavior.onElevated;
      case 'critical':
        return this.config.behavior.onCritical;
      case 'emergency':
        return this.config.behavior.onEmergency;
      default:
        return [];
    }
  }

  /**
   * Execute a single action
   */
  private executeAction(action: MemoryAction, severity: MemorySeverity, stats: HeapStats): void {
    switch (action) {
      case 'log':
        this.logger.warn(`Memory ${severity}: ${formatBytes(stats.heapUsed)} heap used`);
        break;

      case 'notify':
        // Emit is already happening via other events, this is for external integrations
        this.emit('memoryWarning', { severity, stats });
        break;

      case 'gc':
        this.forceGC(`severity: ${severity}`);
        break;

      case 'throttle':
        // Throttling state is managed in handleStateTransitions
        break;

      case 'archive':
        // Archive old state - emit event for orchestrator to handle
        this.emit('archiveRequest', { severity, stats });
        break;

      case 'pause':
        // Pausing state is managed in handleStateTransitions
        break;

      case 'dump':
        if (this.config.heapDumpOnEmergency) {
          this.createHeapDump().catch((err) => {
            this.logger.error('Failed to create emergency heap dump:', err);
          });
        }
        break;

      case 'shutdown':
        this.logger.error('EMERGENCY: Memory critical, initiating graceful shutdown');
        this.emitEvent({ type: 'emergency_shutdown', stats });
        if (this.callbacks.onEmergencyShutdown) {
          this.callbacks.onEmergencyShutdown();
        }
        break;
    }
  }

  /**
   * Convert severity to numeric level for comparison
   */
  private severityLevel(severity: MemorySeverity): number {
    const levels: Record<MemorySeverity, number> = {
      normal: 0,
      warning: 1,
      elevated: 2,
      critical: 3,
      emergency: 4,
    };
    return levels[severity];
  }

  /**
   * Emit a typed memory event
   */
  private emitEvent(event: MemoryEvent): void {
    this.emit('memoryEvent', event);
    this.emit(event.type, event);
  }

  /**
   * Reconfigure the memory monitor at runtime
   */
  reconfigure(config: Partial<MemoryConfig>): void {
    const wasRunning = this.isRunning();

    if (wasRunning) {
      this.stop();
    }

    this.config = MemoryConfigSchema.parse({
      ...this.config,
      ...config,
    });

    this.logger.info('Memory monitor reconfigured', {
      thresholds: this.config.thresholds,
      checkInterval: this.config.checkIntervalMs,
    });

    if (wasRunning && this.config.enabled) {
      this.start();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): MemoryConfig {
    return { ...this.config };
  }

  /**
   * Get a summary of current memory status
   */
  getSummary(): {
    stats: HeapStats;
    severity: MemorySeverity;
    isThrottling: boolean;
    isPaused: boolean;
    thresholds: {
      warning: string;
      elevated: string;
      critical: string;
      emergency: string;
    };
  } {
    const stats = this.getStats();
    return {
      stats,
      severity: this.currentSeverity,
      isThrottling: this.isThrottling,
      isPaused: this.isPaused,
      thresholds: {
        warning: `${this.config.thresholds.warningMB} MB`,
        elevated: `${this.config.thresholds.elevatedMB} MB`,
        critical: `${this.config.thresholds.criticalMB} MB`,
        emergency: `${this.config.thresholds.emergencyMB} MB`,
      },
    };
  }
}

// Note: The global `gc` function is typed in @types/node when running with --expose-gc
