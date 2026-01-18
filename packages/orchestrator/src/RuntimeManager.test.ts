import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import { RuntimeManager, RuntimeManagerConfig } from './RuntimeManager';
import { RuntimeEvent, EndState } from '@jetpack-agent/shared';

const TEST_WORK_DIR = '/tmp/jetpack-test-runtime';

describe('RuntimeManager', () => {
  let manager: RuntimeManager;
  const defaultConfig: RuntimeManagerConfig = {
    workDir: TEST_WORK_DIR,
    limits: {
      maxCycles: 0,
      maxRuntimeMs: 0,
      idleTimeoutMs: 0,
      maxConsecutiveFailures: 5,
      minQueueSize: 0,
      checkIntervalMs: 100, // Fast for testing
    },
  };

  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(TEST_WORK_DIR, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist
    }
    await fs.mkdir(TEST_WORK_DIR, { recursive: true });

    manager = new RuntimeManager(defaultConfig);
  });

  afterEach(async () => {
    if (manager.isRunning()) {
      await manager.stop();
    }

    // Clean up
    try {
      await fs.rm(TEST_WORK_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    it('should start in stopped state', () => {
      expect(manager.isRunning()).toBe(false);
    });

    it('should have null end state initially', () => {
      expect(manager.getEndState()).toBeNull();
    });

    it('should have zero stats initially', () => {
      const stats = manager.getStats();
      expect(stats.cycleCount).toBe(0);
      expect(stats.tasksCompleted).toBe(0);
      expect(stats.tasksFailed).toBe(0);
    });
  });

  describe('start', () => {
    it('should set running to true', async () => {
      await manager.start();
      expect(manager.isRunning()).toBe(true);
    });

    it('should record start time', async () => {
      const before = Date.now();
      await manager.start();
      const stats = manager.getStats();

      expect(stats.startedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(stats.startedAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should not start twice', async () => {
      await manager.start();
      await manager.start(); // Should not throw

      expect(manager.isRunning()).toBe(true);
    });
  });

  describe('stop', () => {
    it('should set running to false', async () => {
      await manager.start();
      await manager.stop();

      expect(manager.isRunning()).toBe(false);
    });

    it('should set end state', async () => {
      await manager.start();
      await manager.stop('manual_stop');

      expect(manager.getEndState()).toBe('manual_stop');
    });

    it('should call onEndState callback', async () => {
      const onEndState = vi.fn();
      const managerWithCallback = new RuntimeManager({
        ...defaultConfig,
        onEndState,
      });

      await managerWithCallback.start();
      await managerWithCallback.stop('manual_stop');

      expect(onEndState).toHaveBeenCalledTimes(1);
      expect(onEndState).toHaveBeenCalledWith('manual_stop', expect.any(Object));
    });

    it('should emit end_state event', async () => {
      const handler = vi.fn();
      manager.on('end_state', handler);

      await manager.start();
      await manager.stop('manual_stop');

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'end_state',
          endState: 'manual_stop',
        })
      );
    });

    it('should persist state to file', async () => {
      await manager.start();
      await manager.stop();

      const stateFile = `${TEST_WORK_DIR}/.jetpack/runtime-state.json`;
      const exists = await fs.access(stateFile).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe('recordCycle', () => {
    beforeEach(async () => {
      await manager.start();
    });

    it('should increment cycle count', () => {
      manager.recordCycle();
      expect(manager.getStats().cycleCount).toBe(1);

      manager.recordCycle();
      expect(manager.getStats().cycleCount).toBe(2);
    });

    it('should update lastWorkAt', () => {
      const before = Date.now();
      manager.recordCycle();
      const stats = manager.getStats();

      expect(stats.lastWorkAt).toBeDefined();
      expect(stats.lastWorkAt!.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('should emit cycle_complete event', () => {
      const handler = vi.fn();
      manager.on('cycle_complete', handler);

      manager.recordCycle();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'cycle_complete',
          cycleNumber: 1,
        })
      );
    });
  });

  describe('recordTaskComplete', () => {
    beforeEach(async () => {
      await manager.start();
    });

    it('should increment tasksCompleted', () => {
      manager.recordTaskComplete('task-1');
      expect(manager.getStats().tasksCompleted).toBe(1);
    });

    it('should reset consecutive failures', () => {
      manager.recordTaskFailed('task-fail', 'error');
      manager.recordTaskFailed('task-fail-2', 'error');
      expect(manager.getStats().consecutiveFailures).toBe(2);

      manager.recordTaskComplete('task-success');
      expect(manager.getStats().consecutiveFailures).toBe(0);
    });

    it('should emit task_complete event', () => {
      const handler = vi.fn();
      manager.on('task_complete', handler);

      manager.recordTaskComplete('task-1');

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task_complete',
          taskId: 'task-1',
        })
      );
    });
  });

  describe('recordTaskFailed', () => {
    beforeEach(async () => {
      await manager.start();
    });

    it('should increment tasksFailed', () => {
      manager.recordTaskFailed('task-1', 'error message');
      expect(manager.getStats().tasksFailed).toBe(1);
    });

    it('should increment consecutiveFailures', () => {
      manager.recordTaskFailed('task-1', 'error');
      manager.recordTaskFailed('task-2', 'error');
      expect(manager.getStats().consecutiveFailures).toBe(2);
    });

    it('should emit task_failed event', () => {
      const handler = vi.fn();
      manager.on('task_failed', handler);

      manager.recordTaskFailed('task-1', 'timeout error');

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task_failed',
          taskId: 'task-1',
          error: 'timeout error',
        })
      );
    });
  });

  describe('cycle limit', () => {
    it('should stop at max cycles', async () => {
      const limitedManager = new RuntimeManager({
        ...defaultConfig,
        limits: {
          ...defaultConfig.limits,
          maxCycles: 3,
        },
      });

      await limitedManager.start();

      limitedManager.recordCycle();
      expect(limitedManager.isRunning()).toBe(true);

      limitedManager.recordCycle();
      expect(limitedManager.isRunning()).toBe(true);

      limitedManager.recordCycle();

      // Give it a moment to process the stop
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(limitedManager.isRunning()).toBe(false);
      expect(limitedManager.getEndState()).toBe('max_cycles_reached');
    });
  });

  describe('max consecutive failures', () => {
    it('should stop after max consecutive failures', async () => {
      const limitedManager = new RuntimeManager({
        ...defaultConfig,
        limits: {
          ...defaultConfig.limits,
          maxConsecutiveFailures: 3,
        },
      });

      await limitedManager.start();

      limitedManager.recordTaskFailed('t1', 'error');
      limitedManager.recordTaskFailed('t2', 'error');
      expect(limitedManager.isRunning()).toBe(true);

      limitedManager.recordTaskFailed('t3', 'error');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(limitedManager.isRunning()).toBe(false);
      expect(limitedManager.getEndState()).toBe('max_failures_reached');
    });
  });

  describe('runtime limit', () => {
    it('should stop after max runtime', async () => {
      const limitedManager = new RuntimeManager({
        ...defaultConfig,
        limits: {
          ...defaultConfig.limits,
          maxRuntimeMs: 250, // Allow time for check interval
          checkIntervalMs: 100, // Minimum allowed by schema
        },
      });

      await limitedManager.start();

      // Wait for runtime to exceed limit + check interval
      await new Promise(resolve => setTimeout(resolve, 400));

      expect(limitedManager.isRunning()).toBe(false);
      expect(limitedManager.getEndState()).toBe('max_runtime_reached');
    });
  });

  describe('idle timeout', () => {
    it('should stop after idle timeout', async () => {
      const limitedManager = new RuntimeManager({
        ...defaultConfig,
        limits: {
          ...defaultConfig.limits,
          idleTimeoutMs: 150, // Allow time for check interval
          checkIntervalMs: 100, // Minimum allowed by schema
        },
      });

      await limitedManager.start();
      limitedManager.recordCycle(); // Set lastWorkAt

      // Wait for idle timeout + check interval
      await new Promise(resolve => setTimeout(resolve, 350));

      expect(limitedManager.isRunning()).toBe(false);
      expect(limitedManager.getEndState()).toBe('idle_timeout');
    });
  });

  describe('signalAllTasksComplete', () => {
    it('should stop when minQueueSize is 0', async () => {
      await manager.start();

      manager.signalAllTasksComplete();

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(manager.isRunning()).toBe(false);
      expect(manager.getEndState()).toBe('all_tasks_complete');
    });

    it('should not stop when minQueueSize > 0', async () => {
      const managerWithQueue = new RuntimeManager({
        ...defaultConfig,
        limits: {
          ...defaultConfig.limits,
          minQueueSize: 3,
        },
      });

      await managerWithQueue.start();

      managerWithQueue.signalAllTasksComplete();

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(managerWithQueue.isRunning()).toBe(true);

      await managerWithQueue.stop();
    });
  });

  describe('signalObjectiveComplete', () => {
    it('should stop with objective_complete state', async () => {
      await manager.start();

      manager.signalObjectiveComplete();

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(manager.isRunning()).toBe(false);
      expect(manager.getEndState()).toBe('objective_complete');
    });
  });

  describe('getLimits', () => {
    it('should return configured limits', () => {
      const limits = manager.getLimits();

      expect(limits.maxCycles).toBe(0);
      expect(limits.maxConsecutiveFailures).toBe(5);
      expect(limits.checkIntervalMs).toBe(100);
    });

    it('should return copy (not reference)', () => {
      const limits1 = manager.getLimits();
      const limits2 = manager.getLimits();

      limits1.maxCycles = 999;

      expect(limits2.maxCycles).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should calculate elapsed time', async () => {
      await manager.start();

      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = manager.getStats();

      expect(stats.elapsedMs).toBeGreaterThanOrEqual(100);
    });

    it('should return zero elapsed when not started', () => {
      const stats = manager.getStats();
      expect(stats.elapsedMs).toBe(0);
    });
  });

  describe('state persistence', () => {
    it('should resume from previous state when endState is null (crash recovery)', async () => {
      await manager.start();
      manager.recordCycle();
      manager.recordCycle();
      manager.recordTaskComplete('task-1');

      // Simulate a crash by manually writing state file with null endState
      // (normally stop() would set endState, preventing resume)
      const stateDir = `${TEST_WORK_DIR}/.jetpack`;
      const stateFile = `${stateDir}/runtime-state.json`;
      await fs.mkdir(stateDir, { recursive: true });
      const crashState = {
        cycleCount: 2,
        startedAt: new Date().toISOString(),
        tasksCompleted: 1,
        tasksFailed: 0,
        consecutiveFailures: 0,
        endState: null, // Crash scenario - not properly stopped
      };
      await fs.writeFile(stateFile, JSON.stringify(crashState));

      // Force stop without saving (simulating process termination)
      (manager as unknown as { running: boolean }).running = false;

      // Create new manager and start it - should resume
      const newManager = new RuntimeManager(defaultConfig);
      await newManager.start();

      const stats = newManager.getStats();
      expect(stats.cycleCount).toBe(2);
      expect(stats.tasksCompleted).toBe(1);

      await newManager.stop();
    });

    it('should not resume if previous run ended', async () => {
      await manager.start();
      manager.recordCycle();
      manager.recordCycle();
      await manager.stop('manual_stop');

      // Create new manager
      const newManager = new RuntimeManager(defaultConfig);
      await newManager.start();

      const stats = newManager.getStats();
      expect(stats.cycleCount).toBe(0); // Fresh start because previous ended

      await newManager.stop();
    });
  });

  describe('event callbacks', () => {
    it('should call onEvent for all events', async () => {
      const onEvent = vi.fn();
      const managerWithEvents = new RuntimeManager({
        ...defaultConfig,
        onEvent,
      });

      await managerWithEvents.start();
      managerWithEvents.recordCycle();
      managerWithEvents.recordTaskComplete('task-1');
      await managerWithEvents.stop();

      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'cycle_complete' })
      );
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'task_complete' })
      );
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'end_state' })
      );
    });
  });
});
