import { z } from 'zod';

export const MessageTypeSchema = z.enum([
  'task.created',
  'task.claimed',
  'task.assigned',
  'task.updated',
  'task.completed',
  'task.failed',
  'task.retry_scheduled',
  'task.progress',      // NEW: Detailed progress updates during execution
  'task.available',     // Supervisor notification of unassigned tasks
  'agent.started',
  'agent.stopped',
  'agent.error',
  'agent.status',       // NEW: Rich status updates from agents
  'file.lock',
  'file.unlock',
  'coordination.request',
  'coordination.response',
  'heartbeat',
]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  type: MessageTypeSchema,
  from: z.string(), // agent ID
  to: z.string().optional(), // agent ID or broadcast
  payload: z.record(z.unknown()),
  timestamp: z.date(),
  correlationId: z.string().optional(),
  // Acknowledgment fields
  ackRequired: z.boolean().optional(), // Whether ack is required
  ackedAt: z.date().optional(), // When it was acknowledged
  ackedBy: z.string().optional(), // Agent ID that acknowledged
});

export type Message = z.infer<typeof MessageSchema>;

// Message acknowledgment status
export interface MessageAckStatus {
  messageId: string;
  ackRequired: boolean;
  acked: boolean;
  ackedAt?: Date;
  ackedBy?: string;
}

export interface MessageBus {
  publish(message: Message): Promise<void>;
  subscribe(type: MessageType, handler: (msg: Message) => void | Promise<void>): void;
  unsubscribe(type: MessageType, handler: (msg: Message) => void | Promise<void>): void;
}

// ============================================================================
// Rich Agent Messaging Payloads (Enhancement 4)
// ============================================================================

/**
 * Execution phase for progress tracking
 */
export const TaskPhaseSchema = z.enum([
  'analyzing',    // Reading/understanding the task
  'planning',     // Deciding approach
  'executing',    // Making changes
  'testing',      // Running tests
  'reviewing',    // Self-review
  'finalizing',   // Cleanup/completion
]);
export type TaskPhase = z.infer<typeof TaskPhaseSchema>;

/**
 * Enhanced payload for task.claimed messages
 * Explains WHY the agent claimed this task
 */
export interface TaskClaimedPayload {
  taskId: string;
  taskTitle: string;
  agentName: string;
  agentId: string;
  reasoning: {
    matchedSkills: string[];      // Skills that matched
    skillScore: number;           // Match score (0-1)
    why: string;                  // Human-readable reason
    estimatedDuration: number;    // Minutes
    alternativesConsidered: number; // How many other tasks were considered
  };
  context: {
    totalReadyTasks: number;      // How many tasks were available
    busyAgentCount: number;       // How many agents are busy
    taskPriority: string;         // The task's priority
    taskType?: string;            // epic/task/subtask
  };
}

/**
 * Enhanced payload for task.progress messages
 * Provides detailed execution status
 */
export interface TaskProgressPayload {
  taskId: string;
  taskTitle: string;
  agentName: string;
  agentId: string;
  phase: TaskPhase;
  description: string;            // Human-readable: "Reading src/auth.ts to understand existing patterns"
  percentComplete: number;        // 0-100
  elapsedMs: number;
  details?: {
    filesRead?: string[];
    filesModified?: string[];
    testsRun?: number;
    testsPassed?: number;
    linesAdded?: number;
    linesRemoved?: number;
  };
}

/**
 * Enhanced payload for task.completed messages
 */
export interface TaskCompletedPayload {
  taskId: string;
  taskTitle: string;
  agentName: string;
  agentId: string;
  summary: string;                // What was accomplished
  durationMs: number;
  actualMinutes: number;
  details?: {
    filesModified: string[];
    linesAdded: number;
    linesRemoved: number;
    testsRun?: number;
    testsPassed?: number;
  };
}

/**
 * Enhanced payload for task.failed messages
 */
export interface TaskFailedPayload {
  taskId: string;
  taskTitle: string;
  agentName: string;
  agentId: string;
  error: string;
  failureType: 'error' | 'timeout' | 'stalled' | 'blocked';
  phase: TaskPhase;               // Where it failed
  durationMs: number;
  retryCount: number;
  maxRetries: number;
  willRetry: boolean;
  nextRetryIn?: number;           // ms until next retry
}

/**
 * Enhanced payload for agent.status messages
 * Regular status broadcasts from agents
 */
export interface AgentStatusPayload {
  agentId: string;
  agentName: string;
  status: 'idle' | 'busy' | 'error' | 'offline';
  currentTask?: {
    taskId: string;
    taskTitle: string;
    phase: TaskPhase;
    startedAt: string;
    elapsedMs: number;
  };
  stats: {
    tasksCompleted: number;
    tasksFailed: number;
    avgCompletionMs: number;
    uptime: number;               // ms since agent started
  };
  skills: string[];
  acquiredSkills: string[];       // Skills learned during session
}
