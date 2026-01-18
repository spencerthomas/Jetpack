import { Logger } from '@jetpack-agent/shared';
import { BeadsAdapter } from '@jetpack-agent/beads-adapter';
import { MCPMailAdapter } from '@jetpack-agent/mcp-mail-adapter';
import { LLMProvider } from '../../llm';
import { ASSIGNER_SYSTEM_PROMPT, ASSIGNER_USER_PROMPT, AssignerOutputSchema } from '../../prompts/assigner';
import { SupervisorState, Reassignment } from '../state';

export interface AssignerNodeConfig {
  llm: LLMProvider;
  beads: BeadsAdapter;
  getAgentMail: (agentId: string) => MCPMailAdapter | undefined;
}

/**
 * AssignerNode matches tasks to agents based on skills and availability
 */
export async function createAssignerNode(config: AssignerNodeConfig) {
  const logger = new Logger('AssignerNode');
  const { llm, beads, getAgentMail } = config;

  return async (state: SupervisorState): Promise<Partial<SupervisorState>> => {
    logger.info('Assigning tasks to agents');

    if (state.agents.length === 0) {
      logger.warn('No agents available for assignment');
      return {};
    }

    try {
      // Get ready tasks that haven't been assigned yet
      const readyTasks = await beads.getReadyTasks();
      const unassignedTasks = readyTasks.filter(
        t => !state.assignments[t.id] || state.failedTaskIds.includes(t.id)
      );

      if (unassignedTasks.length === 0) {
        logger.info('No unassigned tasks to process');
        return {};
      }

      // Prepare data for LLM
      const taskData = unassignedTasks.map(t => ({
        id: t.id,
        title: t.title,
        requiredSkills: t.requiredSkills,
        status: t.status,
      }));

      const agentData = state.agents.map(a => ({
        id: a.id,
        name: a.name,
        skills: a.skills,
        status: a.status,
        currentTask: a.currentTask,
      }));

      // Use LLM to make assignments
      const output = await llm.structuredOutput(
        [
          { role: 'system', content: ASSIGNER_SYSTEM_PROMPT },
          { role: 'user', content: ASSIGNER_USER_PROMPT(taskData, agentData) },
        ],
        AssignerOutputSchema,
        'task_assignments'
      );

      const newAssignments: Record<string, string> = {};
      const reassignments: Reassignment[] = [];

      for (const assignment of output.assignments) {
        const task = unassignedTasks.find(t => t.id === assignment.taskId);
        if (!task) continue;

        const previousAgent = state.assignments[assignment.taskId];

        // Update task in Beads - just set assignedAgent, don't change status
        // The actual AgentController will change status to 'claimed' when it picks up the task
        // Setting to 'claimed' here would hide the task from getReadyTasks() and prevent agents from seeing it
        await beads.updateTask(assignment.taskId, {
          assignedAgent: assignment.agentId,
        });

        newAssignments[assignment.taskId] = assignment.agentId;

        // Track reassignment if applicable
        if (previousAgent && previousAgent !== assignment.agentId) {
          reassignments.push({
            taskId: assignment.taskId,
            fromAgentId: previousAgent,
            toAgentId: assignment.agentId,
            reason: assignment.reason,
            timestamp: new Date(),
          });
        }

        // Notify agent via MCP Mail
        const mail = getAgentMail(assignment.agentId);
        if (mail) {
          await mail.publish({
            id: '',
            type: 'task.assigned',
            from: 'supervisor',
            to: assignment.agentId,
            payload: {
              taskId: assignment.taskId,
              title: task.title,
              description: task.description,
              requiredSkills: task.requiredSkills,
            },
            timestamp: new Date(),
          });
        }

        logger.info(`Assigned ${assignment.taskId} to ${assignment.agentId}: ${assignment.reason}`);
      }

      // Log unassignable tasks
      for (const unassignable of output.unassignable) {
        logger.warn(`Cannot assign ${unassignable.taskId}: ${unassignable.reason}`);
      }

      return {
        assignments: newAssignments,
        reassignments: reassignments.length > 0 ? reassignments : undefined,
        // Don't update taskStatuses - leave as ready so agents can claim
        // The MonitorNode will pick up actual status changes from Beads
      };
    } catch (error) {
      logger.error('Assignment failed:', error);
      return {
        error: `Assignment failed: ${(error as Error).message}`,
      };
    }
  };
}
