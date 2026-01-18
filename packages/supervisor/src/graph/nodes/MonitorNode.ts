import { Logger, TaskStatus, RuntimeMode, RuntimeSettings } from '@jetpack-agent/shared';
import { BeadsAdapter } from '@jetpack-agent/beads-adapter';
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
  const { beads, pollIntervalMs } = config;

  return async (state: SupervisorState): Promise<Partial<SupervisorState>> => {
    logger.info(`Monitoring progress (iteration ${state.iteration})`);

    // Wait between iterations to give agents time to work
    // Skip delay on first iteration (iteration 0)
    if (state.iteration > 0 && pollIntervalMs > 0) {
      logger.debug(`Waiting ${pollIntervalMs}ms before checking progress...`);
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

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

/**
 * Determine if supervisor should continue running based on runtime mode
 * This is the primary continuation control for autonomous operation
 */
export function shouldContinue(
  state: SupervisorState,
  settings: Partial<RuntimeSettings> = {}
): { shouldContinue: boolean; reason?: string } {
  const mode: RuntimeMode = settings.mode ?? 'iteration-limit';
  const maxIterations = settings.maxIterations ?? 100;
  const logger = new Logger('MonitorNode');

  // First check universal stop conditions
  if (state.error) {
    return { shouldContinue: false, reason: `Error encountered: ${state.error}` };
  }

  // Check if all tasks complete (applies to most modes)
  const allComplete = isAllComplete(state);

  switch (mode) {
    case 'infinite':
      // Never stops unless there's an error or explicit stop
      // Even if all tasks complete, it will wait for new work
      logger.debug('Infinite mode: continuing...');
      return { shouldContinue: true };

    case 'idle-pause': {
      // Pause when no work available
      const hasPendingWork =
        state.createdTasks.some(t => {
          const status = state.taskStatuses[t.id];
          return status !== 'completed' && status !== 'failed';
        }) ||
        state.conflicts.some(c => !c.resolved);

      if (!hasPendingWork) {
        logger.info('Idle-pause mode: No pending work, pausing...');
        return { shouldContinue: false, reason: 'idle_pause' };
      }
      return { shouldContinue: true };
    }

    case 'objective-based': {
      // Check if objective has been marked as complete
      // The objective check itself should happen in a separate flow
      // (e.g., via LLM evaluation periodically)
      if (state.objectiveMet) {
        logger.info(`Objective-based mode: Objective achieved`);
        return { shouldContinue: false, reason: 'objective_complete' };
      }

      // Also check max iterations as a safety limit
      if (maxIterationsReached(state, maxIterations * 2)) {
        logger.warn(`Objective-based mode: Safety limit reached (${maxIterations * 2} iterations)`);
        return { shouldContinue: false, reason: 'safety_limit_reached' };
      }

      return { shouldContinue: true };
    }

    case 'iteration-limit':
    default: {
      // Original behavior: stop at max iterations or when all complete
      if (allComplete) {
        logger.info('Iteration-limit mode: All tasks complete');
        return { shouldContinue: false, reason: 'all_tasks_complete' };
      }

      if (maxIterationsReached(state, maxIterations)) {
        logger.info(`Iteration-limit mode: Max iterations reached (${maxIterations})`);
        return { shouldContinue: false, reason: 'max_iterations_reached' };
      }

      return { shouldContinue: true };
    }
  }
}

/**
 * Check if supervisor should enter idle state (for idle-pause mode)
 */
export function shouldEnterIdle(state: SupervisorState): boolean {
  // No tasks in progress or pending
  const activeTasks = Object.values(state.taskStatuses).filter(
    status => status === 'in_progress' || status === 'pending' || status === 'ready'
  );
  return activeTasks.length === 0 && state.createdTasks.length > 0;
}
