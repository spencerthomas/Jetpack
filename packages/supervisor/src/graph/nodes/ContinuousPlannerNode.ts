import { Logger, generateTaskId, AgentSkill, Task, TaskStatus } from '@jetpack/shared';
import { BeadsAdapter } from '@jetpack/beads-adapter';
import { CASSAdapter } from '@jetpack/cass-adapter';
import { LLMProvider } from '../../llm';
import {
  CONTINUOUS_PLANNER_SYSTEM_PROMPT,
  CONTINUOUS_PLANNER_USER_PROMPT,
  ContinuousPlannerOutputSchema,
} from '../../prompts/continuousPlanner';
import { SupervisorState, Objective, PlannedTask } from '../state';

export interface ContinuousPlannerNodeConfig {
  llm: LLMProvider;
  beads: BeadsAdapter;
  cass?: CASSAdapter;
}

/**
 * ContinuousPlannerNode generates the next batch of tasks for the current
 * milestone, taking into account completed work to avoid duplication.
 */
export async function createContinuousPlannerNode(config: ContinuousPlannerNodeConfig) {
  const logger = new Logger('ContinuousPlannerNode');
  const { llm, beads, cass } = config;

  return async (state: SupervisorState): Promise<Partial<SupervisorState>> => {
    // Skip if not in continuous mode or no objective
    if (!state.continuousMode || !state.objective) {
      logger.debug('Skipping: not in continuous mode or no objective');
      return {};
    }

    const objective = state.objective;
    const currentMilestone = objective.milestones[objective.currentMilestoneIndex];

    if (!currentMilestone || currentMilestone.status === 'completed') {
      logger.debug('Skipping: no current milestone or already completed');
      return {};
    }

    // Check if we need to generate tasks
    const thresholds = state.queueThresholds;
    if (state.pendingTaskCount >= thresholds.lowWatermark) {
      logger.debug(`Skipping: queue has ${state.pendingTaskCount} tasks (above low watermark)`);
      return {};
    }

    logger.info(`Generating tasks for milestone: ${currentMilestone.title}`);

    try {
      // Get completed tasks for context
      const allTasks = await beads.listTasks();
      const milestoneTasks = allTasks.filter(t =>
        currentMilestone.taskIds.includes(t.id)
      );
      const completedTasks = milestoneTasks.filter(t => t.status === 'completed');
      const completedSummaries = completedTasks.map(t => `${t.title}: ${t.description}`);

      // Calculate how many tasks to generate
      const targetCount = Math.min(
        thresholds.highWatermark - state.pendingTaskCount,
        currentMilestone.estimatedTasks - milestoneTasks.length,
        8 // Never generate more than 8 at once
      );

      if (targetCount <= 0) {
        logger.debug('No tasks to generate (target count <= 0)');
        return {};
      }

      // Optionally get relevant memories from CASS using semantic search
      let contextFromMemory = '';
      if (cass) {
        try {
          const queryText = `${objective.title} ${currentMilestone.title}`;
          const memories = await cass.semanticSearchByQuery(queryText, 5);
          if (memories.length > 0) {
            contextFromMemory = memories.map(m => m.content).join('\n');
          }
        } catch (err) {
          logger.warn('Failed to retrieve memories:', err);
        }
      }

      // Generate new tasks using LLM
      const output = await llm.structuredOutput(
        [
          { role: 'system', content: CONTINUOUS_PLANNER_SYSTEM_PROMPT + (contextFromMemory ? `\n\nRelevant context:\n${contextFromMemory}` : '') },
          {
            role: 'user',
            content: CONTINUOUS_PLANNER_USER_PROMPT({
              objectiveTitle: objective.title,
              milestoneTitle: currentMilestone.title,
              completionCriteria: currentMilestone.completionCriteria,
              completedTaskSummaries: completedSummaries,
              targetTaskCount: targetCount,
            }),
          },
        ],
        ContinuousPlannerOutputSchema,
        'continuous_plan'
      );

      logger.info(`Generated ${output.tasks.length} new tasks. Reasoning: ${output.reasoning}`);

      // Build title -> ID map for dependencies
      const titleToId = new Map<string, string>();
      for (const task of output.tasks) {
        titleToId.set(task.title, generateTaskId());
      }

      // Create tasks in Beads
      const createdTasks: Task[] = [];
      const taskStatuses: Record<string, TaskStatus> = {};
      const plannedTasks: PlannedTask[] = [];

      for (const planned of output.tasks) {
        const taskId = titleToId.get(planned.title)!;

        // Resolve dependencies within this batch
        const dependencies = planned.dependsOn
          .map(depTitle => titleToId.get(depTitle))
          .filter((id): id is string => id !== undefined);

        // Map skill strings to valid AgentSkill values
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
          tags: ['supervisor-generated', `milestone-${objective.currentMilestoneIndex}`],
          retryCount: 0,
          maxRetries: 2,
          targetBranches: [],
        });

        createdTasks.push(task);
        taskStatuses[task.id] = task.status;

        plannedTasks.push({
          title: planned.title,
          description: planned.description,
          requiredSkills: planned.requiredSkills,
          estimatedMinutes: planned.estimatedMinutes,
          dependsOn: planned.dependsOn,
        });

        logger.debug(`Created task: ${task.id} - ${task.title}`);
      }

      // Update milestone with new task IDs
      const updatedMilestone = {
        ...currentMilestone,
        taskIds: [...currentMilestone.taskIds, ...createdTasks.map(t => t.id)],
      };

      const updatedMilestones = [...objective.milestones];
      updatedMilestones[objective.currentMilestoneIndex] = updatedMilestone;

      const updatedObjective: Objective = {
        ...objective,
        milestones: updatedMilestones,
        generationRound: objective.generationRound + 1,
        updatedAt: new Date(),
      };

      logger.info(`Created ${createdTasks.length} tasks for milestone "${currentMilestone.title}"`);

      return {
        objective: updatedObjective,
        plannedTasks: [...state.plannedTasks, ...plannedTasks],
        createdTasks: [...state.createdTasks, ...createdTasks],
        taskStatuses: { ...state.taskStatuses, ...taskStatuses },
        lastGenerationTime: new Date(),
        pendingTaskCount: state.pendingTaskCount + createdTasks.length,
      };
    } catch (error) {
      logger.error('Continuous planning failed:', error);
      return {
        error: `Continuous planning failed: ${(error as Error).message}`,
      };
    }
  };
}
