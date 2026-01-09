import { Logger, TaskStatus } from '@jetpack/shared';
import { BeadsAdapter } from '@jetpack/beads-adapter';
import { SupervisorState, Conflict } from '../state';

export interface MonitorNodeConfig {
  beads: BeadsAdapter;
  pollIntervalMs: number;
}

/**
 * MonitorNode tracks task progress and detects issues
 */
export async function createMonitorNode(config: MonitorNodeConfig) {
  const logger = new Logger('MonitorNode');
  const { beads } = config;

  return async (state: SupervisorState): Promise<Partial<SupervisorState>> => {
    logger.info(`Monitoring progress (iteration ${state.iteration})`);

    try {
      // Get current status of all created tasks
      const taskStatuses: Record<string, TaskStatus> = {};
      const completedTaskIds: string[] = [];
      const failedTaskIds: string[] = [];
      const conflicts: Conflict[] = [];

      for (const task of state.createdTasks) {
        const currentTask = await beads.getTask(task.id);
        if (!currentTask) {
          logger.warn(`Task ${task.id} not found`);
          continue;
        }

        taskStatuses[task.id] = currentTask.status;

        if (currentTask.status === 'completed') {
          completedTaskIds.push(task.id);
        } else if (currentTask.status === 'failed') {
          failedTaskIds.push(task.id);

          // Create conflict for failed task
          if (!state.conflicts.some(c => c.taskId === task.id && !c.resolved)) {
            conflicts.push({
              id: `conflict-${task.id}-${Date.now()}`,
              type: 'task_failed',
              taskId: task.id,
              agentId: currentTask.assignedAgent,
              description: `Task "${currentTask.title}" failed`,
              createdAt: new Date(),
              resolved: false,
            });
          }
        } else if (currentTask.status === 'blocked') {
          // Check if blocked due to dependency issues
          const hasUncompletedDeps = currentTask.dependencies.some(depId => {
            const depStatus = taskStatuses[depId];
            return depStatus && depStatus !== 'completed';
          });

          if (!hasUncompletedDeps && !state.conflicts.some(c => c.taskId === task.id && !c.resolved)) {
            conflicts.push({
              id: `conflict-${task.id}-${Date.now()}`,
              type: 'dependency_blocked',
              taskId: task.id,
              description: `Task "${currentTask.title}" is blocked but dependencies are complete`,
              createdAt: new Date(),
              resolved: false,
            });
          }
        }
      }

      // Check for stale assignments (agent went offline)
      for (const [taskId, agentId] of Object.entries(state.assignments)) {
        const agent = state.agents.find(a => a.id === agentId);
        const taskStatus = taskStatuses[taskId];

        if (agent?.status === 'offline' && taskStatus === 'in_progress') {
          if (!state.conflicts.some(c => c.taskId === taskId && c.type === 'agent_error' && !c.resolved)) {
            conflicts.push({
              id: `conflict-${taskId}-agent-${Date.now()}`,
              type: 'agent_error',
              taskId,
              agentId,
              description: `Agent ${agent.name} went offline while working on task`,
              createdAt: new Date(),
              resolved: false,
            });
          }
        }
      }

      // Check for newly ready tasks (dependencies completed)
      const readyTasks = await beads.getReadyTasks();
      for (const task of readyTasks) {
        if (taskStatuses[task.id] === 'pending') {
          taskStatuses[task.id] = 'ready';
        }
      }

      const totalTasks = state.createdTasks.length;
      const completedCount = completedTaskIds.length;
      const failedCount = failedTaskIds.length;

      logger.info(`Progress: ${completedCount}/${totalTasks} completed, ${failedCount} failed`);

      if (conflicts.length > 0) {
        logger.warn(`Detected ${conflicts.length} new conflicts`);
      }

      return {
        taskStatuses,
        completedTaskIds: completedTaskIds.length > 0 ? completedTaskIds : undefined,
        failedTaskIds: failedTaskIds.length > 0 ? failedTaskIds : undefined,
        conflicts: conflicts.length > 0 ? conflicts : undefined,
        iteration: state.iteration + 1,
      };
    } catch (error) {
      logger.error('Monitoring failed:', error);
      return {
        error: `Monitoring failed: ${(error as Error).message}`,
        iteration: state.iteration + 1,
      };
    }
  };
}

/**
 * Check if all tasks are complete (used for graph routing)
 */
export function isAllComplete(state: SupervisorState): boolean {
  const totalTasks = state.createdTasks.length;
  const completedCount = state.completedTaskIds.length;
  return totalTasks > 0 && completedCount >= totalTasks;
}

/**
 * Check if there are unresolved conflicts (used for graph routing)
 */
export function hasUnresolvedConflicts(state: SupervisorState): boolean {
  return state.conflicts.some(c => !c.resolved);
}

/**
 * Check if max iterations reached
 */
export function maxIterationsReached(state: SupervisorState, maxIterations: number): boolean {
  return state.iteration >= maxIterations;
}
