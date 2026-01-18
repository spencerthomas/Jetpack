import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  RuntimeLimits,
  RuntimeLimitsSchema,
  RuntimeStats,
  RuntimeState,
  RuntimeStateSchema,
  EndState,
  RuntimeEvent,
  formatDuration,
  Logger,
} from '@jetpack-agent/shared';

export interface RuntimeManagerConfig {
  workDir: string;
  limits: Partial<RuntimeLimits>;
  onEndState?: (endState: EndState, stats: RuntimeStats) => void | Promise<void>;
  onEvent?: (event: RuntimeEvent) => void;
}

/**
 * RuntimeManager handles lifecycle management for long-running autonomous operation.
 *
 * It tracks:
 * - Cycle count (each agent work cycle)
 * - Total runtime duration
 * - Consecutive failures
 * - Idle time (no work happening)
 *
 * And triggers graceful shutdown when limits are reached.
 */
export class RuntimeManager extends EventEmitter {
  private logger: Logger;
  private limits: RuntimeLimits;
  private stateFile: string;

  // Runtime tracking
  private cycleCount = 0;
  private tasksCompleted = 0;
  private tasksFailed = 0;
  private consecutiveFailures = 0;
  private startedAt: Date | null = null;
  private lastWorkAt: Date | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private running = false;
  private endState: EndState | null = null;

  // Callbacks
  private onEndStateCallback?: (endState: EndState, stats: RuntimeStats) => void | Promise<void>;
  private onEventCallback?: (event: RuntimeEvent) => void;

  constructor(config: RuntimeManagerConfig) {
    super();
    this.logger = new Logger('RuntimeManager');
    this.stateFile = path.join(config.workDir, '.jetpack', 'runtime-state.json');
    this.limits = RuntimeLimitsSchema.parse(config.limits);
    this.onEndStateCallback = config.onEndState;
    this.onEventCallback = config.onEvent;

    this.logger.debug('Initialized with limits:', this.limits);
  }

  /**
   * Start the runtime manager
   * Loads previous state if exists, starts the check loop
   */
  async start(): Promise<void> {
    if (this.running) {
      this.logger.warn('RuntimeManager already running');
      return;
    }

    this.running = true;
    this.startedAt = new Date();
    this.lastWorkAt = null;
    this.endState = null;

    // Try to load previous state for resume capability
    await this.loadState();

    // Start the periodic check loop
    this.checkInterval = setInterval(
      () => this.checkLimits(),
      this.limits.checkIntervalMs
    );

    this.logger.info(`Started with limits: cycles=${this.limits.maxCycles || '∞'}, runtime=${this.limits.maxRuntimeMs ? formatDuration(this.limits.maxRuntimeMs) : '∞'}, idleTimeout=${this.limits.idleTimeoutMs ? formatDuration(this.limits.idleTimeoutMs) : 'disabled'}`);
  }

  /**
   * Stop the runtime manager gracefully
   */
  async stop(endState: EndState = 'manual_stop'): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;
    this.endState = endState;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Persist final state
    await this.saveState();

    const stats = this.getStats();
    this.logger.info(`Stopped with end state: ${endState}`, stats);

    // Emit end state event
    const event: RuntimeEvent = { type: 'end_state', endState, stats };
    this.emitEvent(event);

    // Call the callback
    if (this.onEndStateCallback) {
      await this.onEndStateCallback(endState, stats);
    }

