import { z } from 'zod';

/**
 * Execution progress tracking for real-time monitoring
 */
export const ExecutionProgressStatusSchema = z.enum([
  'running',
  'stalled',
  'completed',
  'failed',
]);
export type ExecutionProgressStatus = z.infer<typeof ExecutionProgressStatusSchema>;

export const ExecutionProgressSchema = z.object({
  taskId: z.string(),
  agentId: z.string(),
  status: ExecutionProgressStatusSchema,
  lastOutput: z.array(z.string()),      // Last N lines of output
  lastActivityAt: z.date(),
  startedAt: z.date(),
  outputLineCount: z.number(),
  stallThresholdMs: z.number().default(300000), // 5 minutes
});

export type ExecutionProgress = z.infer<typeof ExecutionProgressSchema>;

/**
 * Event emitted when execution progress updates
 */
export interface ExecutionProgressEvent {
  type: 'output' | 'stall_warning' | 'completed' | 'failed';
  progress: ExecutionProgress;
  newLines?: string[];
  error?: string;
}
