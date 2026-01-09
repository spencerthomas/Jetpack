import { z } from 'zod';
import { Conflict } from '../graph/state';

export const COORDINATOR_SYSTEM_PROMPT = `You are a conflict resolution coordinator for a multi-agent development system. Your job is to resolve issues that arise during task execution.

Conflict Types:
1. task_failed - A task execution failed (agent error, bad code, etc.)
2. agent_error - An agent went offline or errored
3. dependency_blocked - A task is blocked waiting for another task
4. skill_mismatch - The assigned agent lacks required skills
5. timeout - A task took too long to complete

Resolution Strategies:
1. Reassign failed tasks to a different agent
2. Retry tasks that failed due to transient errors
3. Escalate unresolvable conflicts for human intervention
4. Adjust priorities for blocked tasks
5. Skip non-critical tasks if necessary`;

export const COORDINATOR_USER_PROMPT = (
  conflicts: Conflict[],
  agents: Array<{ id: string; name: string; skills: string[]; status: string }>,
  taskStatuses: Record<string, string>
) => `Resolve these conflicts:

Conflicts:
${conflicts.map(c => `- ${c.id}: ${c.type} - "${c.description}" (task: ${c.taskId}${c.agentId ? `, agent: ${c.agentId}` : ''})`).join('\n')}

Available Agents:
${agents.map(a => `- ${a.id} (${a.name}): skills=[${a.skills.join(', ')}], status=${a.status}`).join('\n')}

Current Task Statuses:
${Object.entries(taskStatuses).map(([id, status]) => `- ${id}: ${status}`).join('\n')}

Decide how to resolve each conflict: reassign, retry, skip, or escalate.`;

export const CoordinatorOutputSchema = z.object({
  resolutions: z.array(
    z.object({
      conflictId: z.string().describe('The conflict ID being resolved'),
      action: z.enum(['reassign', 'retry', 'skip', 'escalate']).describe('Resolution action'),
      targetAgentId: z.string().optional().describe('Agent to reassign to (if reassigning)'),
      reason: z.string().describe('Explanation of the resolution'),
    })
  ),
});

export type CoordinatorOutput = z.infer<typeof CoordinatorOutputSchema>;
