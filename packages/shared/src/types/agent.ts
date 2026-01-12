import { z } from 'zod';

export const AgentStatusSchema = z.enum(['idle', 'busy', 'error', 'offline']);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentSkillSchema = z.enum([
  // Languages
  'typescript',
  'python',
  'rust',
  'go',
  'java',
  // Frameworks
  'react',
  'vue',
  // Domains
  'backend',
  'frontend',
  'devops',
  'database',
  'testing',
  'documentation',
  // Additional skills
  'sql',
  'data',
  'ml',
  'api',
  'security',
  'mobile',
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