    // Clean up all event listeners to prevent memory leaks
    this.removeAllListeners();
  }

  /**
   * Record a completed work cycle
   * Called by AgentController after each task execution attempt
   */
  recordCycle(): void {
    this.cycleCount++;
    this.lastWorkAt = new Date();

    const stats = this.getStats();
    const event: RuntimeEvent = { type: 'cycle_complete', cycleNumber: this.cycleCount, stats };
    this.emitEvent(event);

    // Check if we hit the cycle limit
    if (this.limits.maxCycles > 0 && this.cycleCount >= this.limits.maxCycles) {
      this.logger.info(`Max cycles reached: ${this.cycleCount}/${this.limits.maxCycles}`);
      this.stop('max_cycles_reached').catch(err => this.logger.error('Error stopping:', err));
    }
  }

  /**
   * Record a successfully completed task
   */
  recordTaskComplete(taskId: string): void {
    this.tasksCompleted++;
    this.consecutiveFailures = 0; // Reset on success
    this.lastWorkAt = new Date();

    const stats = this.getStats();
    const event: RuntimeEvent = { type: 'task_complete', taskId, stats };
    this.emitEvent(event);
  }

  /**
   * Record a failed task
   */
  recordTaskFailed(taskId: string, error: string): void {
    this.tasksFailed++;
    this.consecutiveFailures++;
    this.lastWorkAt = new Date();

    const stats = this.getStats();
    const event: RuntimeEvent = { type: 'task_failed', taskId, error, stats };
    this.emitEvent(event);

    // Check if we hit max consecutive failures
    if (this.consecutiveFailures >= this.limits.maxConsecutiveFailures) {
      this.logger.error(`Max consecutive failures reached: ${this.consecutiveFailures}`);
      this.stop('max_failures_reached').catch(err => this.logger.error('Error stopping:', err));
    }
  }

  /**
   * Signal that all tasks are complete (queue empty)
   * Only triggers end state if minQueueSize is 0 (no auto-generation expected)
   */
  signalAllTasksComplete(): void {
    if (this.limits.minQueueSize === 0) {
      this.logger.info('All tasks complete, no more work expected');
      this.stop('all_tasks_complete').catch(err => this.logger.error('Error stopping:', err));
    }
  }

  /**
   * Signal that an objective has been completed (supervisor determined)
   */
  signalObjectiveComplete(): void {
    this.logger.info('Objective complete');
    this.stop('objective_complete').catch(err => this.logger.error('Error stopping:', err));
  }

  /**
   * Check all limits and trigger shutdown if any are exceeded
   */
  private checkLimits(): void {
    if (!this.running || !this.startedAt) {
      return;
    }

    const now = Date.now();
    const elapsed = now - this.startedAt.getTime();

    // Check runtime limit
    if (this.limits.maxRuntimeMs > 0 && elapsed >= this.limits.maxRuntimeMs) {
      this.logger.info(`Max runtime reached: ${formatDuration(elapsed)}`);
      this.stop('max_runtime_reached').catch(err => this.logger.error('Error stopping:', err));
      return;
    }

    // Check idle timeout
    if (this.limits.idleTimeoutMs > 0 && this.lastWorkAt) {
      const idleDuration = now - this.lastWorkAt.getTime();
      if (idleDuration >= this.limits.idleTimeoutMs) {
        this.logger.info(`Idle timeout reached: ${formatDuration(idleDuration)}`);
        const event: RuntimeEvent = { type: 'idle_detected', idleDurationMs: idleDuration };
        this.emitEvent(event);
        this.stop('idle_timeout').catch(err => this.logger.error('Error stopping:', err));
        return;
      }
    }

    // Emit warnings at 80% thresholds
    if (this.limits.maxCycles > 0) {
      const cyclePercent = this.cycleCount / this.limits.maxCycles;
      if (cyclePercent >= 0.8 && cyclePercent < 0.81) {
        const event: RuntimeEvent = {
          type: 'limit_warning',
          limitType: 'cycles',
          current: this.cycleCount,
          max: this.limits.maxCycles,
        };
        this.emitEvent(event);
      }
    }

    if (this.limits.maxRuntimeMs > 0) {
      const runtimePercent = elapsed / this.limits.maxRuntimeMs;
      if (runtimePercent >= 0.8 && runtimePercent < 0.81) {
        const event: RuntimeEvent = {
          type: 'limit_warning',
          limitType: 'runtime',
          current: elapsed,
          max: this.limits.maxRuntimeMs,
        };
        this.emitEvent(event);
      }
    }
  }

  /**
   * Get current runtime statistics
   */
  getStats(): RuntimeStats {
    const now = new Date();
    return {
      cycleCount: this.cycleCount,
      tasksCompleted: this.tasksCompleted,
      tasksFailed: this.tasksFailed,
      consecutiveFailures: this.consecutiveFailures,
      startedAt: this.startedAt || now,
      lastWorkAt: this.lastWorkAt || undefined,
      elapsedMs: this.startedAt ? now.getTime() - this.startedAt.getTime() : 0,
    };
  }

  /**
   * Get configured limits
   */
  getLimits(): RuntimeLimits {
    return { ...this.limits };
  }

  /**
   * Check if the manager is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the end state (null if still running)
   */
  getEndState(): EndState | null {
    return this.endState;
  }

  /**
   * Persist state to disk for recovery
   */
  private async saveState(): Promise<void> {
    const state: RuntimeState = {
      cycleCount: this.cycleCount,
      startedAt: this.startedAt || new Date(),
      lastWorkAt: this.lastWorkAt || undefined,
      tasksCompleted: this.tasksCompleted,
      tasksFailed: this.tasksFailed,
      activeObjectiveId: undefined, // TODO: integrate with supervisor
      endState: this.endState,
    };

    try {
      const dir = path.dirname(this.stateFile);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.stateFile, JSON.stringify(state, null, 2));
      this.logger.debug('Saved runtime state');
    } catch (err) {
      this.logger.error('Failed to save runtime state:', err);
    }
  }

  /**
   * Load state from disk for resume
   */
  private async loadState(): Promise<void> {
    try {
      const content = await fs.readFile(this.stateFile, 'utf-8');
      const state = RuntimeStateSchema.parse(JSON.parse(content));

      // Only resume if the previous run didn't end
      if (state.endState === null) {
        this.logger.info('Resuming from previous session');
        this.cycleCount = state.cycleCount;
        this.tasksCompleted = state.tasksCompleted;
        this.tasksFailed = state.tasksFailed;
        // Don't restore startedAt - treat this as a new session but with history
      }
    } catch {
      // No previous state or invalid - start fresh
      this.logger.debug('Starting fresh (no previous state)');
    }
  }

  /**
   * Emit an event to listeners and callback
   */
  private emitEvent(event: RuntimeEvent): void {
    this.emit(event.type, event);

    if (this.onEventCallback) {
      this.onEventCallback(event);
    }
  }
}
