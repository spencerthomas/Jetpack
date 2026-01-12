import { Logger } from '@jetpack/shared';
import { BeadsAdapter } from '@jetpack/beads-adapter';
import { LLMProvider } from '../../llm';
import {
  PROGRESS_ANALYZER_SYSTEM_PROMPT,
  PROGRESS_ANALYZER_USER_PROMPT,
  ProgressAnalyzerOutputSchema,
} from '../../prompts/progressAnalyzer';
import { SupervisorState, Objective, MilestoneStatus } from '../state';

export interface ProgressAnalyzerNodeConfig {
  llm: LLMProvider;
  beads: BeadsAdapter;
}

/**
 * ProgressAnalyzerNode checks if the current milestone's completion criteria
 * have been satisfied by analyzing completed tasks.
 *
 * This implements hybrid completion detection:
 * 1. Task-based check: Are all milestone tasks done?
 * 2. LLM-judged check: Are completion criteria satisfied?
 */
export async function createProgressAnalyzerNode(config: ProgressAnalyzerNodeConfig) {
  const logger = new Logger('ProgressAnalyzerNode');
  const { llm, beads } = config;

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

    // Only analyze if there are tasks for this milestone
    if (currentMilestone.taskIds.length === 0) {
      logger.debug('Skipping: no tasks generated for this milestone yet');
      return {};
    }

    logger.info(`Analyzing progress for milestone: ${currentMilestone.title}`);

    try {
      // Get milestone tasks
      const allTasks = await beads.listTasks();
      const milestoneTasks = allTasks.filter(t =>
        currentMilestone.taskIds.includes(t.id)
      );

      // Task-based check: Are there still pending/in-progress tasks?
      const pendingTasks = milestoneTasks.filter(t =>
        t.status === 'pending' || t.status === 'ready' || t.status === 'in_progress' || t.status === 'claimed'
      );

      if (pendingTasks.length > 0) {
        logger.debug(`${pendingTasks.length} tasks still pending, skipping LLM analysis`);
        return {};
      }

      // All tasks done (completed or failed) - now do LLM analysis
      const completedTasks = milestoneTasks.filter(t => t.status === 'completed');
      const failedTasks = milestoneTasks.filter(t => t.status === 'failed');

      logger.info(`All tasks done: ${completedTasks.length} completed, ${failedTasks.length} failed`);

      // Use LLM to check criteria satisfaction
      const output = await llm.structuredOutput(
        [
          { role: 'system', content: PROGRESS_ANALYZER_SYSTEM_PROMPT },
          {
            role: 'user',
            content: PROGRESS_ANALYZER_USER_PROMPT({
              milestoneTitle: currentMilestone.title,
              completionCriteria: currentMilestone.completionCriteria,
              completedTasks: completedTasks.map(t => ({
                title: t.title,
                description: t.description || '',
              })),
              failedTasks: failedTasks.map(t => ({
                title: t.title,
                description: t.description || '',
              })),
            }),
          },
        ],
        ProgressAnalyzerOutputSchema,
        'progress_analysis'
      );

      // Build result for state
      const criteriaResults = output.criteriaAnalysis.map(c => c.satisfied);

      logger.info(`Milestone analysis: ${output.allCriteriaSatisfied ? 'COMPLETE' : 'INCOMPLETE'}`);
      logger.debug(`Criteria: ${criteriaResults.map((s, i) => `${i + 1}:${s ? '✓' : '✗'}`).join(', ')}`);

      // Update state based on analysis
      if (output.allCriteriaSatisfied) {
        // Milestone complete - advance to next
        return handleMilestoneComplete(state, objective, output.overallReasoning, logger);
      } else {
        // Milestone not complete - record check result
        return {
          milestoneCheckResult: {
            milestoneId: currentMilestone.id,
            criteriaSatisfied: criteriaResults,
            allSatisfied: false,
            reasoning: output.overallReasoning,
          },
        };
      }
    } catch (error) {
      logger.error('Progress analysis failed:', error);
      return {
        error: `Progress analysis failed: ${(error as Error).message}`,
      };
    }
  };
}

/**
 * Handle milestone completion - advance to next milestone or complete objective
 */
function handleMilestoneComplete(
  _state: SupervisorState,
  objective: Objective,
  reasoning: string,
  logger: Logger
): Partial<SupervisorState> {
  const currentIndex = objective.currentMilestoneIndex;
  const currentMilestone = objective.milestones[currentIndex];

  // Mark current milestone as completed
  const updatedMilestones = [...objective.milestones];
  updatedMilestones[currentIndex] = {
    ...currentMilestone,
    status: 'completed' as MilestoneStatus,
  };

  // Calculate progress
  const completedCount = updatedMilestones.filter(m => m.status === 'completed').length;
  const progressPercent = Math.round((completedCount / updatedMilestones.length) * 100);

  logger.info(`Milestone "${currentMilestone.title}" completed! Progress: ${progressPercent}%`);

  // Check if all milestones are done
  if (currentIndex >= objective.milestones.length - 1) {
    // Objective complete!
    logger.info(`🎉 Objective "${objective.title}" COMPLETE!`);

    const completedObjective: Objective = {
      ...objective,
      milestones: updatedMilestones,
      status: 'completed',
      progressPercent: 100,
      updatedAt: new Date(),
    };

    return {
      objective: completedObjective,
      milestoneCheckResult: {
        milestoneId: currentMilestone.id,
        criteriaSatisfied: currentMilestone.completionCriteria.map(() => true),
        allSatisfied: true,
        reasoning,
      },
    };
  }

  // Advance to next milestone
  const nextIndex = currentIndex + 1;
  updatedMilestones[nextIndex] = {
    ...updatedMilestones[nextIndex],
    status: 'in_progress' as MilestoneStatus,
  };

  logger.info(`Advancing to milestone ${nextIndex + 1}: "${updatedMilestones[nextIndex].title}"`);

  const updatedObjective: Objective = {
    ...objective,
    milestones: updatedMilestones,
    currentMilestoneIndex: nextIndex,
    progressPercent,
    updatedAt: new Date(),
  };

  return {
    objective: updatedObjective,
    milestoneCheckResult: {
      milestoneId: currentMilestone.id,
      criteriaSatisfied: currentMilestone.completionCriteria.map(() => true),
      allSatisfied: true,
      reasoning,
    },
  };
}

/**
 * Check if the objective is complete (used by graph routing)
 */
export function isObjectiveComplete(state: SupervisorState): boolean {
  return state.objective?.status === 'completed';
}
