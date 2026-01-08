import * as fs from 'fs/promises';
import * as path from 'path';
import { simpleGit, SimpleGit } from 'simple-git';
import { Task, TaskStatus, TaskGraph, Logger } from '@jetpack/shared';

export interface BeadsAdapterConfig {
  beadsDir: string;
  autoCommit: boolean;
  gitEnabled: boolean;
}

export class BeadsAdapter {
  private git: SimpleGit;
  private logger: Logger;
  private tasksFile: string;
  private tasks: Map<string, Task> = new Map();

  constructor(private config: BeadsAdapterConfig) {
    this.logger = new Logger('BeadsAdapter');
    this.tasksFile = path.join(config.beadsDir, 'tasks.jsonl');
    this.git = simpleGit(path.dirname(config.beadsDir));
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Beads adapter');

    // Create .beads directory if it doesn't exist
    await fs.mkdir(this.config.beadsDir, { recursive: true });

    // Initialize git if enabled
    if (this.config.gitEnabled) {
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        await this.git.init();
        this.logger.info('Initialized git repository for beads');
      }
    }

    // Create tasks.jsonl if it doesn't exist
    try {
      await fs.access(this.tasksFile);
    } catch {
      await fs.writeFile(this.tasksFile, '');
    }

    // Load existing tasks
    await this.loadTasks();
  }

  private async loadTasks(): Promise<void> {
    try {
      const content = await fs.readFile(this.tasksFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      for (const line of lines) {
        const task = JSON.parse(line) as Task;
        // Convert date strings back to Date objects
        task.createdAt = new Date(task.createdAt);
        task.updatedAt = new Date(task.updatedAt);
        if (task.completedAt) {
          task.completedAt = new Date(task.completedAt);
        }
        this.tasks.set(task.id, task);
      }

      this.logger.info(`Loaded ${this.tasks.size} tasks from beads`);
    } catch (error) {
      this.logger.error('Failed to load tasks:', error);
      throw error;
    }
  }

  private async saveTasks(): Promise<void> {
    try {
      const lines = Array.from(this.tasks.values())
        .map(task => JSON.stringify(task))
        .join('\n');

      await fs.writeFile(this.tasksFile, lines + '\n');

      if (this.config.autoCommit && this.config.gitEnabled) {
        await this.git.add('.beads/*');
        await this.git.commit(`Update tasks: ${new Date().toISOString()}`);
      }

      this.logger.debug(`Saved ${this.tasks.size} tasks to beads`);
    } catch (error) {
      this.logger.error('Failed to save tasks:', error);
      throw error;
    }
  }

  async createTask(task: Omit<Task, 'createdAt' | 'updatedAt'>): Promise<Task> {
    const now = new Date();
    const fullTask: Task = {
      ...task,
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(fullTask.id, fullTask);
    await this.saveTasks();

    this.logger.info(`Created task: ${fullTask.id} - ${fullTask.title}`);
    return fullTask;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    const task = this.tasks.get(id);
    if (!task) {
      this.logger.warn(`Task not found: ${id}`);
      return null;
    }

    const updatedTask: Task = {
      ...task,
      ...updates,
      id: task.id, // Ensure ID doesn't change
      createdAt: task.createdAt,
      updatedAt: new Date(),
    };

    this.tasks.set(id, updatedTask);
    await this.saveTasks();

    this.logger.info(`Updated task: ${id}`);
    return updatedTask;
  }

  async getTask(id: string): Promise<Task | null> {
    return this.tasks.get(id) || null;
  }

  async listTasks(filter?: { status?: TaskStatus; assignedAgent?: string }): Promise<Task[]> {
    let tasks = Array.from(this.tasks.values());

    if (filter?.status) {
      tasks = tasks.filter(t => t.status === filter.status);
    }

    if (filter?.assignedAgent) {
      tasks = tasks.filter(t => t.assignedAgent === filter.assignedAgent);
    }

    return tasks;
  }

  async deleteTask(id: string): Promise<boolean> {
    const deleted = this.tasks.delete(id);
    if (deleted) {
      await this.saveTasks();
      this.logger.info(`Deleted task: ${id}`);
    }
    return deleted;
  }

  async getReadyTasks(): Promise<Task[]> {
    const tasks = Array.from(this.tasks.values());
    const readyTasks: Task[] = [];

    for (const task of tasks) {
      if (task.status === 'pending' || task.status === 'ready') {
        // Check if all dependencies are completed
        const allDepsCompleted = task.dependencies.every(depId => {
          const dep = this.tasks.get(depId);
          return dep && dep.status === 'completed';
        });

        if (allDepsCompleted && task.blockers.length === 0) {
          if (task.status === 'pending') {
            // Auto-update to ready
            await this.updateTask(task.id, { status: 'ready' });
            readyTasks.push({ ...task, status: 'ready' });
          } else {
            readyTasks.push(task);
          }
        }
      }
    }

    return readyTasks;
  }

  async buildTaskGraph(): Promise<TaskGraph> {
    const edges = new Map<string, Set<string>>();

    for (const task of this.tasks.values()) {
      if (!edges.has(task.id)) {
        edges.set(task.id, new Set());
      }
      for (const depId of task.dependencies) {
        edges.get(task.id)!.add(depId);
      }
    }

    return {
      tasks: new Map(this.tasks),
      edges,
    };
  }

  async claimTask(taskId: string, agentId: string): Promise<Task | null> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    if (task.status !== 'ready' && task.status !== 'pending') {
      this.logger.warn(`Task ${taskId} is not ready to be claimed (status: ${task.status})`);
      return null;
    }

    return this.updateTask(taskId, {
      status: 'claimed',
      assignedAgent: agentId,
    });
  }

  async getTasksByAgent(agentId: string): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter(
      t => t.assignedAgent === agentId && t.status !== 'completed' && t.status !== 'failed'
    );
  }

  async getStats(): Promise<{
    total: number;
    byStatus: Record<TaskStatus, number>;
    avgCompletionTime: number;
  }> {
    const tasks = Array.from(this.tasks.values());
    const byStatus: Record<string, number> = {};

    for (const status of ['pending', 'ready', 'claimed', 'in_progress', 'blocked', 'completed', 'failed'] as TaskStatus[]) {
      byStatus[status] = 0;
    }

    let totalCompletionTime = 0;
    let completedCount = 0;

    for (const task of tasks) {
      byStatus[task.status] = (byStatus[task.status] || 0) + 1;

      if (task.status === 'completed' && task.actualMinutes) {
        totalCompletionTime += task.actualMinutes;
        completedCount++;
      }
    }

    return {
      total: tasks.length,
      byStatus: byStatus as Record<TaskStatus, number>,
      avgCompletionTime: completedCount > 0 ? totalCompletionTime / completedCount : 0,
    };
  }
}
