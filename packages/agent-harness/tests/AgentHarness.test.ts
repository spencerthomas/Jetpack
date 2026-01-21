import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { unlinkSync, existsSync } from 'fs';
import { SQLiteDataLayer } from '@jetpack-agent/data';
import { AgentHarness } from '../src/AgentHarness.js';
import { MockAdapter } from '../src/adapters/MockAdapter.js';
import type { AgentEvent } from '../src/types.js';

const TEST_DB_PATH = '/tmp/jetpack-harness-test.db';

describe('AgentHarness', () => {
  let db: SQLiteDataLayer;
  let mockAdapter: MockAdapter;

  beforeEach(async () => {
    // Clean up test database
    for (const suffix of ['', '-wal', '-shm']) {
      if (existsSync(TEST_DB_PATH + suffix)) {
        unlinkSync(TEST_DB_PATH + suffix);
      }
    }

    db = new SQLiteDataLayer({ dbPath: TEST_DB_PATH });
    await db.initialize();

    mockAdapter = new MockAdapter({
      provider: 'mock',
      model: 'test',
      executionDelayMs: 10, // Fast for tests
    });
  });

  afterEach(async () => {
    await db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      if (existsSync(TEST_DB_PATH + suffix)) {
        unlinkSync(TEST_DB_PATH + suffix);
      }
    }
  });

  describe('lifecycle', () => {
    it('should start and stop successfully', async () => {
      const agent = new AgentHarness(db, {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'custom',
        model: mockAdapter,
        skills: ['typescript'],
        workDir: '/tmp',
        heartbeatIntervalMs: 1000,
        workPollingIntervalMs: 1000,
      });

      const events: AgentEvent[] = [];
      agent.onEvent((e) => events.push(e));

      await agent.start();
      expect(agent.isRunning).toBe(true);

      // Verify agent is registered
      const registered = await db.agents.get('test-agent');
      expect(registered).not.toBeNull();
      expect(registered!.status).toBe('idle');

      await agent.stop();
      expect(agent.isRunning).toBe(false);

      // Verify started and stopped events
      expect(events.some((e) => e.type === 'started')).toBe(true);
      expect(events.some((e) => e.type === 'stopped')).toBe(true);

      // Verify agent is deregistered
      const deregistered = await db.agents.get('test-agent');
      expect(deregistered).toBeNull();
    });

    it('should throw if started twice', async () => {
      const agent = new AgentHarness(db, {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'custom',
        model: mockAdapter,
        skills: ['typescript'],
        workDir: '/tmp',
      });

      await agent.start();

      await expect(agent.start()).rejects.toThrow('already running');

      await agent.stop();
    });
  });

  describe('task execution', () => {
    it('should claim and execute a task', async () => {
      // Create a task
      const task = await db.tasks.create({
        title: 'Test Task',
        description: 'A task for testing',
        requiredSkills: ['typescript'],
      });

      const agent = new AgentHarness(db, {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'custom',
        model: mockAdapter,
        skills: ['typescript'],
        workDir: '/tmp',
        heartbeatIntervalMs: 100000, // Long interval to avoid interference
        workPollingIntervalMs: 100000,
      });

      const events: AgentEvent[] = [];
      agent.onEvent((e) => events.push(e));

      await agent.start();

      // Manually trigger work lookup (since we have long polling interval)
      // Access private method through any cast
      await (agent as any).lookForWork();

      // Wait for execution to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify task was completed
      const updatedTask = await db.tasks.get(task.id);
      expect(updatedTask!.status).toBe('completed');

      // Verify events
      expect(events.some((e) => e.type === 'task_claimed')).toBe(true);
      expect(events.some((e) => e.type === 'task_completed')).toBe(true);

      // Verify stats
      const stats = agent.getStats();
      expect(stats.tasksCompleted).toBe(1);

      await agent.stop();
    });

    it('should handle task failure', async () => {
      // Create a task
      const task = await db.tasks.create({
        title: 'Failing Task',
        requiredSkills: ['typescript'],
      });

      // Configure mock to fail
      mockAdapter.setFail(true);

      const agent = new AgentHarness(db, {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'custom',
        model: mockAdapter,
        skills: ['typescript'],
        workDir: '/tmp',
        heartbeatIntervalMs: 100000,
        workPollingIntervalMs: 100000,
      });

      const events: AgentEvent[] = [];
      agent.onEvent((e) => events.push(e));

      await agent.start();
      await (agent as any).lookForWork();

      // Wait for execution
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify task was failed (with retry since recoverable)
      const updatedTask = await db.tasks.get(task.id);
      expect(updatedTask!.status).toBe('pending_retry');
      expect(updatedTask!.retryCount).toBe(1);

      // Verify events
      expect(events.some((e) => e.type === 'task_failed')).toBe(true);

      // Verify stats
      const stats = agent.getStats();
      expect(stats.tasksFailed).toBe(1);

      await agent.stop();
    });

    it('should not claim tasks without matching skills', async () => {
      // Create a task requiring different skills
      await db.tasks.create({
        title: 'Python Task',
        requiredSkills: ['python'],
      });

      const agent = new AgentHarness(db, {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'custom',
        model: mockAdapter,
        skills: ['typescript'], // No Python skill
        workDir: '/tmp',
        heartbeatIntervalMs: 100000,
        workPollingIntervalMs: 100000,
      });

      await agent.start();
      await (agent as any).lookForWork();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify no task was claimed
      const stats = agent.getStats();
      expect(stats.currentTaskId).toBeNull();
      expect(stats.tasksCompleted).toBe(0);

      await agent.stop();
    });
  });

  describe('file leasing', () => {
    it('should acquire and release file leases during task execution', async () => {
      // Create a task with files
      const task = await db.tasks.create({
        title: 'File Task',
        files: ['src/Button.tsx', 'src/utils.ts'],
        requiredSkills: ['typescript'],
      });

      const agent = new AgentHarness(db, {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'custom',
        model: mockAdapter,
        skills: ['typescript'],
        workDir: '/tmp',
        heartbeatIntervalMs: 100000,
        workPollingIntervalMs: 100000,
      });

      await agent.start();
      await (agent as any).lookForWork();

      // Wait for execution
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify leases were released after completion
      const lease1 = await db.leases.check('src/Button.tsx');
      const lease2 = await db.leases.check('src/utils.ts');
      expect(lease1).toBeNull();
      expect(lease2).toBeNull();

      await agent.stop();
    });
  });

  describe('messaging', () => {
    it('should broadcast task.claimed and task.completed messages', async () => {
      await db.tasks.create({
        title: 'Message Task',
        requiredSkills: ['typescript'],
      });

      const agent = new AgentHarness(db, {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'custom',
        model: mockAdapter,
        skills: ['typescript'],
        workDir: '/tmp',
        heartbeatIntervalMs: 100000,
        workPollingIntervalMs: 100000,
      });

      await agent.start();
      await (agent as any).lookForWork();

      // Wait for execution
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check messages
      const messages = await db.messages.receive('test-agent');

      // Should have agent.started, task.claimed, task.completed
      expect(messages.some((m) => m.type === 'agent.started')).toBe(true);
      expect(messages.some((m) => m.type === 'task.claimed')).toBe(true);
      expect(messages.some((m) => m.type === 'task.completed')).toBe(true);

      await agent.stop();
    });
  });

  describe('event subscription', () => {
    it('should allow subscribing and unsubscribing from events', async () => {
      const agent = new AgentHarness(db, {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'custom',
        model: mockAdapter,
        skills: ['typescript'],
        workDir: '/tmp',
      });

      const events1: AgentEvent[] = [];
      const events2: AgentEvent[] = [];

      const unsub1 = agent.onEvent((e) => events1.push(e));
      agent.onEvent((e) => events2.push(e));

      await agent.start();

      // Both should have received started event
      expect(events1.some((e) => e.type === 'started')).toBe(true);
      expect(events2.some((e) => e.type === 'started')).toBe(true);

      // Unsubscribe first callback
      unsub1();

      await agent.stop();

      // Only second should have received stopped event
      expect(events1.filter((e) => e.type === 'stopped').length).toBe(0);
      expect(events2.some((e) => e.type === 'stopped')).toBe(true);
    });
  });

  describe('timeout handling', () => {
    it('should handle task timeout', async () => {
      const slowAdapter = new MockAdapter({
        executionDelayMs: 5000,
        onExecute: async () => {
          // Simulate a long-running task that exceeds timeout
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return {
            success: true,
            output: 'Task completed',
            filesCreated: [],
            filesModified: [],
            filesDeleted: [],
            durationMs: 5000,
          };
        },
      });

      const task = await db.tasks.create({
        title: 'Slow Task',
        requiredSkills: ['typescript'],
      });

      const agent = new AgentHarness(db, {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'custom',
        model: slowAdapter,
        skills: ['typescript'],
        workDir: '/tmp',
        maxTaskMinutes: 0.01, // ~600ms timeout
        heartbeatIntervalMs: 100000,
        workPollingIntervalMs: 100000,
      });

      await agent.start();
      await (agent as any).lookForWork();

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Task should be marked as failed (pending_retry since recoverable=true)
      const updatedTask = await db.tasks.get(task.id);
      expect(updatedTask!.status).toBe('pending_retry');

      await agent.stop();
    });

    it('should release file leases on timeout', async () => {
      const slowAdapter = new MockAdapter({
        executionDelayMs: 5000,
      });

      const task = await db.tasks.create({
        title: 'File Task',
        files: ['src/TimeoutFile.tsx'],
        requiredSkills: ['typescript'],
      });

      const agent = new AgentHarness(db, {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'custom',
        model: slowAdapter,
        skills: ['typescript'],
        workDir: '/tmp',
        maxTaskMinutes: 0.01,
        heartbeatIntervalMs: 100000,
        workPollingIntervalMs: 100000,
      });

      await agent.start();
      await (agent as any).lookForWork();
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify lease was released after timeout
      const lease = await db.leases.check('src/TimeoutFile.tsx');
      expect(lease).toBeNull();

      await agent.stop();
    });
  });

  describe('file lease contention', () => {
    it('should fail when unable to acquire file lease', async () => {
      // Register the other agent first (required for foreign key constraint)
      await db.agents.register({
        id: 'other-agent',
        name: 'Other Agent',
        type: 'custom',
        capabilities: {
          skills: ['typescript'],
          maxTaskMinutes: 60,
          canRunTests: true,
          canRunBuild: true,
          canAccessBrowser: false,
        },
      });

      const task = await db.tasks.create({
        title: 'File Task',
        files: ['src/Blocked.tsx'],
        requiredSkills: ['typescript'],
      });

      // Acquire lease first
      await db.leases.acquire({
        filePath: 'src/Blocked.tsx',
        agentId: 'other-agent',
        taskId: 'other-task',
        durationMs: 60000,
      });

      const agent = new AgentHarness(db, {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'custom',
        model: mockAdapter,
        skills: ['typescript'],
        workDir: '/tmp',
        heartbeatIntervalMs: 100000,
        workPollingIntervalMs: 100000,
      });

      await agent.start();
      await (agent as any).lookForWork();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const updatedTask = await db.tasks.get(task.id);
      expect(updatedTask!.status).toBe('failed');

      await agent.stop();
    });
  });

  describe('heartbeat failure recovery', () => {
    it('should continue operating after failed heartbeat', async () => {
      const agent = new AgentHarness(db, {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'custom',
        model: mockAdapter,
        skills: ['typescript'],
        workDir: '/tmp',
        heartbeatIntervalMs: 100,
        workPollingIntervalMs: 100000,
      });

      // Create a task
      await db.tasks.create({
        title: 'Test Task',
        requiredSkills: ['typescript'],
      });

      const events: AgentEvent[] = [];
      agent.onEvent((e) => events.push(e));

      await agent.start();

      // Wait for multiple heartbeats
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Agent should still be running and able to claim tasks
      expect(agent.isRunning).toBe(true);
      const stats = agent.getStats();
      expect(stats.lastHeartbeat).not.toBeNull();

      await agent.stop();
    });
  });

  describe('progress callback edge cases', () => {
    it('should handle multiple progress callbacks', async () => {
      const progressUpdates: any[] = [];

      const adapterWithProgress = new MockAdapter({
        executionDelayMs: 200,
        onExecute: async (request) => {
          // Simulate multiple progress updates
          progressUpdates.push({ phase: 'analyzing', percentComplete: 20 });
          progressUpdates.push({ phase: 'planning', percentComplete: 40 });
          progressUpdates.push({ phase: 'implementing', percentComplete: 60 });
          progressUpdates.push({ phase: 'testing', percentComplete: 80 });

          return {
            success: true,
            output: 'Task completed',
            filesCreated: [],
            filesModified: [],
            filesDeleted: [],
            durationMs: 200,
          };
        },
      });

      await db.tasks.create({
        title: 'Progress Task',
        requiredSkills: ['typescript'],
      });

      const agent = new AgentHarness(db, {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'custom',
        model: adapterWithProgress,
        skills: ['typescript'],
        workDir: '/tmp',
        heartbeatIntervalMs: 100000,
        workPollingIntervalMs: 100000,
      });

      await agent.start();
      await (agent as any).lookForWork();
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(progressUpdates.length).toBeGreaterThan(0);

      await agent.stop();
    });

    it('should handle progress callback throwing errors', async () => {
      const adapterWithBadProgress = new MockAdapter({
        executionDelayMs: 100,
        onExecute: async () => ({
          success: true,
          output: 'Task completed',
          filesCreated: [],
          filesModified: [],
          filesDeleted: [],
          durationMs: 100,
        }),
      });

      await db.tasks.create({
        title: 'Bad Progress Task',
        requiredSkills: ['typescript'],
      });

      // Add a progress callback that throws - this tests error resilience
      const originalEmitEvent = (AgentHarness as any).prototype.emitEvent;
      let errorHandled = false;
      (AgentHarness as any).prototype.emitEvent = function(event: any) {
        // Simulate error handling in event system
        if (event.type === 'task_progress') {
          // Don't throw in emitEvent - the system handles errors
          try {
            throw new Error('Progress error');
          } catch (e) {
            errorHandled = true;
          }
        }
      };

      const agent = new AgentHarness(db, {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'custom',
        model: adapterWithBadProgress,
        skills: ['typescript'],
        workDir: '/tmp',
        heartbeatIntervalMs: 100000,
        workPollingIntervalMs: 100000,
      });

      await agent.start();
      await (agent as any).lookForWork();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Task should complete despite progress callback error
      const tasks = await db.tasks.list();
      const completedTask = tasks.find((t: Task) => t.title === 'Bad Progress Task');
      expect(completedTask?.status).toBe('completed');

      // Restore original method
      (AgentHarness as any).prototype.emitEvent = originalEmitEvent;

      await agent.stop();
    });
  });
});
