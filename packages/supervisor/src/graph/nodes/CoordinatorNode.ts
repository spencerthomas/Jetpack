import { Logger } from '@jetpack/shared';
import { BeadsAdapter } from '@jetpack/beads-adapter';
import { MCPMailAdapter } from '@jetpack/mcp-mail-adapter';
import { LLMProvider } from '../../llm';
import { COORDINATOR_SYSTEM_PROMPT, COORDINATOR_USER_PROMPT, CoordinatorOutputSchema } from '../../prompts/coordinator';
import { SupervisorState, Conflict, Reassignment } from '../state';

export interface CoordinatorNodeConfig {
  llm: LLMProvider;
  beads: BeadsAdapter;
  getAgentMail: (agentId: string) => MCPMailAdapter | undefined;
}

/**
 * CoordinatorNode resolves conflicts and handles failures
 */
export async function createCoordinatorNode(config: CoordinatorNodeConfig) {
  const logger = new Logger('CoordinatorNode');
  const { llm, beads, getAgentMail } = config;

  return async (state: SupervisorState): Promise<Partial<SupervisorState>> => {
    const unresolvedConflicts = state.conflicts.filter(c => !c.resolved);

    if (unresolvedConflicts.length === 0) {
      logger.info('No conflicts to resolve');
      return {};
    }

    logger.info(`Resolving ${unresolvedConflicts.length} conflicts`);

    try {
      // Prepare data for LLM
      const agentData = state.agents.map(a => ({
        id: a.id,
        name: a.name,
        skills: a.skills,
        status: a.status,
      }));

      const output = await llm.structuredOutput(
        [
          { role: 'system', content: COORDINATOR_SYSTEM_PROMPT },
          { role: 'user', content: COORDINATOR_USER_PROMPT(unresolvedConflicts, agentData, state.taskStatuses) },
        ],
        CoordinatorOutputSchema,
        'conflict_resolution'
      );

      const resolvedConflicts: Conflict[] = [];
      const reassignments: Reassignment[] = [];
      const newAssignments: Record<string, string> = {};

      for (const resolution of output.resolutions) {
        const conflict = unresolvedConflicts.find(c => c.id === resolution.conflictId);
        if (!conflict) continue;

        logger.info(`Resolving ${conflict.id}: ${resolution.action} - ${resolution.reason}`);

        switch (resolution.action) {
          case 'reassign':
            if (resolution.targetAgentId) {
              // Update task assignment
              await beads.updateTask(conflict.taskId, {
                status: 'ready',
                assignedAgent: undefined,
              });

              // Track reassignment
              reassignments.push({
                taskId: conflict.taskId,
                fromAgentId: conflict.agentId,
                toAgentId: resolution.targetAgentId,
                reason: resolution.reason,
                timestamp: new Date(),
              });

              // Notify new agent
              const mail = getAgentMail(resolution.targetAgentId);
              if (mail) {
                const task = await beads.getTask(conflict.taskId);
                if (task) {
                  await mail.publish({
                    id: '',
                    type: 'task.assigned',
                    from: 'supervisor',
                    to: resolution.targetAgentId,
                    payload: {
                      taskId: conflict.taskId,
                      title: task.title,
                      description: task.description,
                      requiredSkills: task.requiredSkills,
                      reassigned: true,
                    },
                    timestamp: new Date(),
                  });
                }
              }
            }
            break;

          case 'retry':
            // Reset task to ready state for retry
            await beads.updateTask(conflict.taskId, {
              status: 'ready',
            });
            break;

          case 'skip':
            // Mark task as failed/skipped and unblock dependents
            await beads.updateTask(conflict.taskId, {
              status: 'failed',
              metadata: { skipped: true, reason: resolution.reason },
            });
            break;

          case 'escalate':
            // Log escalation - in real system, would notify humans
            logger.warn(`ESCALATION REQUIRED: ${conflict.taskId} - ${resolution.reason}`);
            break;
        }

        // Mark conflict as resolved
        resolvedConflicts.push({
          ...conflict,
          resolved: true,
          resolution: `${resolution.action}: ${resolution.reason}`,
        });
      }

      // Merge resolved conflicts with existing ones
      const updatedConflicts = state.conflicts.map(c => {
        const resolved = resolvedConflicts.find(r => r.id === c.id);
        return resolved || c;
      });

      return {
        conflicts: updatedConflicts,
        reassignments: reassignments.length > 0 ? reassignments : undefined,
        assignments: Object.keys(newAssignments).length > 0 ? newAssignments : undefined,
      };
    } catch (error) {
      logger.error('Coordination failed:', error);
      return {
        error: `Coordination failed: ${(error as Error).message}`,
      };
    }
  };
}
