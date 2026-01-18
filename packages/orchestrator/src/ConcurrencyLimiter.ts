import { EventEmitter } from 'events';
import { Logger, ConcurrencyConfig, ConcurrencyConfigSchema } from '@jetpack-agent/shared';

/**
 * A waiting request in the semaphore queue
 */
interface WaitingRequest {
  resolve: () => void;
  reject: (err: Error) => void;
  timeout?: NodeJS.Timeout;
}

/**
 * Events emitted by ConcurrencyLimiter
 */
export type ConcurrencyEvent =
  | { type: 'permit_acquired'; available: number; queued: number }
  | { type: 'permit_released'; available: number; queued: number }
  | { type: 'limit_changed'; oldLimit: number; newLimit: number; reason: string }
  | { type: 'queue_timeout'; queueLength: number }
  | { type: 'throttle_started'; newLimit: number }
  | { type: 'throttle_stopped'; restoredLimit: number };

export interface ConcurrencyLimiterConfig {
  /** Base configuration */
  config?: Partial<ConcurrencyConfig>;
  /** Maximum time to wait for a permit in ms (default: 5 minutes) */
  acquireTimeoutMs?: number;
  /** Callback when events occur */
  onEvent?: (event: ConcurrencyEvent) => void;
}

/**
 * Counting semaphore for limiting concurrent task execution
 * Supports dynamic limit adjustment and timeout for waiting requests
 */
export class Semaphore {
  private permits: number;
  private maxPermits: number;
  private waitingQueue: WaitingRequest[] = [];
  private logger: Logger;

  constructor(maxPermits: number, name: string = 'Semaphore') {
    this.maxPermits = maxPermits;
    this.permits = maxPermits;
    this.logger = new Logger(name);
  }

