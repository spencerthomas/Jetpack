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

export const FailureTypeSchema = z.enum(['timeout', 'error', 'stalled']);
export type FailureType = z.infer<typeof FailureTypeSchema>;

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
  // Retry fields for failed task handling
  retryCount: z.number().optional().default(0),           // Current retry attempt (0-indexed)
  maxRetries: z.number().optional().default(2),           // Max allowed retries
  lastError: z.string().optional(),            // Error from last attempt
  lastAttemptAt: z.date().optional(),          // Timestamp of last attempt
  failureType: FailureTypeSchema.optional(),   // Type of failure (timeout, error, stalled)
  // Branch tagging for multi-branch projects
  branch: z.string().optional(),               // Current branch (e.g., "feature/auth")
  originBranch: z.string().optional(),         // Branch where task was created
  targetBranches: z.array(z.string()).optional().default([]),  // Branches this task applies to
});

export type Task = z.infer<typeof TaskSchema>;

export interface TaskGraph {
  tasks: Map<string, Task>;
  edges: Map<string, Set<string>>; // task -> dependencies
}
