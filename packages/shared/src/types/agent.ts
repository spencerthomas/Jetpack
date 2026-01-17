import { z } from 'zod';

export const AgentStatusSchema = z.enum(['idle', 'busy', 'error', 'offline']);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

/**
 * Legacy skill enum for backwards compatibility.
 * New code should use the SkillRegistry for validation instead of this enum.
 * @deprecated Use string[] with SkillRegistry validation
 */
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

/**
 * AgentSkill is now a flexible string type.
 * The SkillRegistry validates and manages skill definitions.
 * Legacy enum values are still supported for backwards compatibility.
 */
export type AgentSkill = string;

/**
 * Flexible skill schema that accepts any string.
 * Validation should be done via SkillRegistry.isValid() at runtime.
 */
export const FlexibleSkillSchema = z.string();

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: AgentStatusSchema,
  // Now accepts any string skills - validated via SkillRegistry at runtime
  skills: z.array(z.string()),
  // Track dynamically acquired skills separately
  acquiredSkills: z.array(z.string()).optional().default([]),
  currentTask: z.string().optional(),
  tmuxSession: z.string().optional(),
  createdAt: z.date(),
  lastActive: z.date(),
});

export type Agent = z.infer<typeof AgentSchema>;