  /**
   * Acquire a permit, waiting if none available
   * @param timeoutMs Optional timeout in ms (default: no timeout)
   * @returns Promise that resolves when permit acquired
   * @throws Error if timeout or semaphore destroyed
   */
  async acquire(timeoutMs?: number): Promise<void> {
    // If permits available, take one immediately
    if (this.permits > 0) {
      this.permits--;
      this.logger.debug(`Permit acquired, ${this.permits}/${this.maxPermits} available`);
      return;
    }

    // Otherwise, wait in queue
    return new Promise<void>((resolve, reject) => {
      const request: WaitingRequest = { resolve, reject };

      // Set up timeout if specified
      if (timeoutMs && timeoutMs > 0) {
        request.timeout = setTimeout(() => {
          // Remove from queue
          const idx = this.waitingQueue.indexOf(request);
          if (idx !== -1) {
            this.waitingQueue.splice(idx, 1);
          }
          reject(new Error(`Semaphore acquire timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      }

      this.waitingQueue.push(request);
      this.logger.debug(`Queued for permit, ${this.waitingQueue.length} waiting`);
    });
  }

  /**
   * Release a permit back to the semaphore
   */
  release(): void {
    // If someone is waiting, give them the permit
    if (this.waitingQueue.length > 0) {
      const request = this.waitingQueue.shift()!;

      // Clear timeout if set
      if (request.timeout) {
        clearTimeout(request.timeout);
      }

      this.logger.debug(`Permit transferred to waiting request, ${this.waitingQueue.length} still waiting`);
      request.resolve();
      return;
    }

    // Otherwise, add permit back to pool
    if (this.permits < this.maxPermits) {
      this.permits++;
      this.logger.debug(`Permit released, ${this.permits}/${this.maxPermits} available`);
    }
  }

  /**
   * Get current available permits
   */
  get available(): number {
    return this.permits;
  }

  /**
   * Get current queue length
   */
  get queueLength(): number {
    return this.waitingQueue.length;
  }

  /**
   * Get maximum permits
   */
  get max(): number {
    return this.maxPermits;
  }

  /**
   * Dynamically adjust the maximum permits
   * If reducing, excess permits are not immediately reclaimed
   */
  setMaxPermits(newMax: number): void {
    const oldMax = this.maxPermits;
    this.maxPermits = newMax;

    // If increasing, add permits
    if (newMax > oldMax) {
      const toAdd = newMax - oldMax;
      this.permits = Math.min(this.permits + toAdd, newMax);

      // Wake up waiting requests if we have permits now
      while (this.waitingQueue.length > 0 && this.permits > 0) {
        const request = this.waitingQueue.shift()!;
        if (request.timeout) {
          clearTimeout(request.timeout);
        }
        this.permits--;
        request.resolve();
      }
    }

    this.logger.info(`Max permits changed: ${oldMax} -> ${newMax}`);
  }

  /**
   * Cancel all waiting requests
   */
  cancelAll(reason: string = 'Semaphore cancelled'): void {
    while (this.waitingQueue.length > 0) {
      const request = this.waitingQueue.shift()!;
      if (request.timeout) {
        clearTimeout(request.timeout);
      }
      request.reject(new Error(reason));
    }
  }
}

/**
 * Concurrency limiter for Jetpack task execution
 * Manages multiple semaphores for different resource types
 */
export class ConcurrencyLimiter extends EventEmitter {
  private logger: Logger;
  private config: ConcurrencyConfig;
  private taskSemaphore: Semaphore;
  private agentSemaphore: Semaphore;
  private acquireTimeoutMs: number;
  private originalTaskLimit: number;
  private isThrottled: boolean = false;

  constructor(config: ConcurrencyLimiterConfig = {}) {
    super();
    this.logger = new Logger('ConcurrencyLimiter');
    this.config = ConcurrencyConfigSchema.parse(config.config || {});
    this.acquireTimeoutMs = config.acquireTimeoutMs ?? 5 * 60 * 1000; // 5 minutes

    // Create semaphores for different resource types
    this.taskSemaphore = new Semaphore(this.config.maxConcurrentTasks, 'TaskSemaphore');
    this.agentSemaphore = new Semaphore(this.config.maxConcurrentAgents, 'AgentSemaphore');
    this.originalTaskLimit = this.config.maxConcurrentTasks;

    if (config.onEvent) {
      this.on('event', config.onEvent);
    }

    this.logger.info('Concurrency limiter initialized', {
      maxTasks: this.config.maxConcurrentTasks,
      maxAgents: this.config.maxConcurrentAgents,
    });
  }

  /**
   * Acquire a permit to execute a task
   * @returns Promise that resolves when execution can proceed
   */
  async acquireTaskPermit(): Promise<void> {
    await this.taskSemaphore.acquire(this.acquireTimeoutMs);
    this.emitEvent({
      type: 'permit_acquired',
      available: this.taskSemaphore.available,
      queued: this.taskSemaphore.queueLength,
    });
  }

  /**
   * Release a task execution permit
   */
  releaseTaskPermit(): void {
    this.taskSemaphore.release();
    this.emitEvent({
      type: 'permit_released',
      available: this.taskSemaphore.available,
      queued: this.taskSemaphore.queueLength,
    });
  }

  /**
   * Acquire a permit to spawn an agent
   */
  async acquireAgentPermit(): Promise<void> {
    await this.agentSemaphore.acquire(this.acquireTimeoutMs);
  }

  /**
   * Release an agent spawn permit
   */
  releaseAgentPermit(): void {
    this.agentSemaphore.release();
  }

  /**
   * Start throttling: reduce task concurrency
   * Called by MemoryMonitor when memory pressure is elevated
   */
  startThrottle(reductionFactor: number = 0.5): void {
    if (this.isThrottled) return;

    const newLimit = Math.max(1, Math.floor(this.originalTaskLimit * reductionFactor));
    this.taskSemaphore.setMaxPermits(newLimit);
    this.isThrottled = true;

    this.logger.warn(`Throttling started: task limit reduced to ${newLimit}`);
    this.emitEvent({
      type: 'throttle_started',
      newLimit,
    });
    this.emitEvent({
      type: 'limit_changed',
      oldLimit: this.originalTaskLimit,
      newLimit,
      reason: 'memory_pressure',
    });
  }

  /**
   * Stop throttling: restore original task concurrency
   * Called by MemoryMonitor when memory pressure subsides
   */
  stopThrottle(): void {
    if (!this.isThrottled) return;

    const oldLimit = this.taskSemaphore.max;
    this.taskSemaphore.setMaxPermits(this.originalTaskLimit);
    this.isThrottled = false;

    this.logger.info(`Throttling stopped: task limit restored to ${this.originalTaskLimit}`);
    this.emitEvent({
      type: 'throttle_stopped',
      restoredLimit: this.originalTaskLimit,
    });
    this.emitEvent({
      type: 'limit_changed',
      oldLimit,
      newLimit: this.originalTaskLimit,
      reason: 'memory_recovered',
    });
  }

  /**
   * Pause all new task acquisition
   * Called by MemoryMonitor when memory is critical
   */
  pauseTaskAcquisition(): void {
    this.taskSemaphore.setMaxPermits(0);
    this.logger.warn('Task acquisition paused');
    this.emitEvent({
      type: 'limit_changed',
      oldLimit: this.taskSemaphore.max,
      newLimit: 0,
      reason: 'memory_critical',
    });
  }

  /**
   * Resume task acquisition after pause
   */
  resumeTaskAcquisition(): void {
    const limit = this.isThrottled
      ? Math.floor(this.originalTaskLimit * 0.5)
      : this.originalTaskLimit;
    this.taskSemaphore.setMaxPermits(limit);
    this.logger.info(`Task acquisition resumed with limit ${limit}`);
  }

  /**
   * Get current status
   */
  getStatus(): {
    tasks: { available: number; max: number; queued: number };
    agents: { available: number; max: number; queued: number };
    isThrottled: boolean;
  } {
    return {
      tasks: {
        available: this.taskSemaphore.available,
        max: this.taskSemaphore.max,
        queued: this.taskSemaphore.queueLength,
      },
      agents: {
        available: this.agentSemaphore.available,
        max: this.agentSemaphore.max,
        queued: this.agentSemaphore.queueLength,
      },
      isThrottled: this.isThrottled,
    };
  }

  /**
   * Reconfigure limits at runtime
   */
  reconfigure(config: Partial<ConcurrencyConfig>): void {
    const newConfig = ConcurrencyConfigSchema.parse({
      ...this.config,
      ...config,
    });

    if (config.maxConcurrentTasks !== undefined) {
      this.originalTaskLimit = config.maxConcurrentTasks;
      if (!this.isThrottled) {
        this.taskSemaphore.setMaxPermits(config.maxConcurrentTasks);
      }
    }

    if (config.maxConcurrentAgents !== undefined) {
      this.agentSemaphore.setMaxPermits(config.maxConcurrentAgents);
    }

    this.config = newConfig;
    this.logger.info('Concurrency limiter reconfigured', this.config);
  }

  /**
   * Shutdown the limiter, cancelling all waiting requests
   */
  shutdown(): void {
    this.taskSemaphore.cancelAll('Concurrency limiter shutdown');
    this.agentSemaphore.cancelAll('Concurrency limiter shutdown');

    // Clean up all event listeners to prevent memory leaks
    this.removeAllListeners();

    this.logger.info('Concurrency limiter shutdown');
  }

  /**
   * Emit a typed event
   */
  private emitEvent(event: ConcurrencyEvent): void {
    this.emit('event', event);
    this.emit(event.type, event);
  }
}
