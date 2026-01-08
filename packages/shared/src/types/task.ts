import { z } from 'zod';
import { AgentSkillSchema } from './agent';

export const TaskStatusSchema = z.enum([
  'pending',
  'ready',
  'claimed',
  'in_progress',
  'blocked',
  'completed',
  'failed',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

// Beads-compatible task format
export const TaskSchema = z.object({
  id: z.string(), // bd-XXXX format
  title: z.string(),
  description: z.string().optional(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema.default('medium'),
  dependencies: z.array(z.string()).default([]), // Task IDs
  blockers: z.array(z.string()).default([]),
  requiredSkills: z.array(AgentSkillSchema).default([]),
  assignedAgent: z.string().optional(),
  estimatedMinutes: z.number().optional(),
  actualMinutes: z.number().optional(),
  tags: z.array(z.string()).default([]),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type Task = z.infer<typeof TaskSchema>;

export interface TaskGraph {
  tasks: Map<string, Task>;
  edges: Map<string, Set<string>>; // task -> dependencies
}
