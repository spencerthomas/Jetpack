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
});
