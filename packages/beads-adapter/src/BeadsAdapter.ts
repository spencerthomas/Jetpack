import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { simpleGit, SimpleGit } from 'simple-git';
import { Task, TaskStatus, TaskGraph, Logger } from '@jetpack-agent/shared';

export interface BeadsAdapterConfig {
  beadsDir: string;
  autoCommit: boolean;
  gitEnabled: boolean;
  watchForChanges?: boolean; // Enable file watching for external task creation (default: true)
}

export class BeadsAdapter {
  private git: SimpleGit;
  private logger: Logger;
  private tasksFile: string;
  private tasks: Map<string, Task> = new Map();
  private fileWatcher?: fsSync.FSWatcher;
  private lastFileSize: number = 0;
  private reloadDebounceTimer?: NodeJS.Timeout;

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

    // Start file watching if enabled (default: true)
    if (this.config.watchForChanges !== false) {
      this.startFileWatcher();
    }
  }

  /**
   * Start watching tasks.jsonl for external changes (e.g., from CLI)
   */
  private startFileWatcher(): void {
    try {
      // Get initial file size
      const stats = fsSync.statSync(this.tasksFile);
      this.lastFileSize = stats.size;

      this.fileWatcher = fsSync.watch(this.tasksFile, (eventType) => {
        if (eventType === 'change') {
          // Debounce reloads to avoid multiple reloads for rapid changes
          if (this.reloadDebounceTimer) {
            clearTimeout(this.reloadDebounceTimer);
          }
          this.reloadDebounceTimer = setTimeout(() => {
            this.checkAndReloadTasks().catch(err => {
              this.logger.error('Error reloading tasks:', err);
            });
          }, 100);
        }
      });

      this.logger.info('File watcher enabled for tasks.jsonl');
    } catch (error) {
      this.logger.warn('Could not start file watcher:', error);
    }
  }

  /**
   * Check if tasks file has grown and reload new tasks
   */
  private async checkAndReloadTasks(): Promise<void> {
    try {
      const stats = await fs.stat(this.tasksFile);

      // Only reload if file has grown (new tasks added)
      if (stats.size > this.lastFileSize) {
        this.logger.debug(`Tasks file grew from ${this.lastFileSize} to ${stats.size} bytes, reloading...`);
        const previousCount = this.tasks.size;
        await this.loadTasks();
        const newCount = this.tasks.size - previousCount;
        if (newCount > 0) {
          this.logger.info(`Detected ${newCount} new task(s) from external source`);
        }
      }

      this.lastFileSize = stats.size;
    } catch (error) {
      this.logger.debug('Error checking tasks file:', error);
    }
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
        try {
          await this.git.add(this.tasksFile);
          await this.git.commit(`Update tasks: ${new Date().toISOString()}`);
        } catch (gitError) {
          // Ignore git errors (e.g., nothing to commit)
          this.logger.debug('Git commit skipped:', gitError);
        }
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

  // ============================================================================
  // Smart Dependency Handling (Enhancement 5)
  // ============================================================================

  /**
   * Get tasks organized into parallel execution batches.
   * Tasks in the same batch have no dependencies on each other and can run simultaneously.
   *
   * @returns Array of batches, where each batch is an array of tasks that can run in parallel
   */
  async getParallelBatches(): Promise<Task[][]> {
    const tasks = Array.from(this.tasks.values());
    const batches: Task[][] = [];
    const processed = new Set<string>();
    const completed = new Set(
      tasks.filter(t => t.status === 'completed').map(t => t.id)
    );

    // Add completed tasks to processed so we skip them
    completed.forEach(id => processed.add(id));

    // Keep creating batches until all tasks are processed
    while (processed.size < tasks.length) {
      const batch: Task[] = [];

      for (const task of tasks) {
        if (processed.has(task.id)) continue;

        // Skip failed, in_progress, or claimed tasks
        if (task.status === 'failed' || task.status === 'in_progress' || task.status === 'claimed') {
          continue;
        }

        // Check if all dependencies are either completed or processed
        const allDepsReady = task.dependencies.every(
          depId => completed.has(depId) || processed.has(depId)
        );

        // Also check blockers
        if (allDepsReady && task.blockers.length === 0) {
          batch.push(task);
        }
      }

      if (batch.length === 0) {
        // No progress possible - might have circular deps or all remaining are blocked
        break;
      }

      batches.push(batch);
      batch.forEach(t => processed.add(t.id));
    }

    return batches;
  }

  /**
   * Analyze the dependency graph for insights
   * Helps identify potential bottlenecks and parallelization opportunities
   */
  async analyzeDependencyGraph(): Promise<{
    totalTasks: number;
    parallelBatches: number;
    maxParallelism: number;
    avgDependencies: number;
    bottlenecks: Array<{ taskId: string; dependentCount: number }>;
    isolatedTasks: string[];
    criticalPath: string[];
  }> {
    const tasks = Array.from(this.tasks.values());
    const batches = await this.getParallelBatches();

    // Count how many tasks depend on each task
    const dependentCount = new Map<string, number>();
    for (const task of tasks) {
      for (const depId of task.dependencies) {
        dependentCount.set(depId, (dependentCount.get(depId) || 0) + 1);
      }
    }

    // Find bottlenecks (tasks with many dependents)
    const bottlenecks = Array.from(dependentCount.entries())
      .filter(([, count]) => count >= 2)
      .map(([taskId, count]) => ({ taskId, dependentCount: count }))
      .sort((a, b) => b.dependentCount - a.dependentCount);

    // Find isolated tasks (no dependencies and no dependents)
    const isolatedTasks = tasks
      .filter(t =>
        t.dependencies.length === 0 && !dependentCount.has(t.id)
      )
      .map(t => t.id);

    // Calculate critical path (longest dependency chain)
    const criticalPath = this.findCriticalPath(tasks);

    // Calculate average dependencies per task
    const totalDeps = tasks.reduce((sum, t) => sum + t.dependencies.length, 0);
    const avgDeps = tasks.length > 0 ? totalDeps / tasks.length : 0;

    return {
      totalTasks: tasks.length,
      parallelBatches: batches.length,
      maxParallelism: Math.max(...batches.map(b => b.length), 0),
      avgDependencies: Math.round(avgDeps * 100) / 100,
      bottlenecks,
      isolatedTasks,
      criticalPath,
    };
  }

  /**
   * Find the critical path (longest dependency chain) in the task graph
   */
  private findCriticalPath(tasks: Task[]): string[] {
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const memo = new Map<string, string[]>();

    function longestPath(taskId: string): string[] {
      if (memo.has(taskId)) return memo.get(taskId)!;

      const task = taskMap.get(taskId);
      if (!task || task.dependencies.length === 0) {
        const path = [taskId];
        memo.set(taskId, path);
        return path;
      }

      let longest: string[] = [];
      for (const depId of task.dependencies) {
        const depPath = longestPath(depId);
        if (depPath.length > longest.length) {
          longest = depPath;
        }
      }

      const path = [...longest, taskId];
      memo.set(taskId, path);
      return path;
    }

    // Find the longest path from any task
    let criticalPath: string[] = [];
    for (const task of tasks) {
      const path = longestPath(task.id);
      if (path.length > criticalPath.length) {
        criticalPath = path;
      }
    }

    return criticalPath;
  }

  /**
   * Detect potential bottlenecks - tasks that many others are waiting on
   * Returns tasks sorted by how many other tasks depend on them
   */
  async detectBottlenecks(minDependents = 2): Promise<Array<{
    task: Task;
    dependentCount: number;
    waitingTasks: string[];
  }>> {
    const tasks = Array.from(this.tasks.values());
    const dependents = new Map<string, string[]>();

    for (const task of tasks) {
      for (const depId of task.dependencies) {
        if (!dependents.has(depId)) {
          dependents.set(depId, []);
        }
        dependents.get(depId)!.push(task.id);
      }
    }

    const bottlenecks = Array.from(dependents.entries())
      .filter(([, deps]) => deps.length >= minDependents)
      .map(([taskId, waitingTasks]) => ({
        task: this.tasks.get(taskId)!,
        dependentCount: waitingTasks.length,
        waitingTasks,
      }))
      .filter(b => b.task) // Only include tasks that exist
      .sort((a, b) => b.dependentCount - a.dependentCount);

    return bottlenecks;
  }

  /**
   * Get the next batch of tasks that can be started immediately
   * Returns tasks grouped by skill requirements for optimal agent assignment
   */
  async getNextBatchBySkills(): Promise<Map<string, Task[]>> {
    const readyTasks = await this.getReadyTasks();
    const bySkill = new Map<string, Task[]>();

    for (const task of readyTasks) {
      const primarySkill = task.requiredSkills[0] || 'general';
      if (!bySkill.has(primarySkill)) {
        bySkill.set(primarySkill, []);
      }
      bySkill.get(primarySkill)!.push(task);
    }

    return bySkill;
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = undefined;
      this.logger.debug('File watcher closed');
    }
    if (this.reloadDebounceTimer) {
      clearTimeout(this.reloadDebounceTimer);
      this.reloadDebounceTimer = undefined;
    }
  }
}
