import { z } from 'zod';

/**
 * Runtime modes for autonomous operation
 * Controls how the supervisor decides when to continue or stop
 */
export const RuntimeModeSchema = z.enum([
  'infinite',        // Never stops, generates work continuously
  'idle-pause',      // Pauses when no work available, resumes on new tasks
  'objective-based', // Runs until specific objective achieved
  'iteration-limit', // Original behavior with max iterations
]);
export type RuntimeMode = z.infer<typeof RuntimeModeSchema>;

/**
 * End states for autonomous operation
 * These indicate why Jetpack stopped running
 */
export const EndStateSchema = z.enum([
  'manual_stop',           // User Ctrl+C or explicit stop
  'max_cycles_reached',    // Hit configured cycle limit
  'max_runtime_reached',   // Hit configured time limit
  'idle_timeout',          // No tasks for too long
  'all_tasks_complete',    // Natural completion (queue empty)
  'max_failures_reached',  // Too many consecutive failures
  'objective_complete',    // Supervisor determined objective met
  'fatal_error',           // Unrecoverable error
]);
export type EndState = z.infer<typeof EndStateSchema>;

/**
 * Runtime limits configuration
 * All values of 0 mean "unlimited"
 */
export const RuntimeLimitsSchema = z.object({
  maxCycles: z.number().int().min(0).default(0),           // 0 = unlimited
  maxRuntimeMs: z.number().int().min(0).default(0),        // 0 = unlimited
  idleTimeoutMs: z.number().int().min(0).default(0),       // 0 = disabled
  maxConsecutiveFailures: z.number().int().min(1).default(5),
  minQueueSize: z.number().int().min(0).default(0),        // Trigger task generation
  checkIntervalMs: z.number().int().min(100).default(5000),
});
export type RuntimeLimits = z.infer<typeof RuntimeLimitsSchema>;

/**
 * Runtime statistics tracked during operation
 */
export const RuntimeStatsSchema = z.object({
  cycleCount: z.number().int().min(0),
  tasksCompleted: z.number().int().min(0),
  tasksFailed: z.number().int().min(0),
  consecutiveFailures: z.number().int().min(0),
  startedAt: z.date(),
  lastWorkAt: z.date().optional(),
  elapsedMs: z.number().int().min(0),
});
export type RuntimeStats = z.infer<typeof RuntimeStatsSchema>;

/**
 * Persisted runtime state for recovery/resume
 */
export const RuntimeStateSchema = z.object({
  cycleCount: z.number().int().min(0),
  startedAt: z.coerce.date(),
  lastWorkAt: z.coerce.date().optional(),
  tasksCompleted: z.number().int().min(0),
  tasksFailed: z.number().int().min(0),
  activeObjectiveId: z.string().optional(),
  endState: EndStateSchema.nullable(),
});
export type RuntimeState = z.infer<typeof RuntimeStateSchema>;

/**
 * Events emitted by RuntimeManager
 */
export type RuntimeEvent =
  | { type: 'cycle_complete'; cycleNumber: number; stats: RuntimeStats }
  | { type: 'task_complete'; taskId: string; stats: RuntimeStats }
  | { type: 'task_failed'; taskId: string; error: string; stats: RuntimeStats }
  | { type: 'idle_detected'; idleDurationMs: number }
  | { type: 'limit_warning'; limitType: 'cycles' | 'runtime' | 'failures'; current: number; max: number }
  | { type: 'end_state'; endState: EndState; stats: RuntimeStats };

/**
 * Helper to parse duration strings like "8h", "30m", "1d"
 */
export function parseDurationMs(duration: string): number {
  const match = duration.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}. Use formats like "30m", "8h", "1d"`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
}

/**
 * Format milliseconds as human-readable duration
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
  return `${(ms / 86400000).toFixed(1)}d`;
}
