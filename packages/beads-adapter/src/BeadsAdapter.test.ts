import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BeadsAdapter, BeadsAdapterConfig } from './BeadsAdapter';
import { Task, TaskStatus } from '@jetpack-agent/shared';

const TEST_BEADS_DIR = '/tmp/jetpack-test-beads';

// Helper to create a task object
const createTask = (overrides: Partial<Task> = {}): Omit<Task, 'createdAt' | 'updatedAt'> => ({
  id: `bd-${Math.random().toString(36).substring(2, 10)}`,
  title: 'Test Task',
  description: 'A test task description',
  status: 'pending' as TaskStatus,
  priority: 'medium',
  requiredSkills: ['testing'],
  dependencies: [],
  blockers: [],
  ...overrides,
});

describe('BeadsAdapter', () => {
  let adapter: BeadsAdapter;
  const defaultConfig: BeadsAdapterConfig = {
    beadsDir: TEST_BEADS_DIR,
    autoCommit: false,
    gitEnabled: false,
  };

  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(TEST_BEADS_DIR, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist
    }
    await fs.mkdir(TEST_BEADS_DIR, { recursive: true });

    adapter = new BeadsAdapter(defaultConfig);
    await adapter.initialize();
  });

  afterEach(async () => {
    // Clean up
    try {
      await fs.rm(TEST_BEADS_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    it('should create beads directory on initialize', async () => {
      const exists = await fs.access(TEST_BEADS_DIR).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should create tasks.jsonl file on initialize', async () => {
      const tasksFile = path.join(TEST_BEADS_DIR, 'tasks.jsonl');
      const exists = await fs.access(tasksFile).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should load existing tasks on initialize', async () => {
      const tasksFile = path.join(TEST_BEADS_DIR, 'tasks.jsonl');
      const existingTask = {
        id: 'bd-existing',
        title: 'Existing Task',
        status: 'pending',
        priority: 'high',
        requiredSkills: [],
        dependencies: [],
        blockers: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await fs.writeFile(tasksFile, JSON.stringify(existingTask) + '\n');

      const newAdapter = new BeadsAdapter(defaultConfig);
      await newAdapter.initialize();

      const tasks = await newAdapter.listTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('bd-existing');
    });
  });

  describe('createTask', () => {
    it('should create a task and return it with timestamps', async () => {
      const taskData = createTask({ id: 'bd-test1', title: 'New Task' });
      const task = await adapter.createTask(taskData);

      expect(task.id).toBe('bd-test1');
      expect(task.title).toBe('New Task');
      expect(task.createdAt).toBeInstanceOf(Date);
      expect(task.updatedAt).toBeInstanceOf(Date);
    });

    it('should persist task to file', async () => {
      const taskData = createTask({ id: 'bd-persist' });
      await adapter.createTask(taskData);

      const tasksFile = path.join(TEST_BEADS_DIR, 'tasks.jsonl');
      const content = await fs.readFile(tasksFile, 'utf-8');
      expect(content).toContain('bd-persist');
    });

    it('should store task in memory', async () => {
      const taskData = createTask({ id: 'bd-memory' });
      await adapter.createTask(taskData);

      const retrieved = await adapter.getTask('bd-memory');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('bd-memory');
    });
  });

  describe('getTask', () => {
    it('should return task by ID', async () => {
      const taskData = createTask({ id: 'bd-get1' });
      await adapter.createTask(taskData);

      const task = await adapter.getTask('bd-get1');
      expect(task).not.toBeNull();
      expect(task?.id).toBe('bd-get1');
    });

    it('should return null for non-existent ID', async () => {
      const task = await adapter.getTask('bd-nonexistent');
      expect(task).toBeNull();
    });
  });

  describe('updateTask', () => {
    it('should update task properties', async () => {
      const taskData = createTask({ id: 'bd-update1', title: 'Original' });
      await adapter.createTask(taskData);

      const updated = await adapter.updateTask('bd-update1', { title: 'Updated' });
      expect(updated?.title).toBe('Updated');
    });

    it('should update updatedAt timestamp', async () => {
      const taskData = createTask({ id: 'bd-timestamp' });
      const created = await adapter.createTask(taskData);
      const originalUpdatedAt = created.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await adapter.updateTask('bd-timestamp', { title: 'Changed' });
      expect(updated?.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('should preserve original ID and createdAt', async () => {
      const taskData = createTask({ id: 'bd-preserve' });
      const created = await adapter.createTask(taskData);

      const updated = await adapter.updateTask('bd-preserve', {
        id: 'bd-different', // Try to change ID
        title: 'Changed',
      } as Partial<Task>);

      expect(updated?.id).toBe('bd-preserve');
      expect(updated?.createdAt.getTime()).toBe(created.createdAt.getTime());
    });

    it('should return null for non-existent task', async () => {
      const result = await adapter.updateTask('bd-nonexistent', { title: 'Test' });
      expect(result).toBeNull();
    });
  });

  describe('deleteTask', () => {
    it('should delete existing task', async () => {
      const taskData = createTask({ id: 'bd-delete1' });
      await adapter.createTask(taskData);

      const deleted = await adapter.deleteTask('bd-delete1');
      expect(deleted).toBe(true);

      const task = await adapter.getTask('bd-delete1');
      expect(task).toBeNull();
    });

    it('should return false for non-existent task', async () => {
      const deleted = await adapter.deleteTask('bd-nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('listTasks', () => {
    beforeEach(async () => {
      await adapter.createTask(createTask({ id: 'bd-list1', status: 'pending' }));
      await adapter.createTask(createTask({ id: 'bd-list2', status: 'completed', assignedAgent: 'agent-1' }));
      await adapter.createTask(createTask({ id: 'bd-list3', status: 'in_progress', assignedAgent: 'agent-2' }));
    });

    it('should list all tasks when no filter', async () => {
      const tasks = await adapter.listTasks();
      expect(tasks).toHaveLength(3);
    });

    it('should filter by status', async () => {
      const pending = await adapter.listTasks({ status: 'pending' });
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('bd-list1');
    });

    it('should filter by assignedAgent', async () => {
      const agent1Tasks = await adapter.listTasks({ assignedAgent: 'agent-1' });
      expect(agent1Tasks).toHaveLength(1);
      expect(agent1Tasks[0].id).toBe('bd-list2');
    });

    it('should filter by both status and agent', async () => {
      const tasks = await adapter.listTasks({
        status: 'completed',
        assignedAgent: 'agent-1',
      });
      expect(tasks).toHaveLength(1);
    });
  });

  describe('claimTask', () => {
    it('should claim a pending task', async () => {
      await adapter.createTask(createTask({ id: 'bd-claim1', status: 'pending' }));

      const claimed = await adapter.claimTask('bd-claim1', 'agent-claimer');
      expect(claimed).not.toBeNull();
      expect(claimed?.status).toBe('claimed');
      expect(claimed?.assignedAgent).toBe('agent-claimer');
    });

    it('should claim a ready task', async () => {
      await adapter.createTask(createTask({ id: 'bd-claim2', status: 'ready' }));

      const claimed = await adapter.claimTask('bd-claim2', 'agent-claimer');
      expect(claimed).not.toBeNull();
      expect(claimed?.status).toBe('claimed');
    });

    it('should return null for already claimed task', async () => {
      await adapter.createTask(createTask({ id: 'bd-claimed', status: 'claimed' }));

      const result = await adapter.claimTask('bd-claimed', 'agent-new');
      expect(result).toBeNull();
    });

    it('should return null for in_progress task', async () => {
      await adapter.createTask(createTask({ id: 'bd-progress', status: 'in_progress' }));

      const result = await adapter.claimTask('bd-progress', 'agent-new');
      expect(result).toBeNull();
    });

    it('should return null for non-existent task', async () => {
      const result = await adapter.claimTask('bd-nonexistent', 'agent-claimer');
      expect(result).toBeNull();
    });
  });

  describe('getReadyTasks', () => {
    it('should return tasks with no dependencies', async () => {
      await adapter.createTask(createTask({ id: 'bd-ready1', status: 'pending' }));

      const ready = await adapter.getReadyTasks();
      expect(ready.length).toBeGreaterThanOrEqual(1);
      expect(ready.some(t => t.id === 'bd-ready1')).toBe(true);
    });

    it('should not return tasks with incomplete dependencies', async () => {
      await adapter.createTask(createTask({ id: 'bd-dep', status: 'pending' }));
      await adapter.createTask(createTask({
        id: 'bd-blocked',
        status: 'pending',
        dependencies: ['bd-dep'],
      }));

      const ready = await adapter.getReadyTasks();
      expect(ready.some(t => t.id === 'bd-blocked')).toBe(false);
    });

    it('should return tasks when all dependencies are completed', async () => {
      await adapter.createTask(createTask({ id: 'bd-dep2', status: 'completed' }));
      await adapter.createTask(createTask({
        id: 'bd-unblocked',
        status: 'pending',
        dependencies: ['bd-dep2'],
      }));

      const ready = await adapter.getReadyTasks();
      expect(ready.some(t => t.id === 'bd-unblocked')).toBe(true);
    });

    it('should not return tasks with blockers', async () => {
      await adapter.createTask(createTask({
        id: 'bd-hasBlocker',
        status: 'pending',
        blockers: ['Need clarification from PM'],
      }));

      const ready = await adapter.getReadyTasks();
      expect(ready.some(t => t.id === 'bd-hasBlocker')).toBe(false);
    });

    it('should update pending tasks to ready status', async () => {
      await adapter.createTask(createTask({ id: 'bd-pending', status: 'pending' }));

      const ready = await adapter.getReadyTasks();
      const task = ready.find(t => t.id === 'bd-pending');
      expect(task?.status).toBe('ready');
    });
  });

  describe('getTasksByAgent', () => {
    beforeEach(async () => {
      await adapter.createTask(createTask({
        id: 'bd-agent1-1',
        status: 'in_progress',
        assignedAgent: 'agent-1',
      }));
      await adapter.createTask(createTask({
        id: 'bd-agent1-2',
        status: 'completed',
        assignedAgent: 'agent-1',
      }));
      await adapter.createTask(createTask({
        id: 'bd-agent2-1',
        status: 'claimed',
        assignedAgent: 'agent-2',
      }));
    });

    it('should return active tasks for agent', async () => {
      const tasks = await adapter.getTasksByAgent('agent-1');
      expect(tasks).toHaveLength(1); // Only in_progress, not completed
      expect(tasks[0].id).toBe('bd-agent1-1');
    });

    it('should exclude completed tasks', async () => {
      const tasks = await adapter.getTasksByAgent('agent-1');
      expect(tasks.some(t => t.id === 'bd-agent1-2')).toBe(false);
    });

    it('should return empty array for agent with no tasks', async () => {
      const tasks = await adapter.getTasksByAgent('agent-none');
      expect(tasks).toHaveLength(0);
    });
  });

  describe('buildTaskGraph', () => {
    it('should build graph with edges', async () => {
      await adapter.createTask(createTask({ id: 'bd-root', dependencies: [] }));
      await adapter.createTask(createTask({
        id: 'bd-child1',
        dependencies: ['bd-root'],
      }));
      await adapter.createTask(createTask({
        id: 'bd-child2',
        dependencies: ['bd-root'],
      }));
      await adapter.createTask(createTask({
        id: 'bd-grandchild',
        dependencies: ['bd-child1', 'bd-child2'],
      }));

      const graph = await adapter.buildTaskGraph();

      expect(graph.tasks.size).toBe(4);
      expect(graph.edges.get('bd-child1')?.has('bd-root')).toBe(true);
      expect(graph.edges.get('bd-grandchild')?.has('bd-child1')).toBe(true);
      expect(graph.edges.get('bd-grandchild')?.has('bd-child2')).toBe(true);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await adapter.createTask(createTask({ id: 'bd-s1', status: 'pending' }));
      await adapter.createTask(createTask({ id: 'bd-s2', status: 'completed', actualMinutes: 30 }));
      await adapter.createTask(createTask({ id: 'bd-s3', status: 'completed', actualMinutes: 60 }));
      await adapter.createTask(createTask({ id: 'bd-s4', status: 'failed' }));
    });

    it('should return correct total', async () => {
      const stats = await adapter.getStats();
      expect(stats.total).toBe(4);
    });

    it('should count by status', async () => {
      const stats = await adapter.getStats();
      expect(stats.byStatus.pending).toBe(1);
      expect(stats.byStatus.completed).toBe(2);
      expect(stats.byStatus.failed).toBe(1);
    });

    it('should calculate average completion time', async () => {
      const stats = await adapter.getExtendedStats();
      expect(stats.avgCompletionTime).toBe(45); // (30 + 60) / 2
    });
  });
});
