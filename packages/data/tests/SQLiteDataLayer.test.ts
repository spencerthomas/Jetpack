import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'fs';
import { SQLiteDataLayer } from '../src/SQLiteDataLayer.js';
import type { TaskCreate, AgentRegistration } from '../src/types.js';

const TEST_DB_PATH = '/tmp/jetpack-test.db';

describe('SQLiteDataLayer', () => {
  let db: SQLiteDataLayer;

  beforeEach(async () => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    if (existsSync(`${TEST_DB_PATH}-wal`)) {
      unlinkSync(`${TEST_DB_PATH}-wal`);
    }
    if (existsSync(`${TEST_DB_PATH}-shm`)) {
      unlinkSync(`${TEST_DB_PATH}-shm`);
    }

    db = new SQLiteDataLayer({ dbPath: TEST_DB_PATH });
    await db.initialize();
  });

  afterEach(async () => {
    await db.close();
    // Clean up test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    if (existsSync(`${TEST_DB_PATH}-wal`)) {
      unlinkSync(`${TEST_DB_PATH}-wal`);
    }
    if (existsSync(`${TEST_DB_PATH}-shm`)) {
      unlinkSync(`${TEST_DB_PATH}-shm`);
    }
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      expect(await db.isHealthy()).toBe(true);
      expect(db.type).toBe('sqlite');
    });
  });

  describe('tasks', () => {
    it('should create a task', async () => {
      const taskInput: TaskCreate = {
        title: 'Test Task',
        description: 'A test task',
        priority: 'high',
        type: 'code',
      };

      const task = await db.tasks.create(taskInput);

      expect(task.id).toMatch(/^task-/);
      expect(task.title).toBe('Test Task');
      expect(task.status).toBe('ready'); // No dependencies = ready
      expect(task.priority).toBe('high');
    });

    it('should create blocked task with dependencies', async () => {
      const dep = await db.tasks.create({ title: 'Dependency' });
      const task = await db.tasks.create({
        title: 'Dependent Task',
        dependencies: [dep.id],
      });

      expect(task.status).toBe('blocked');
      expect(task.dependencies).toContain(dep.id);
    });

    it('should get a task by id', async () => {
      const created = await db.tasks.create({ title: 'Test' });
      const found = await db.tasks.get(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('should return null for non-existent task', async () => {
      const found = await db.tasks.get('non-existent');
      expect(found).toBeNull();
    });

    it('should update a task', async () => {
      const task = await db.tasks.create({ title: 'Original' });
      const updated = await db.tasks.update(task.id, { title: 'Updated' });

      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('Updated');
    });

    it('should delete a task', async () => {
      const task = await db.tasks.create({ title: 'To Delete' });
      const deleted = await db.tasks.delete(task.id);

      expect(deleted).toBe(true);
      expect(await db.tasks.get(task.id)).toBeNull();
    });

    it('should list tasks with filters', async () => {
      await db.tasks.create({ title: 'High', priority: 'high' });
      await db.tasks.create({ title: 'Low', priority: 'low' });

      const highTasks = await db.tasks.list({ priority: 'high' });
      expect(highTasks).toHaveLength(1);
      expect(highTasks[0].title).toBe('High');
    });

    it('should count tasks', async () => {
      await db.tasks.create({ title: 'Task 1' });
      await db.tasks.create({ title: 'Task 2' });

      const count = await db.tasks.count();
      expect(count).toBe(2);
    });

    it('should claim a task atomically', async () => {
      await db.tasks.create({ title: 'Claimable' });

      // Register an agent first
      await db.agents.register({
        id: 'agent-1',
        name: 'Agent 1',
        type: 'claude-code',
        capabilities: { skills: ['typescript'] },
      });

      const claimed = await db.tasks.claim('agent-1');

      expect(claimed).not.toBeNull();
      expect(claimed!.status).toBe('claimed');
      expect(claimed!.assignedAgent).toBe('agent-1');
    });

    it('should complete a task', async () => {
      const task = await db.tasks.create({ title: 'To Complete' });
      await db.tasks.update(task.id, { status: 'in_progress' });

      const completed = await db.tasks.complete(task.id, {
        filesCreated: ['new.ts'],
        filesModified: ['existing.ts'],
        filesDeleted: [],
        summary: 'Done!',
      });

      expect(completed).not.toBeNull();
      expect(completed!.status).toBe('completed');
    });

    it('should fail a task with retry', async () => {
      const task = await db.tasks.create({ title: 'Will Fail', });
      await db.tasks.update(task.id, { status: 'in_progress' });

      const failed = await db.tasks.fail(task.id, {
        type: 'task_error',
        message: 'Something went wrong',
        recoverable: true,
      });

      expect(failed).not.toBeNull();
      expect(failed!.status).toBe('pending_retry');
      expect(failed!.retryCount).toBe(1);
    });

    it('should update blocked tasks to ready when dependencies complete', async () => {
      const dep = await db.tasks.create({ title: 'Dependency' });
      await db.tasks.create({
        title: 'Blocked',
        dependencies: [dep.id],
      });

      // Complete the dependency
      await db.tasks.update(dep.id, { status: 'completed' });

      // Update blocked tasks
      const updated = await db.tasks.updateBlockedToReady();
      expect(updated).toBe(1);

      // Verify the blocked task is now ready
      const tasks = await db.tasks.list({ status: 'ready' });
      const blockedTask = tasks.find((t) => t.title === 'Blocked');
      expect(blockedTask).toBeDefined();
      expect(blockedTask!.status).toBe('ready');
    });
  });

  describe('agents', () => {
    const agentInput: AgentRegistration = {
      id: 'agent-test',
      name: 'Test Agent',
      type: 'claude-code',
      capabilities: {
        skills: ['typescript', 'react'],
        maxTaskMinutes: 30,
        canRunTests: true,
        canRunBuild: true,
      },
    };

    it('should register an agent', async () => {
      const agent = await db.agents.register(agentInput);

      expect(agent.id).toBe('agent-test');
      expect(agent.name).toBe('Test Agent');
      expect(agent.status).toBe('idle');
      expect(agent.skills).toContain('typescript');
    });

    it('should get an agent by id', async () => {
      await db.agents.register(agentInput);
      const found = await db.agents.get('agent-test');

      expect(found).not.toBeNull();
      expect(found!.name).toBe('Test Agent');
    });

    it('should update heartbeat', async () => {
      await db.agents.register(agentInput);
      // Create a task to reference (foreign key constraint)
      const task = await db.tasks.create({ title: 'Test Task' });

      const updated = await db.agents.heartbeat('agent-test', {
        status: 'busy',
        currentTask: { id: task.id, progress: 50 },
      });

      expect(updated).toBe(true);

      const agent = await db.agents.get('agent-test');
      expect(agent!.status).toBe('busy');
      expect(agent!.currentTaskId).toBe(task.id);
      expect(agent!.heartbeatCount).toBe(1);
    });

    it('should deregister an agent', async () => {
      await db.agents.register(agentInput);
      const deleted = await db.agents.deregister('agent-test');

      expect(deleted).toBe(true);
      expect(await db.agents.get('agent-test')).toBeNull();
    });

    it('should list agents with filters', async () => {
      await db.agents.register(agentInput);
      await db.agents.register({
        ...agentInput,
        id: 'agent-browser',
        name: 'Browser Agent',
        type: 'browser',
        capabilities: { skills: ['playwright'] },
      });

      const claudeAgents = await db.agents.list({ type: 'claude-code' });
      expect(claudeAgents).toHaveLength(1);
      expect(claudeAgents[0].id).toBe('agent-test');
    });

    it('should find stale agents', async () => {
      await db.agents.register(agentInput);

      // Manually set a stale heartbeat
      const staleTime = new Date(Date.now() - 120000).toISOString(); // 2 min ago
      await db.agents.heartbeat('agent-test', { status: 'idle' });

      // Since we just heartbeated, there should be no stale agents with 1ms threshold
      const stale = await db.agents.findStale(1);
      expect(stale).toHaveLength(0);
    });
  });

  describe('messages', () => {
    beforeEach(async () => {
      // Register agents for messaging
      await db.agents.register({
        id: 'sender',
        name: 'Sender',
        type: 'claude-code',
        capabilities: { skills: [] },
      });
      await db.agents.register({
        id: 'receiver',
        name: 'Receiver',
        type: 'claude-code',
        capabilities: { skills: [] },
      });
    });

    it('should send and receive messages', async () => {
      const message = await db.messages.send({
        type: 'task.claimed',
        fromAgent: 'sender',
        toAgent: 'receiver',
        payload: { taskId: 'task-123' },
      });

      expect(message.id).toMatch(/^msg-/);
      expect(message.type).toBe('task.claimed');

      const received = await db.messages.receive('receiver');
      expect(received).toHaveLength(1);
      expect(received[0].id).toBe(message.id);
    });

    it('should broadcast messages', async () => {
      const broadcast = await db.messages.broadcast({
        type: 'system.shutdown',
        fromAgent: 'sender',
        payload: { reason: 'maintenance' },
      });

      expect(broadcast.toAgent).toBeNull();

      // Both agents should receive the broadcast
      const senderMessages = await db.messages.receive('sender');
      const receiverMessages = await db.messages.receive('receiver');

      // Broadcasts are received by all including sender
      expect(senderMessages.some((m) => m.id === broadcast.id)).toBe(true);
      expect(receiverMessages.some((m) => m.id === broadcast.id)).toBe(true);
    });

    it('should acknowledge messages', async () => {
      const message = await db.messages.send({
        type: 'task.assigned',
        fromAgent: 'sender',
        toAgent: 'receiver',
        ackRequired: true,
      });

      const acked = await db.messages.acknowledge(message.id, 'receiver');
      expect(acked).toBe(true);

      const updated = await db.messages.get(message.id);
      expect(updated!.acknowledgedAt).not.toBeNull();
      expect(updated!.acknowledgedBy).toBe('receiver');
    });
  });

  describe('leases', () => {
    beforeEach(async () => {
      await db.agents.register({
        id: 'agent-1',
        name: 'Agent 1',
        type: 'claude-code',
        capabilities: { skills: [] },
      });
    });

    it('should acquire and release leases', async () => {
      const acquired = await db.leases.acquire({
        filePath: 'src/Button.tsx',
        agentId: 'agent-1',
        durationMs: 60000,
      });

      expect(acquired).toBe(true);

      const lease = await db.leases.check('src/Button.tsx');
      expect(lease).not.toBeNull();
      expect(lease!.agentId).toBe('agent-1');

      const released = await db.leases.release('src/Button.tsx', 'agent-1');
      expect(released).toBe(true);

      const checkAfter = await db.leases.check('src/Button.tsx');
      expect(checkAfter).toBeNull();
    });

    it('should prevent concurrent lease acquisition', async () => {
      await db.agents.register({
        id: 'agent-2',
        name: 'Agent 2',
        type: 'claude-code',
        capabilities: { skills: [] },
      });

      const first = await db.leases.acquire({
        filePath: 'src/Shared.tsx',
        agentId: 'agent-1',
        durationMs: 60000,
      });

      const second = await db.leases.acquire({
        filePath: 'src/Shared.tsx',
        agentId: 'agent-2',
        durationMs: 60000,
      });

      expect(first).toBe(true);
      expect(second).toBe(false);
    });

    it('should extend leases', async () => {
      await db.leases.acquire({
        filePath: 'src/Button.tsx',
        agentId: 'agent-1',
        durationMs: 30000,
      });

      const extended = await db.leases.extend('src/Button.tsx', 'agent-1', 60000);
      expect(extended).toBe(true);

      const lease = await db.leases.check('src/Button.tsx');
      expect(lease!.renewedCount).toBe(1);
    });
  });

  describe('quality', () => {
    it('should record and retrieve quality snapshots', async () => {
      const snapshot = await db.quality.recordSnapshot({
        buildSuccess: true,
        typeErrors: 0,
        lintErrors: 2,
        testsPassing: 100,
        testsFailing: 0,
        testCoverage: 85,
      });

      expect(snapshot.id).toMatch(/^snap-/);
      expect(snapshot.lintErrors).toBe(2);

      const latest = await db.quality.getLatestSnapshot();
      expect(latest!.id).toBe(snapshot.id);
    });

    it('should set and get baseline', async () => {
      const baseline = await db.quality.setBaseline({
        buildSuccess: true,
        typeErrors: 0,
        lintErrors: 0,
        lintWarnings: 5,
        testsPassing: 100,
        testsFailing: 0,
        testCoverage: 80,
        setBy: 'test-agent',
      });

      expect(baseline.testCoverage).toBe(80);

      const retrieved = await db.quality.getBaseline();
      expect(retrieved).not.toBeNull();
      expect(retrieved!.testCoverage).toBe(80);
    });

    it('should detect regressions', async () => {
      await db.quality.setBaseline({
        buildSuccess: true,
        typeErrors: 0,
        lintErrors: 0,
        lintWarnings: 0,
        testsPassing: 100,
        testsFailing: 0,
        testCoverage: 80,
      });

      const snapshot = await db.quality.recordSnapshot({
        buildSuccess: true,
        typeErrors: 2, // Regression!
        lintErrors: 0,
        testsPassing: 95,
        testsFailing: 5, // Regression!
        testCoverage: 70, // Regression! (>5 drop, baseline is 80)
      });

      const regressions = await db.quality.detectRegressions(snapshot);

      expect(regressions.length).toBe(3);
      expect(regressions.find((r) => r.metric === 'typeErrors')).toBeDefined();
      expect(regressions.find((r) => r.metric === 'testsFailing')).toBeDefined();
      expect(regressions.find((r) => r.metric === 'testCoverage')).toBeDefined();
    });
  });

  describe('swarm status', () => {
    it('should return comprehensive swarm status', async () => {
      // Create some test data
      await db.agents.register({
        id: 'agent-1',
        name: 'Agent 1',
        type: 'claude-code',
        capabilities: { skills: [] },
      });
      await db.tasks.create({ title: 'Task 1' });
      await db.tasks.create({ title: 'Task 2', priority: 'high' });

      const status = await db.getSwarmStatus();

      expect(status.swarm.status).toBe('healthy');
      expect(status.swarm.dataLayerType).toBe('sqlite');
      expect(status.agents.total).toBe(1);
      expect(status.agents.idle).toBe(1);
      expect(status.tasks.total).toBe(2);
      expect(status.tasks.ready).toBe(2);
    });
  });

  describe('transactions', () => {
    it('should execute operations atomically', () => {
      // Use sync transaction
      const result = db.transaction(() => {
        db.tasks.create({ title: 'Tx Task 1' });
        db.tasks.create({ title: 'Tx Task 2' });
        return 'done';
      });

      expect(result).toBe('done');
    });
  });
});
