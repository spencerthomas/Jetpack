import { z } from 'zod';

export const ASSIGNER_SYSTEM_PROMPT = `You are a task assignment coordinator. Your job is to match development tasks with the most suitable agents based on their skills and availability.

Assignment Rules:
1. Match task required skills with agent skills
2. Prefer idle agents over busy ones
3. Distribute work evenly when possible
4. Consider task dependencies - don't assign blocked tasks
5. If no agent has the required skills, assign to the agent with the closest skill match`;

export const ASSIGNER_USER_PROMPT = (
  tasks: Array<{ id: string; title: string; requiredSkills: string[]; status: string }>,
  agents: Array<{ id: string; name: string; skills: string[]; status: string; currentTask?: string }>
) => `Assign these tasks to the available agents:

Tasks:
${tasks.map(t => `- ${t.id}: "${t.title}" (needs: ${t.requiredSkills.join(', ')}, status: ${t.status})`).join('\n')}

Agents:
${agents.map(a => `- ${a.id} (${a.name}): skills=[${a.skills.join(', ')}], status=${a.status}${a.currentTask ? `, working on ${a.currentTask}` : ''}`).join('\n')}

Only assign tasks that are ready (not blocked by dependencies). Return the best agent for each assignable task.`;

export const AssignerOutputSchema = z.object({
  assignments: z.array(
    z.object({
      taskId: z.string().describe('The task ID to assign'),
      agentId: z.string().describe('The agent ID to assign the task to'),
      reason: z.string().describe('Why this agent is the best match'),
    })
  ),
  unassignable: z.array(
    z.object({
      taskId: z.string().describe('Task ID that cannot be assigned'),
      reason: z.string().describe('Why the task cannot be assigned'),
    })
  ),
});

export type AssignerOutput = z.infer<typeof AssignerOutputSchema>;
