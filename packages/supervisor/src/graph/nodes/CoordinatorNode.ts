import { Logger, Task } from '@jetpack-agent/shared';
import { BeadsAdapter } from '@jetpack-agent/beads-adapter';
import { MCPMailAdapter } from '@jetpack-agent/mcp-mail-adapter';
import { LLMProvider } from '../../llm';
import {
  COORDINATOR_SYSTEM_PROMPT,
  COORDINATOR_USER_PROMPT,
  CoordinatorOutputSchema,
  ConflictContext,
} from '../../prompts/coordinator';
import { SupervisorState, Conflict, Reassignment } from '../state';
import { randomUUID } from 'crypto';

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

      // Build conflict context for better decision-making (Enhancement 8)
      const conflictContexts: Record<string, ConflictContext> = {};
      for (const conflict of unresolvedConflicts) {
        const task = await beads.getTask(conflict.taskId);
        if (task) {
          conflictContexts[conflict.id] = {
            taskTitle: task.title,
            taskDescription: task.description,
            requiredSkills: task.requiredSkills,
            retryCount: (task.metadata?.retryCount as number) ?? 0,
            errorMessage: conflict.description,
          };
        }
      }

      const output = await llm.structuredOutput(
        [
          { role: 'system', content: COORDINATOR_SYSTEM_PROMPT },
          { role: 'user', content: COORDINATOR_USER_PROMPT(unresolvedConflicts, agentData, state.taskStatuses, conflictContexts) },
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

          case 'decompose':
            // Decompose complex task into subtasks (Enhancement 8)
            if (resolution.subtasks && resolution.subtasks.length > 0) {
              logger.info(`Decomposing task ${conflict.taskId} into ${resolution.subtasks.length} subtasks`);

              // Mark original task as decomposed/failed
              await beads.updateTask(conflict.taskId, {
                status: 'failed',
                metadata: {
                  decomposed: true,
                  decomposedInto: [] as string[],
                  reason: resolution.reason,
                },
              });

              // Create subtasks with proper dependencies
              const subtaskIds: string[] = [];
              const originalTask = await beads.getTask(conflict.taskId);

              for (let i = 0; i < resolution.subtasks.length; i++) {
                const subtask = resolution.subtasks[i];
                const subtaskId = `bd-${randomUUID().slice(0, 8)}`;
                subtaskIds.push(subtaskId);

                // Build dependencies - include original task's dependencies and inter-subtask dependencies
                const dependencies: string[] = [];
                if (subtask.dependsOnIndex !== undefined && subtask.dependsOnIndex < i) {
                  dependencies.push(subtaskIds[subtask.dependsOnIndex]);
                }

                const newTask: Task = {
                  id: subtaskId,
                  title: subtask.title,
                  description: subtask.description,
                  status: 'pending',
                  priority: originalTask?.priority ?? 'medium',
                  requiredSkills: subtask.skills,
                  dependencies,
                  blockers: [],
                  tags: originalTask?.tags ?? [],
                  estimatedMinutes: subtask.estimatedMinutes,
                  retryCount: 0,
                  maxRetries: 2,
                  targetBranches: originalTask?.targetBranches ?? [],
                  metadata: {
                    parentTaskId: conflict.taskId,
                    subtaskIndex: i,
                  },
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };

                await beads.createTask(newTask);
                logger.debug(`Created subtask ${subtaskId}: ${subtask.title}`);
              }

              // Update original task with subtask references
              await beads.updateTask(conflict.taskId, {
                metadata: {
                  decomposed: true,
                  decomposedInto: subtaskIds,
                  reason: resolution.reason,
                },
              });

              // Broadcast subtask creation events
              for (const subtaskId of subtaskIds) {
                const task = await beads.getTask(subtaskId);
                if (task) {
                  // Notify all agents about new subtasks
                  for (const agent of state.agents) {
                    const mail = getAgentMail(agent.id);
                    if (mail) {
                      await mail.publish({
                        id: '',
                        type: 'task.created',
                        from: 'supervisor',
                        payload: {
                          taskId: subtaskId,
                          title: task.title,
                          description: task.description,
                          requiredSkills: task.requiredSkills,
                          fromDecomposition: true,
                          originalTaskId: conflict.taskId,
                        },
                        timestamp: new Date(),
                      });
                    }
                  }
                }
              }
            } else {
              logger.warn(`Decompose action for ${conflict.taskId} had no subtasks, falling back to retry`);
              await beads.updateTask(conflict.taskId, { status: 'ready' });
            }
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
