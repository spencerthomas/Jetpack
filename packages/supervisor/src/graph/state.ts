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
 * Plan item type - hierarchical structure (Epic > Task > Subtask)
 */
export const PlanItemTypeSchema = z.enum(['epic', 'task', 'subtask', 'leaf']);
export type PlanItemType = z.infer<typeof PlanItemTypeSchema>;

/**
 * Task breakdown from planner with dependencies and hierarchy info
 */
export const PlannedTaskSchema = z.object({
  title: z.string(),
  description: z.string(),
  requiredSkills: z.array(z.string()),
  estimatedMinutes: z.number(),
  dependsOn: z.array(z.string()), // titles of other tasks
  // Hierarchy information (all optional for backwards compatibility)
  type: PlanItemTypeSchema.optional(), // Defaults to 'task' if not specified
  parentTitle: z.string().optional(), // Title of parent epic/task
  executable: z.boolean().optional(), // Defaults to true if not specified
});
export type PlannedTask = z.infer<typeof PlannedTaskSchema>;

/**
 * Milestone status for continuous objective tracking
 */
export const MilestoneStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
]);
export type MilestoneStatus = z.infer<typeof MilestoneStatusSchema>;

/**
 * A milestone represents a phase within an objective
 */
export const MilestoneSchema = z.object({
  id: z.string(),
  title: z.string(),
  completionCriteria: z.array(z.string()), // Checkable criteria
  estimatedTasks: z.number(),
  taskIds: z.array(z.string()), // Tasks spawned for this milestone
  status: MilestoneStatusSchema,
});
export type Milestone = z.infer<typeof MilestoneSchema>;

/**
 * Objective status for high-level goal tracking
 */
export const ObjectiveStatusSchema = z.enum([
  'active',
  'paused',
  'completed',
  'failed',
]);
export type ObjectiveStatus = z.infer<typeof ObjectiveStatusSchema>;

/**
 * An objective is a high-level goal broken into milestones
 */
export const ObjectiveSchema = z.object({
  id: z.string(),
  title: z.string(),
  userRequest: z.string(),
  status: ObjectiveStatusSchema,
  milestones: z.array(MilestoneSchema),
  currentMilestoneIndex: z.number(),
  progressPercent: z.number(), // 0-100
  generationRound: z.number(), // Tracks task generation iterations
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Objective = z.infer<typeof ObjectiveSchema>;

/**
 * Queue management thresholds for continuous operation
 */
export const QueueThresholdsSchema = z.object({
  lowWatermark: z.number().default(2),   // Trigger generation when below
  highWatermark: z.number().default(8),  // Target queue size
  maxWatermark: z.number().default(15),  // Never exceed this
  cooldownMs: z.number().default(30000), // Min time between generations
});
export type QueueThresholds = z.infer<typeof QueueThresholdsSchema>;

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

  // === Continuous mode extensions ===

  // Active objective (for continuous task generation)
  objective: Annotation<Objective | undefined>({
    default: () => undefined,
    reducer: (_, obj) => obj,
  }),

  // Queue management thresholds
  queueThresholds: Annotation<QueueThresholds>({
    default: () => ({
      lowWatermark: 2,
      highWatermark: 8,
      maxWatermark: 15,
      cooldownMs: 30000,
    }),
    reducer: (_, thresholds) => thresholds,
  }),

  // Current pending task count in the queue
  pendingTaskCount: Annotation<number>({
    default: () => 0,
    reducer: (_, count) => count,
  }),

  // Last time tasks were generated (for cooldown)
  lastGenerationTime: Annotation<Date | undefined>({
    default: () => undefined,
    reducer: (_, time) => time,
  }),

  // Whether we're in continuous mode
  continuousMode: Annotation<boolean>({
    default: () => false,
    reducer: (_, mode) => mode,
  }),

  // Milestone completion check results
  milestoneCheckResult: Annotation<{
    milestoneId: string;
    criteriaSatisfied: boolean[];
    allSatisfied: boolean;
    reasoning: string;
  } | undefined>({
    default: () => undefined,
    reducer: (_, result) => result,
  }),
});

export type SupervisorState = typeof SupervisorStateAnnotation.State;
