import { Logger, generateTaskId, AgentSkill, TaskStatus } from '@jetpack/shared';
import { BeadsAdapter } from '@jetpack/beads-adapter';
import { LLMProvider } from '../../llm';
import { PLANNER_SYSTEM_PROMPT, PLANNER_USER_PROMPT, PlannerOutputSchema } from '../../prompts/planner';
import { SupervisorState, PlannedTask } from '../state';

export interface PlannerNodeConfig {
  llm: LLMProvider;
  beads: BeadsAdapter;
}

/**
 * PlannerNode breaks down a high-level user request into specific tasks
 * and creates them in Beads with proper dependencies.
 */
export async function createPlannerNode(config: PlannerNodeConfig) {
  const logger = new Logger('PlannerNode');
  const { llm, beads } = config;

  return async (state: SupervisorState): Promise<Partial<SupervisorState>> => {
    logger.info('Planning task breakdown for request:', state.userRequest);

    try {
      // Use LLM to break down the request
      const output = await llm.structuredOutput(
        [
          { role: 'system', content: PLANNER_SYSTEM_PROMPT },
          { role: 'user', content: PLANNER_USER_PROMPT(state.userRequest) },
        ],
        PlannerOutputSchema,
        'task_breakdown'
      );

      const plannedTasks: PlannedTask[] = output.tasks;
      logger.info(`Planned ${plannedTasks.length} tasks`);

      // Build a map of task title -> generated ID for dependency resolution
      const titleToId = new Map<string, string>();
      for (const task of plannedTasks) {
        titleToId.set(task.title, generateTaskId());
      }

      // Create tasks in Beads with proper dependencies
      const createdTasks = [];
      const taskStatuses: Record<string, TaskStatus> = {};

      for (const planned of plannedTasks) {
        const taskId = titleToId.get(planned.title)!;

        // Resolve dependency titles to IDs
        const dependencies = planned.dependsOn
          .map(depTitle => titleToId.get(depTitle))
          .filter((id): id is string => id !== undefined);

        // Map skill strings to AgentSkill enum values
        const validSkills = ['typescript', 'python', 'rust', 'go', 'java', 'react', 'vue', 'backend', 'frontend', 'devops', 'database', 'testing', 'documentation'];
        const requiredSkills = planned.requiredSkills.filter(
          s => validSkills.includes(s.toLowerCase())
        ) as AgentSkill[];

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
          tags: ['supervisor-generated'],
        });

        createdTasks.push(task);
        taskStatuses[task.id] = task.status;
        logger.debug(`Created task: ${task.id} - ${task.title}`);
      }

      logger.info(`Created ${createdTasks.length} tasks in Beads`);

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
