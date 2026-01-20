import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { unlinkSync, existsSync } from 'fs';
import { SQLiteDataLayer } from '@jetpack-agent/data';
import { MockAdapter } from '@jetpack-agent/agent-harness';
import { SwarmCoordinator } from '../src/SwarmCoordinator.js';
import type { CoordinatorEvent } from '../src/types.js';

const TEST_DB_PATH = '/tmp/jetpack-coordinator-test.db';

describe('SwarmCoordinator', () => {
  let db: SQLiteDataLayer;
  let coordinator: SwarmCoordinator;
  let events: CoordinatorEvent[];

  beforeEach(async () => {
    // Clean up test database
    for (const suffix of ['', '-wal', '-shm']) {
      if (existsSync(TEST_DB_PATH + suffix)) {
        unlinkSync(TEST_DB_PATH + suffix);
      }
    }

    db = new SQLiteDataLayer({ dbPath: TEST_DB_PATH });
    await db.initialize();
    events = [];
  });

  afterEach(async () => {
    if (coordinator?.isRunning) {
      await coordinator.stop();
    }
    await db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      if (existsSync(TEST_DB_PATH + suffix)) {
        unlinkSync(TEST_DB_PATH + suffix);
      }
    }
  });

  describe('lifecycle', () => {
    it('should start and stop successfully', async () => {
      coordinator = new SwarmCoordinator(db, {
        workDir: '/tmp',
        autoDistribute: false, // Disable for this test
        monitorHealth: false,
        onEvent: (e) => events.push(e),
      });

      await coordinator.start();
      expect(coordinator.isRunning).toBe(true);
      expect(events.some((e) => e.type === 'coordinator_started')).toBe(true);

      await coordinator.stop();
      expect(coordinator.isRunning).toBe(false);
      expect(events.some((e) => e.type === 'coordinator_stopped')).toBe(true);
    });

    it('should throw if started twice', async () => {
      coordinator = new SwarmCoordinator(db, {
        workDir: '/tmp',
        autoDistribute: false,
        monitorHealth: false,
      });

      await coordinator.start();
      await expect(coordinator.start()).rejects.toThrow('already running');
      await coordinator.stop();
    });
  });

  describe('agent management', () => {
    it('should spawn and stop agents', async () => {
      coordinator = new SwarmCoordinator(db, {
        workDir: '/tmp',
        autoDistribute: false,
        monitorHealth: false,
        onEvent: (e) => events.push(e),
      });

      await coordinator.start();

      const mockAdapter = new MockAdapter({
        executionDelayMs: 10,
      });

      const agentId = await coordinator.spawnAgent({
        name: 'Test Agent',
        type: 'custom',
        adapter: mockAdapter,
        skills: ['typescript'],
        workDir: '/tmp',
      });

      expect(agentId).toBeDefined();
      expect(coordinator.agentCount).toBe(1);
      expect(events.some((e) => e.type === 'agent_spawned')).toBe(true);

      // Verify agent is in database
      const agent = await db.agents.get(agentId);
      expect(agent).not.toBeNull();
      expect(agent!.name).toBe('Test Agent');

      // Stop the agent
      await coordinator.stopAgent(agentId);
      expect(coordinator.agentCount).toBe(0);
      expect(events.some((e) => e.type === 'agent_stopped')).toBe(true);

      await coordinator.stop();
    });

    it('should enforce max agent limit', async () => {
      coordinator = new SwarmCoordinator(db, {
        workDir: '/tmp',
        maxAgents: 2,
        autoDistribute: false,
        monitorHealth: false,
      });

      await coordinator.start();

      const adapter1 = new MockAdapter({ executionDelayMs: 10 });
      const adapter2 = new MockAdapter({ executionDelayMs: 10 });
      const adapter3 = new MockAdapter({ executionDelayMs: 10 });

      await coordinator.spawnAgent({
        name: 'Agent 1',
        type: 'custom',
        adapter: adapter1,
        skills: [],
        workDir: '/tmp',
      });

      await coordinator.spawnAgent({
        name: 'Agent 2',
        type: 'custom',
        adapter: adapter2,
        skills: [],
        workDir: '/tmp',
      });

      await expect(
        coordinator.spawnAgent({
          name: 'Agent 3',
          type: 'custom',
          adapter: adapter3,
          skills: [],
          workDir: '/tmp',
        })
      ).rejects.toThrow('Maximum agent limit');

      await coordinator.stop();
    });
  });

  describe('work distribution', () => {
    it('should distribute tasks to matching agents', async () => {
      coordinator = new SwarmCoordinator(db, {
        workDir: '/tmp',
        autoDistribute: false,
        monitorHealth: false,
        claimStrategy: 'best-fit',
        onEvent: (e) => events.push(e),
      });

      await coordinator.start();

      // Spawn an agent with typescript skills
      const mockAdapter = new MockAdapter({ executionDelayMs: 10 });
      const agentId = await coordinator.spawnAgent({
        name: 'TypeScript Agent',
        type: 'custom',
        adapter: mockAdapter,
        skills: ['typescript', 'react'],
        workDir: '/tmp',
      });

      // Create a task
      await db.tasks.create({
        title: 'TypeScript Task',
        requiredSkills: ['typescript'],
      });

      // Trigger distribution
      const result = await coordinator.distributeWork();

      expect(result.distributed).toBe(1);
      expect(result.unmatched.length).toBe(0);
      expect(result.assignments[0].agentId).toBe(agentId);
      expect(result.assignments[0].skillMatch).toBe(1); // 100% match

      await coordinator.stop();
    });

    it('should report unmatched tasks when no agents have skills', async () => {
      coordinator = new SwarmCoordinator(db, {
        workDir: '/tmp',
        autoDistribute: false,
        monitorHealth: false,
        onEvent: (e) => events.push(e),
      });

      await coordinator.start();

      // Spawn an agent with different skills
      const mockAdapter = new MockAdapter({ executionDelayMs: 10 });
      await coordinator.spawnAgent({
        name: 'Python Agent',
        type: 'custom',
        adapter: mockAdapter,
        skills: ['python'],
        workDir: '/tmp',
      });

      // Create a task requiring different skills
      const task = await db.tasks.create({
        title: 'Rust Task',
        requiredSkills: ['rust'],
      });

      // Trigger distribution
      const result = await coordinator.distributeWork();

      expect(result.distributed).toBe(0);
      expect(result.unmatched).toContain(task.id);

      await coordinator.stop();
    });

    it('should use round-robin strategy correctly', async () => {
      coordinator = new SwarmCoordinator(db, {
        workDir: '/tmp',
        autoDistribute: false,
        monitorHealth: false,
        claimStrategy: 'round-robin',
        onEvent: (e) => events.push(e),
      });

      await coordinator.start();

      // Spawn two agents with same skills
      const adapter1 = new MockAdapter({ executionDelayMs: 1000 }); // Long delay to prevent auto-claim
      const adapter2 = new MockAdapter({ executionDelayMs: 1000 });

      const agentId1 = await coordinator.spawnAgent({
        name: 'Agent 1',
        type: 'custom',
        adapter: adapter1,
        skills: ['typescript'],
        workDir: '/tmp',
      });

      const agentId2 = await coordinator.spawnAgent({
        name: 'Agent 2',
        type: 'custom',
        adapter: adapter2,
        skills: ['typescript'],
        workDir: '/tmp',
      });

      // Create two tasks at once
      await db.tasks.create({
        title: 'Task 1',
        requiredSkills: ['typescript'],
      });
      await db.tasks.create({
        title: 'Task 2',
        requiredSkills: ['typescript'],
      });

      // Single distribution call should assign to both agents round-robin
      const result = await coordinator.distributeWork();
      expect(result.distributed).toBe(2);

      // Should have assigned to different agents
      const assignedAgents = result.assignments.map((a) => a.agentId);
      expect(assignedAgents).toContain(agentId1);
      expect(assignedAgents).toContain(agentId2);

      await coordinator.stop();
    });
  });

  describe('statistics', () => {
    it('should track swarm statistics', async () => {
      coordinator = new SwarmCoordinator(db, {
        workDir: '/tmp',
        autoDistribute: false,
        monitorHealth: false,
      });

      await coordinator.start();

      // Initial stats
      let stats = await coordinator.getStats();
      expect(stats.totalAgents).toBe(0);
      expect(stats.uptimeMs).toBeGreaterThanOrEqual(0);

      // Spawn agents
      const adapter1 = new MockAdapter({ executionDelayMs: 10 });
      const adapter2 = new MockAdapter({ executionDelayMs: 10 });

      await coordinator.spawnAgent({
        name: 'Agent 1',
        type: 'custom',
        adapter: adapter1,
        skills: ['typescript'],
        workDir: '/tmp',
      });

      await coordinator.spawnAgent({
        name: 'Agent 2',
        type: 'custom',
        adapter: adapter2,
        skills: ['python'],
        workDir: '/tmp',
      });

      // Create tasks
      await db.tasks.create({ title: 'Task 1', requiredSkills: [] });

      stats = await coordinator.getStats();
      expect(stats.totalAgents).toBe(2);
      expect(stats.pendingTasks).toBeGreaterThanOrEqual(1);

      await coordinator.stop();
    });

    it('should report agent health status', async () => {
      coordinator = new SwarmCoordinator(db, {
        workDir: '/tmp',
        autoDistribute: false,
        monitorHealth: false,
      });

      await coordinator.start();

      const mockAdapter = new MockAdapter({ executionDelayMs: 10 });
      const agentId = await coordinator.spawnAgent({
        name: 'Test Agent',
        type: 'custom',
        adapter: mockAdapter,
        skills: ['typescript'],
        workDir: '/tmp',
      });

      const health = coordinator.getAgentHealth();
      expect(health.length).toBe(1);
      expect(health[0].agentId).toBe(agentId);
      expect(health[0].status).toBe('healthy');

      await coordinator.stop();
    });
  });
});
