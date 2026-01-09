import { z } from 'zod';
import { Annotation } from '@langchain/langgraph';
import { Task, Agent, TaskStatus } from '@jetpack/shared';

/**
 * Conflict types that the coordinator handles
 */
export const ConflictTypeSchema = z.enum([
  'task_failed',
  'agent_error',
  'dependency_blocked',
  'skill_mismatch',
  'timeout',
]);
export type ConflictType = z.infer<typeof ConflictTypeSchema>;

/**
 * A conflict that needs resolution
 */
export const ConflictSchema = z.object({
  id: z.string(),
  type: ConflictTypeSchema,
  taskId: z.string(),
  agentId: z.string().optional(),
  description: z.string(),
  createdAt: z.date(),
  resolved: z.boolean().default(false),
  resolution: z.string().optional(),
});
export type Conflict = z.infer<typeof ConflictSchema>;

/**
 * A reassignment action
 */
export const ReassignmentSchema = z.object({
  taskId: z.string(),
  fromAgentId: z.string().optional(),
  toAgentId: z.string(),
  reason: z.string(),
  timestamp: z.date(),
});
export type Reassignment = z.infer<typeof ReassignmentSchema>;

/**
 * Task breakdown from planner with dependencies
 */
export const PlannedTaskSchema = z.object({
  title: z.string(),
  description: z.string(),
  requiredSkills: z.array(z.string()),
  estimatedMinutes: z.number(),
  dependsOn: z.array(z.string()), // titles of other tasks
});
export type PlannedTask = z.infer<typeof PlannedTaskSchema>;

/**
 * LangGraph state annotation for the supervisor
 */
export const SupervisorStateAnnotation = Annotation.Root({
  // Input
  userRequest: Annotation<string>(),

  // Planning phase
  plannedTasks: Annotation<PlannedTask[]>({
    default: () => [],
    reducer: (_, newTasks) => newTasks,
  }),

  // Created tasks (after Beads integration)
  createdTasks: Annotation<Task[]>({
    default: () => [],
    reducer: (existing, newTasks) => [...existing, ...newTasks],
  }),

  // Available agents
  agents: Annotation<Agent[]>({
    default: () => [],
    reducer: (_, agents) => agents,
  }),

  // Task assignments: taskId -> agentId
  assignments: Annotation<Record<string, string>>({
    default: () => ({}),
    reducer: (existing, updates) => ({ ...existing, ...updates }),
  }),

  // Current task statuses
  taskStatuses: Annotation<Record<string, TaskStatus>>({
    default: () => ({}),
    reducer: (existing, updates) => ({ ...existing, ...updates }),
  }),

  // Conflicts to resolve
  conflicts: Annotation<Conflict[]>({
    default: () => [],
    reducer: (existing, newConflicts) => [...existing, ...newConflicts],
  }),

  // Reassignment history
  reassignments: Annotation<Reassignment[]>({
    default: () => [],
    reducer: (existing, newReassignments) => [...existing, ...newReassignments],
  }),

  // Completed task IDs
  completedTaskIds: Annotation<string[]>({
    default: () => [],
    reducer: (existing, newIds) => [...new Set([...existing, ...newIds])],
  }),

  // Failed task IDs
  failedTaskIds: Annotation<string[]>({
    default: () => [],
    reducer: (existing, newIds) => [...new Set([...existing, ...newIds])],
  }),

  // Current iteration count (for loop detection)
  iteration: Annotation<number>({
    default: () => 0,
    reducer: (_, n) => n,
  }),

  // Final report when complete
  finalReport: Annotation<string>({
    default: () => '',
    reducer: (_, report) => report,
  }),

  // Error message if failed
  error: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_, err) => err,
  }),
});

export type SupervisorState = typeof SupervisorStateAnnotation.State;
