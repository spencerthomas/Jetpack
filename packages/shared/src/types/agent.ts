import { z } from 'zod';

export const AgentStatusSchema = z.enum(['idle', 'busy', 'error', 'offline']);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentSkillSchema = z.enum([
  'typescript',
  'python',
  'rust',
  'go',
  'java',
  'react',
  'vue',
  'backend',
  'frontend',
  'devops',
  'database',
  'testing',
  'documentation',
]);
export type AgentSkill = z.infer<typeof AgentSkillSchema>;

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: AgentStatusSchema,
  skills: z.array(AgentSkillSchema),
  currentTask: z.string().optional(),
  tmuxSession: z.string().optional(),
  createdAt: z.date(),
  lastActive: z.date(),
});

export type Agent = z.infer<typeof AgentSchema>;
