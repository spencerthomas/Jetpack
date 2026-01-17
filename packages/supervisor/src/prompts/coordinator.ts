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
1. **reassign** - Assign failed task to a different agent with better skills
2. **retry** - Retry tasks that failed due to transient errors (network, timing)
3. **decompose** - Break complex tasks into smaller subtasks (PREFERRED for complex failures)
4. **escalate** - Require human intervention for unresolvable issues
5. **skip** - Skip non-critical tasks that are blocking progress

Decomposition Guidelines (use 'decompose' when):
- Task description is vague or too broad
- Task requires multiple distinct skills that no single agent has
- Task timed out due to complexity, not transient issues
- Error suggests the task scope is too large
- Previous retry already failed

When decomposing, create 2-5 focused subtasks that:
- Have clear, specific descriptions
- Each require a single skill set
- Together accomplish the original task's goal
- Are ordered with appropriate dependencies`;

export interface ConflictContext {
  taskTitle?: string;
  taskDescription?: string;
  requiredSkills?: string[];
  retryCount?: number;
  errorMessage?: string;
}

export const COORDINATOR_USER_PROMPT = (
  conflicts: Conflict[],
  agents: Array<{ id: string; name: string; skills: string[]; status: string }>,
  taskStatuses: Record<string, string>,
  conflictContexts?: Record<string, ConflictContext>
) => `Resolve these conflicts:

Conflicts:
${conflicts.map(c => {
  const ctx = conflictContexts?.[c.id];
  let details = `- ${c.id}: ${c.type} - "${c.description}" (task: ${c.taskId}${c.agentId ? `, agent: ${c.agentId}` : ''})`;
  if (ctx) {
    if (ctx.taskTitle) details += `\n  Title: ${ctx.taskTitle}`;
    if (ctx.taskDescription) details += `\n  Description: ${ctx.taskDescription}`;
    if (ctx.requiredSkills?.length) details += `\n  Skills needed: ${ctx.requiredSkills.join(', ')}`;
    if (ctx.retryCount !== undefined) details += `\n  Retry count: ${ctx.retryCount}`;
    if (ctx.errorMessage) details += `\n  Error: ${ctx.errorMessage}`;
  }
  return details;
}).join('\n\n')}

Available Agents:
${agents.map(a => `- ${a.id} (${a.name}): skills=[${a.skills.join(', ')}], status=${a.status}`).join('\n')}

Current Task Statuses:
${Object.entries(taskStatuses).map(([id, status]) => `- ${id}: ${status}`).join('\n')}

Choose the best action for each conflict: reassign, retry, decompose, skip, or escalate.
Use 'decompose' for complex tasks that need to be broken into smaller subtasks.`;

/**
 * Subtask definition for decomposition
 */
export const SubtaskSchema = z.object({
  title: z.string().describe('Clear, specific title for the subtask'),
  description: z.string().describe('Detailed description of what this subtask should accomplish'),
  skills: z.array(z.string()).describe('Required skills for this subtask'),
  estimatedMinutes: z.number().optional().describe('Estimated time to complete'),
  dependsOnIndex: z.number().optional().describe('Index of another subtask this depends on (0-based)'),
});

export type Subtask = z.infer<typeof SubtaskSchema>;

export const CoordinatorOutputSchema = z.object({
  resolutions: z.array(
    z.object({
      conflictId: z.string().describe('The conflict ID being resolved'),
      action: z.enum(['reassign', 'retry', 'skip', 'escalate', 'decompose']).describe('Resolution action'),
      targetAgentId: z.string().optional().describe('Agent to reassign to (if reassigning)'),
      reason: z.string().describe('Explanation of the resolution'),
      subtasks: z.array(SubtaskSchema).optional().describe('Subtasks to create (required if action is decompose)'),
    })
  ),
});

export type CoordinatorOutput = z.infer<typeof CoordinatorOutputSchema>;
