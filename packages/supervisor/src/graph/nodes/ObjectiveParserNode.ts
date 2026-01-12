import { Logger } from '@jetpack/shared';
import { LLMProvider } from '../../llm';
import {
  OBJECTIVE_PARSER_SYSTEM_PROMPT,
  OBJECTIVE_PARSER_USER_PROMPT,
  ObjectiveParserOutputSchema,
} from '../../prompts/objectiveParser';
import { SupervisorState, Objective, Milestone, MilestoneStatus } from '../state';

export interface ObjectiveParserNodeConfig {
  llm: LLMProvider;
}

/**
 * ObjectiveParserNode converts a high-level user request into a structured
 * Objective with Milestones for continuous task generation.
 */
export async function createObjectiveParserNode(config: ObjectiveParserNodeConfig) {
  const logger = new Logger('ObjectiveParserNode');
  const { llm } = config;

  return async (state: SupervisorState): Promise<Partial<SupervisorState>> => {
    // Skip if not in continuous mode or already have an objective
    if (!state.continuousMode || state.objective) {
      logger.debug('Skipping: not in continuous mode or objective exists');
      return {};
    }

    logger.info('Parsing objective from user request:', state.userRequest);

    try {
      const output = await llm.structuredOutput(
        [
          { role: 'system', content: OBJECTIVE_PARSER_SYSTEM_PROMPT },
          { role: 'user', content: OBJECTIVE_PARSER_USER_PROMPT(state.userRequest) },
        ],
        ObjectiveParserOutputSchema,
        'objective_parse'
      );

      const now = new Date();

      // Create milestones with proper structure
      const milestones: Milestone[] = output.milestones.map((m, index) => ({
        id: `milestone-${Date.now()}-${index}`,
        title: m.title,
        completionCriteria: m.completionCriteria,
        estimatedTasks: m.estimatedTasks,
        taskIds: [],
        status: index === 0 ? 'in_progress' : 'pending' as MilestoneStatus,
      }));

      // Create the objective
      const objective: Objective = {
        id: `obj-${Date.now()}`,
        title: output.title,
        userRequest: state.userRequest,
        status: 'active',
        milestones,
        currentMilestoneIndex: 0,
        progressPercent: 0,
        generationRound: 0,
        createdAt: now,
        updatedAt: now,
      };

      logger.info(`Created objective "${objective.title}" with ${milestones.length} milestones`);
      milestones.forEach((m, i) => {
        logger.debug(`  Milestone ${i + 1}: ${m.title} (${m.estimatedTasks} tasks, ${m.completionCriteria.length} criteria)`);
      });

      return {
        objective,
      };
    } catch (error) {
      logger.error('Failed to parse objective:', error);
      return {
        error: `Objective parsing failed: ${(error as Error).message}`,
      };
    }
  };
}
