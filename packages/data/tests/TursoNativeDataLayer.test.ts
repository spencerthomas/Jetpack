/**
 * TursoNativeDataLayer Tests
 *
 * Tests the Turso-native implementation with:
 * - Basic CRUD operations (tasks, agents, messages, leases, quality)
 * - Native vector search (memory operations)
 * - Batch operations
 *
 * Note: These tests use a local file-based libSQL database for testing.
 * Production deployments would use Turso cloud with embedded replicas.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TursoNativeDataLayer } from '../src/turso-native/TursoNativeDataLayer.js';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';

const TEST_DB_PATH = '/tmp/turso-native-test.db';

describe('TursoNativeDataLayer', () => {
  let dataLayer: TursoNativeDataLayer;

  beforeAll(async () => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      await unlink(TEST_DB_PATH);
    }

    // Create data layer with local file (no cloud sync for tests)
    dataLayer = new TursoNativeDataLayer({
      url: `file:${TEST_DB_PATH}`,
      authToken: '', // Not needed for local file
      enableEmbeddedReplica: false,
    });

    await dataLayer.initialize();
  });

  afterAll(async () => {
    await dataLayer.close();
    // Clean up test database
    if (existsSync(TEST_DB_PATH)) {
      await unlink(TEST_DB_PATH);
    }
  });

  describe('Health Check', () => {
    it('should report healthy after initialization', async () => {
      const healthy = await dataLayer.isHealthy();
      expect(healthy).toBe(true);
    });
  });

  describe('Task Operations', () => {
    let taskId: string;

    it('should create a task', async () => {
      const task = await dataLayer.tasks.create({
        title: 'Test task',
        description: 'A test task for TursoNativeDataLayer',
        priority: 'high',
        type: 'code',
        requiredSkills: ['typescript', 'react'],
      });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.title).toBe('Test task');
      expect(task.status).toBe('pending');
      expect(task.priority).toBe('high');
      taskId = task.id;
    });

    it('should get a task by ID', async () => {
      const task = await dataLayer.tasks.get(taskId);
      expect(task).toBeDefined();
      expect(task?.id).toBe(taskId);
      expect(task?.title).toBe('Test task');
    });

    it('should update a task', async () => {
      const updated = await dataLayer.tasks.update(taskId, {
        status: 'ready',
        description: 'Updated description',
      });

      expect(updated).toBeDefined();
      expect(updated?.status).toBe('ready');
      expect(updated?.description).toBe('Updated description');
    });

    it('should list tasks with filters', async () => {
      // Create additional tasks
      await dataLayer.tasks.create({
        title: 'Low priority task',
        priority: 'low',
        type: 'documentation',
      });

      const highPriorityTasks = await dataLayer.tasks.list({ priority: 'high' });
      expect(highPriorityTasks.length).toBeGreaterThanOrEqual(1);
      expect(highPriorityTasks.every(t => t.priority === 'high')).toBe(true);

      const readyTasks = await dataLayer.tasks.list({ status: 'ready' });
      expect(readyTasks.length).toBeGreaterThanOrEqual(1);
    });

    it('should claim a ready task', async () => {
      // First register an agent
      await dataLayer.agents.register({
        id: 'claim-agent-1',
        name: 'Claim Agent',
        type: 'claude-code',
        capabilities: { skills: ['typescript'] },
      });

      // Claim using the interface: claim(agentId, filter?)
      const claimed = await dataLayer.tasks.claim('claim-agent-1', { status: 'ready' });
      expect(claimed).toBeDefined();
      expect(claimed?.status).toBe('claimed');
      expect(claimed?.assignedAgent).toBe('claim-agent-1');
    });

    it('should complete a task', async () => {
      const result = {
        filesCreated: ['src/new-file.ts'],
        filesModified: ['src/existing.ts'],
        filesDeleted: [],
        summary: 'Completed the test task',
      };

      const completed = await dataLayer.tasks.complete(taskId, result);
      expect(completed).toBeDefined();
      expect(completed?.status).toBe('completed');
    });

    it('should count tasks', async () => {
      const count = await dataLayer.tasks.count();
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Agent Operations', () => {
    let agentId: string;

    it('should register an agent', async () => {
      const agent = await dataLayer.agents.register({
        id: 'agent-turso-1',
        name: 'Turso Test Agent',
        type: 'claude-code',
        capabilities: {
          skills: ['typescript', 'react', 'node'],
          maxTaskMinutes: 30,
          canRunTests: true,
        },
      });

      expect(agent).toBeDefined();
      expect(agent.id).toBe('agent-turso-1');
      expect(agent.name).toBe('Turso Test Agent');
      expect(agent.status).toBe('idle');
      agentId = agent.id;
    });

    it('should get an agent by ID', async () => {
      const agent = await dataLayer.agents.get(agentId);
      expect(agent).toBeDefined();
      expect(agent?.id).toBe(agentId);
    });

    it('should update heartbeat', async () => {
      // heartbeat returns boolean, not Agent
      const updated = await dataLayer.agents.heartbeat(agentId, {
        status: 'busy',
        currentTask: { id: 'task-123', progress: 50 },
      });

      expect(updated).toBe(true);

      // Verify update
      const agent = await dataLayer.agents.get(agentId);
      expect(agent?.status).toBe('busy');
    });

    it('should list agents with filters', async () => {
      const busyAgents = await dataLayer.agents.list({ status: 'busy' });
      expect(busyAgents.length).toBeGreaterThanOrEqual(1);

      const claudeAgents = await dataLayer.agents.list({ type: 'claude-code' });
      expect(claudeAgents.length).toBeGreaterThanOrEqual(1);
    });

    it('should count agents', async () => {
      const count = await dataLayer.agents.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('should deregister an agent', async () => {
      const result = await dataLayer.agents.deregister(agentId);
      expect(result).toBe(true);

      const agent = await dataLayer.agents.get(agentId);
      expect(agent).toBeNull(); // deregister deletes the agent
    });
  });

  describe('Message Operations', () => {
    let messageId: string;

    it('should send a message', async () => {
      const message = await dataLayer.messages.send({
        type: 'task.created',
        fromAgent: 'orchestrator',
        payload: { taskId: 'task-123', title: 'New Task' },
      });

      expect(message).toBeDefined();
      expect(message.id).toBeDefined();
      expect(message.type).toBe('task.created');
      messageId = message.id;
    });

    it('should send a targeted message', async () => {
      // Register an agent to receive messages
      await dataLayer.agents.register({
        id: 'msg-agent-1',
        name: 'Message Agent',
        type: 'claude-code',
        capabilities: { skills: [] },
      });

      const message = await dataLayer.messages.send({
        type: 'task.assigned',
        fromAgent: 'orchestrator',
        toAgent: 'msg-agent-1',
        payload: { taskId: 'task-456' },
        ackRequired: true,
      });

      expect(message.toAgent).toBe('msg-agent-1');
      expect(message.ackRequired).toBe(true);
    });

    it('should receive messages for an agent', async () => {
      const messages = await dataLayer.messages.receive('msg-agent-1');
      expect(messages.length).toBeGreaterThanOrEqual(1);
    });

    it('should acknowledge a message', async () => {
      const messages = await dataLayer.messages.receive('msg-agent-1');
      const targetMessage = messages.find(m => m.ackRequired);

      if (targetMessage) {
        const result = await dataLayer.messages.acknowledge(targetMessage.id, 'msg-agent-1');
        expect(result).toBe(true);
      }
    });

    it('should broadcast a message', async () => {
      const message = await dataLayer.messages.broadcast({
        type: 'system.shutdown',
        fromAgent: 'orchestrator',
        payload: { reason: 'test' },
      });

      expect(message).toBeDefined();
      expect(message.toAgent).toBeUndefined();
    });
  });

  describe('Lease Operations', () => {
    const testFilePath = 'src/components/Button.tsx';

    it('should acquire a lease', async () => {
      // Register an agent first
      await dataLayer.agents.register({
        id: 'lease-agent-1',
        name: 'Lease Agent',
        type: 'claude-code',
        capabilities: { skills: [] },
      });

      const acquired = await dataLayer.leases.acquire({
        filePath: testFilePath,
        agentId: 'lease-agent-1',
        durationMs: 60000,
      });

      expect(acquired).toBe(true);
    });

    it('should check a lease', async () => {
      const lease = await dataLayer.leases.check(testFilePath);
      expect(lease).toBeDefined();
      expect(lease?.agentId).toBe('lease-agent-1');
    });

    it('should prevent another agent from acquiring the same lease', async () => {
      await dataLayer.agents.register({
        id: 'lease-agent-2',
        name: 'Lease Agent 2',
        type: 'claude-code',
        capabilities: { skills: [] },
      });

      const acquired = await dataLayer.leases.acquire({
        filePath: testFilePath,
        agentId: 'lease-agent-2',
        durationMs: 60000,
      });

      expect(acquired).toBe(false);
    });

    it('should extend a lease', async () => {
      const extended = await dataLayer.leases.extend(
        testFilePath,
        'lease-agent-1',
        120000
      );
      expect(extended).toBe(true);
    });

    it('should release a lease', async () => {
      const released = await dataLayer.leases.release(testFilePath, 'lease-agent-1');
      expect(released).toBe(true);

      const lease = await dataLayer.leases.check(testFilePath);
      expect(lease).toBeNull();
    });

    it('should get agent leases', async () => {
      // Acquire another lease
      await dataLayer.leases.acquire({
        filePath: 'src/index.ts',
        agentId: 'lease-agent-1',
        durationMs: 60000,
      });

      const leases = await dataLayer.leases.getAgentLeases('lease-agent-1');
      expect(leases.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Quality Operations', () => {
    let snapshotId: string;

    it('should record a quality snapshot', async () => {
      const snapshot = await dataLayer.quality.recordSnapshot({
        buildSuccess: true,
        buildTimeMs: 5000,
        typeErrors: 0,
        lintErrors: 2,
        lintWarnings: 5,
        testsPassing: 45,
        testsFailing: 0,
        testsSkipped: 2,
        testCoverage: 85,
      });

      expect(snapshot).toBeDefined();
      expect(snapshot.id).toBeDefined();
      expect(snapshot.buildSuccess).toBe(true);
      snapshotId = snapshot.id;
    });

    it('should get a snapshot by ID', async () => {
      const snapshot = await dataLayer.quality.getSnapshot(snapshotId);
      expect(snapshot).toBeDefined();
      expect(snapshot?.testsPassing).toBe(45);
    });

    it('should get latest snapshot', async () => {
      const snapshot = await dataLayer.quality.getLatestSnapshot();
      expect(snapshot).toBeDefined();
    });

    it('should set a baseline', async () => {
      const baseline = await dataLayer.quality.setBaseline({
        buildSuccess: true,
        typeErrors: 0,
        lintErrors: 0,
        lintWarnings: 3,
        testsPassing: 50,
        testsFailing: 0,
        testCoverage: 80,
      });

      expect(baseline).toBeDefined();
      expect(baseline.testCoverage).toBe(80);
    });

    it('should get the baseline', async () => {
      const baseline = await dataLayer.quality.getBaseline();
      expect(baseline).toBeDefined();
      expect(baseline?.buildSuccess).toBe(true);
    });

    it('should detect regressions', async () => {
      // Create a snapshot with regressions
      const badSnapshot = await dataLayer.quality.recordSnapshot({
        buildSuccess: true,
        typeErrors: 5, // Regression: was 0
        lintErrors: 3, // Regression: was 0
        testsPassing: 48,
        testsFailing: 2, // Regression: was 0
        testCoverage: 70, // Regression: dropped >5%
      });

      const regressions = await dataLayer.quality.detectRegressions(badSnapshot);
      expect(regressions.length).toBeGreaterThan(0);
      expect(regressions.some(r => r.metric === 'typeErrors')).toBe(true);
      expect(regressions.some(r => r.metric === 'testsFailing')).toBe(true);
    });
  });

  describe('Memory Operations (Vector Search)', () => {
    let memoryId: string;

    it('should store a memory', async () => {
      const memory = await dataLayer.memories.store({
        content: 'TypeScript is a statically typed superset of JavaScript',
        memoryType: 'codebase_knowledge',
        importance: 0.8,
        tags: ['typescript', 'language', 'basics'],
        source: 'documentation',
      });

      expect(memory).toBeDefined();
      expect(memory.id).toBeDefined();
      expect(memory.content).toContain('TypeScript');
      memoryId = memory.id;
    });

    it('should get a memory by ID', async () => {
      const memory = await dataLayer.memories.get(memoryId);
      expect(memory).toBeDefined();
      expect(memory?.memoryType).toBe('codebase_knowledge');
    });

    it('should list memories with filters', async () => {
      // Add more memories
      await dataLayer.memories.store({
        content: 'React is a JavaScript library for building UIs',
        memoryType: 'codebase_knowledge',
        importance: 0.9,
        tags: ['react', 'frontend'],
      });

      await dataLayer.memories.store({
        content: 'Remember to always handle errors in async functions',
        memoryType: 'agent_learning',
        importance: 0.7,
        tags: ['best-practices', 'async'],
      });

      const knowledgeMemories = await dataLayer.memories.list({
        memoryType: 'codebase_knowledge',
      });
      expect(knowledgeMemories.length).toBeGreaterThanOrEqual(2);

      const highImportance = await dataLayer.memories.list({
        minImportance: 0.8,
      });
      expect(highImportance.length).toBeGreaterThanOrEqual(2);
    });

    it('should record access and update counts', async () => {
      await dataLayer.memories.recordAccess(memoryId);

      const memory = await dataLayer.memories.get(memoryId);
      expect(memory?.accessCount).toBeGreaterThan(0);
    });

    it('should update a memory', async () => {
      const updated = await dataLayer.memories.update(memoryId, {
        importance: 0.95,
      });

      expect(updated).toBeDefined();
      expect(updated?.importance).toBe(0.95);
    });

    it('should delete a memory', async () => {
      const tempMemory = await dataLayer.memories.store({
        content: 'Temporary memory to delete',
        memoryType: 'general',
      });

      const deleted = await dataLayer.memories.delete(tempMemory.id);
      expect(deleted).toBe(true);

      const retrieved = await dataLayer.memories.get(tempMemory.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Batch Operations', () => {
    it('should execute batch operations atomically', async () => {
      const result = await dataLayer.batch([
        {
          sql: `INSERT INTO tasks (id, title, status, priority, type, dependencies, blockers, required_skills, files, retry_count, max_retries, previous_agents, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          args: ['batch-task-1', 'Batch Task 1', 'pending', 'high', 'code', '[]', '[]', '[]', '[]', 0, 2, '[]'],
        },
        {
          sql: `INSERT INTO tasks (id, title, status, priority, type, dependencies, blockers, required_skills, files, retry_count, max_retries, previous_agents, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          args: ['batch-task-2', 'Batch Task 2', 'pending', 'medium', 'test', '[]', '[]', '[]', '[]', 0, 2, '[]'],
        },
      ]);

      expect(result.success).toBe(true);
      expect(result.results.length).toBe(2);

      // Verify both tasks were created
      const task1 = await dataLayer.tasks.get('batch-task-1');
      const task2 = await dataLayer.tasks.get('batch-task-2');
      expect(task1).toBeDefined();
      expect(task2).toBeDefined();
    });
  });

  describe('Swarm Status', () => {
    it('should return comprehensive swarm status', async () => {
      const status = await dataLayer.getSwarmStatus();

      expect(status).toBeDefined();
      expect(status.swarm).toBeDefined();
      expect(status.swarm.status).toMatch(/healthy|degraded|unhealthy/);
      expect(status.swarm.dataLayerType).toBe('turso');

      expect(status.agents).toBeDefined();
      expect(typeof status.agents.total).toBe('number');

      expect(status.tasks).toBeDefined();
      expect(typeof status.tasks.total).toBe('number');
      expect(typeof status.tasks.pending).toBe('number');

      expect(status.quality).toBeDefined();
      expect(typeof status.quality.regressionCount).toBe('number');
    });
  });
});
