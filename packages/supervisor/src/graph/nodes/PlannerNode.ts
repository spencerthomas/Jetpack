import { Logger, generateTaskId, AgentSkill, TaskStatus } from '@jetpack/shared';
import { BeadsAdapter } from '@jetpack/beads-adapter';
import { LLMProvider } from '../../llm';
import {
  PLANNER_SYSTEM_PROMPT,
  PLANNER_USER_PROMPT,
  PlannerOutputSchema,
  FlatPlannerOutputSchema,
} from '../../prompts/planner';
import { SupervisorState, PlannedTask, PlanItemType } from '../state';

export interface PlannerNodeConfig {
  llm: LLMProvider;
  beads: BeadsAdapter;
  /** Use flat planning (legacy) instead of hierarchical */
  useFlatPlanning?: boolean;
}

/**
 * Flatten hierarchical planner output into a list of PlannedTasks
 * Preserves type information and parent relationships
 *
 * Note: We use 'any' for the output type because Zod schemas with defaults
 * produce types where defaulted fields appear as optional in the input but
 * required in the output, causing type mismatches. The actual runtime values
 * will always have the defaults applied.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenHierarchicalOutput(output: any): PlannedTask[] {
  const plannedTasks: PlannedTask[] = [];

  // Process epics
  for (const epic of output.epics || []) {
    // Add epic as non-executable item (organizational only)
    plannedTasks.push({
      title: epic.title,
      description: epic.description,
      requiredSkills: [], // Epics don't need skills
      estimatedMinutes: 0, // Epics are containers
      dependsOn: [],
      type: 'epic',
      executable: false,
    });

    // Process tasks within epic
    for (const task of epic.tasks) {
      plannedTasks.push({
        title: task.title,
        description: task.description,
        requiredSkills: task.requiredSkills,
        estimatedMinutes: task.estimatedMinutes,
        dependsOn: task.dependsOn || [],
        type: 'task',
        parentTitle: epic.title,
        executable: true,
      });

      // Process subtasks within task
      for (const subtask of task.subtasks || []) {
        plannedTasks.push({
          title: subtask.title,
          description: subtask.description,
          requiredSkills: subtask.requiredSkills,
          estimatedMinutes: subtask.estimatedMinutes,
          dependsOn: subtask.dependsOn || [],
          type: 'subtask',
          parentTitle: task.title,
          executable: true,
        });
      }
    }
  }

  // Process standalone tasks (not in any epic)
  for (const task of output.standaloneTask || []) {
    plannedTasks.push({
      title: task.title,
      description: task.description,
      requiredSkills: task.requiredSkills,
      estimatedMinutes: task.estimatedMinutes,
      dependsOn: task.dependsOn || [],
      type: 'leaf',
      executable: true,
    });

    // Process subtasks
    for (const subtask of task.subtasks || []) {
      plannedTasks.push({
        title: subtask.title,
        description: subtask.description,
        requiredSkills: subtask.requiredSkills,
        estimatedMinutes: subtask.estimatedMinutes,
        dependsOn: subtask.dependsOn || [],
        type: 'subtask',
        parentTitle: task.title,
        executable: true,
      });
    }
  }

  return plannedTasks;
}

/**
 * PlannerNode breaks down a high-level user request into specific tasks
 * and creates them in Beads with proper dependencies.
 *
 * Supports hierarchical planning (Epic > Task > Subtask):
 * - Epics are organizational groupings (not created as Beads tasks)
 * - Tasks and subtasks are created as Beads tasks
 */
export async function createPlannerNode(config: PlannerNodeConfig) {
  const logger = new Logger('PlannerNode');
  const { llm, beads, useFlatPlanning = false } = config;

  return async (state: SupervisorState): Promise<Partial<SupervisorState>> => {
    logger.info('Planning task breakdown for request:', state.userRequest);

    try {
      let plannedTasks: PlannedTask[];

      if (useFlatPlanning) {
        // Legacy flat planning
        const output = await llm.structuredOutput(
          [
            { role: 'system', content: PLANNER_SYSTEM_PROMPT },
            { role: 'user', content: PLANNER_USER_PROMPT(state.userRequest) },
          ],
          FlatPlannerOutputSchema,
          'task_breakdown'
        );
        plannedTasks = output.tasks.map(t => ({
          ...t,
          type: 'leaf' as PlanItemType,
          executable: true,
        }));
      } else {
        // Hierarchical planning (Epic > Task > Subtask)
        const output = await llm.structuredOutput(
          [
            { role: 'system', content: PLANNER_SYSTEM_PROMPT },
            { role: 'user', content: PLANNER_USER_PROMPT(state.userRequest) },
          ],
          PlannerOutputSchema,
          'hierarchical_task_breakdown'
        );
        plannedTasks = flattenHierarchicalOutput(output);
      }

      const epicCount = plannedTasks.filter(t => t.type === 'epic').length;
      const taskCount = plannedTasks.filter(t => t.type === 'task' || t.type === 'leaf').length;
      const subtaskCount = plannedTasks.filter(t => t.type === 'subtask').length;
      logger.info(`Planned: ${epicCount} epics, ${taskCount} tasks, ${subtaskCount} subtasks`);

      // Only create Beads tasks for executable items (skip epics)
      const executableTasks = plannedTasks.filter(t => t.executable !== false);

      // Build a map of task title -> generated ID for dependency resolution
      const titleToId = new Map<string, string>();
      for (const task of executableTasks) {
        titleToId.set(task.title, generateTaskId());
      }

      // Create tasks in Beads with proper dependencies
      const createdTasks = [];
      const taskStatuses: Record<string, TaskStatus> = {};

      for (const planned of executableTasks) {
        const taskId = titleToId.get(planned.title)!;

        // Resolve dependency titles to IDs
        const dependencies = planned.dependsOn
          .map(depTitle => titleToId.get(depTitle))
          .filter((id): id is string => id !== undefined);

        // Skills are now flexible strings (no enum validation needed)
        const requiredSkills = planned.requiredSkills as AgentSkill[];

        const task = await beads.createTask({
          id: taskId,
          title: planned.title,
          description: planned.description,
          status: dependencies.length === 0 ? 'ready' : 'pending',
          priority: 'medium',
          dependencies,
          blockers: [],
          requiredSkills,
          estimatedMinutes: planned.estimatedMinutes,
          tags: [
            'supervisor-generated',
            ...(planned.type ? [`type:${planned.type}`] : []),
            ...(planned.parentTitle ? [`parent:${planned.parentTitle}`] : []),
          ],
          retryCount: 0,
          maxRetries: 2,
          targetBranches: [],
        });

        createdTasks.push(task);
        taskStatuses[task.id] = task.status;
        logger.debug(`Created ${planned.type || 'task'}: ${task.id} - ${task.title}`);
      }

      logger.info(`Created ${createdTasks.length} executable tasks in Beads`);

      return {
        plannedTasks,
        createdTasks,
        taskStatuses,
      };
    } catch (error) {
      logger.error('Planner failed:', error);
      return {
        error: `Planning failed: ${(error as Error).message}`,
      };
    }
  };
}
