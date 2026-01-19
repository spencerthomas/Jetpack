import { z } from 'zod';

/**
 * Memory severity levels for tiered response
 */
export const MemorySeveritySchema = z.enum([
  'normal',    // Below warning threshold
  'warning',   // Log warnings, monitor closely
  'elevated',  // Trigger GC, throttle task intake
  'critical',  // Pause new tasks
  'emergency', // Graceful shutdown
]);
export type MemorySeverity = z.infer<typeof MemorySeveritySchema>;

/**
 * Actions to take at elevated memory levels
 */
export const MemoryActionSchema = z.enum([
  'log',              // Just log the event
  'notify',           // Log and emit event
  'gc',               // Force garbage collection
  'throttle',         // Slow down task intake
  'archive',          // Archive old state to disk
  'pause',            // Pause new task assignment
  'dump',             // Create heap dump for debugging
  'shutdown',         // Graceful shutdown
]);
export type MemoryAction = z.infer<typeof MemoryActionSchema>;

/**
 * Memory threshold configuration
 * All values in megabytes
 */
export const MemoryThresholdsSchema = z.object({
  /** Warning threshold - log warnings (default: 2048 MB) */
  warningMB: z.number().int().min(512).default(2048),

  /** Elevated threshold - trigger GC, slow task intake (default: 3072 MB) */
  elevatedMB: z.number().int().min(1024).default(3072),

  /** Critical threshold - pause new tasks (default: 3584 MB) */
  criticalMB: z.number().int().min(1536).default(3584),

  /** Emergency threshold - graceful shutdown (default: 3840 MB) */
  emergencyMB: z.number().int().min(2048).default(3840),
});
export type MemoryThresholds = z.infer<typeof MemoryThresholdsSchema>;

/**
 * Actions configuration for each severity level
 */
export const MemoryBehaviorSchema = z.object({
  /** Actions to take when warning threshold is reached */
  onWarning: z.array(MemoryActionSchema).default(['log', 'notify']),

  /** Actions to take when elevated threshold is reached */
  onElevated: z.array(MemoryActionSchema).default(['gc', 'throttle', 'archive']),

  /** Actions to take when critical threshold is reached */
  onCritical: z.array(MemoryActionSchema).default(['pause', 'gc']),

  /** Actions to take when emergency threshold is reached */
  onEmergency: z.array(MemoryActionSchema).default(['dump', 'shutdown']),
});
export type MemoryBehavior = z.infer<typeof MemoryBehaviorSchema>;

/**
 * Concurrency control configuration
 */
export const ConcurrencyConfigSchema = z.object({
  /** Maximum concurrent tasks across all agents (default: 3) */
  maxConcurrentTasks: z.number().int().min(1).max(20).default(3),

  /** Maximum concurrent agents (default: 5) */
  maxConcurrentAgents: z.number().int().min(1).max(20).default(5),

  /** Maximum memory per process in MB (default: 512) */
  maxProcessMemoryMB: z.number().int().min(128).max(2048).default(512),

  /** Queue capacity for pending tasks (default: 100) */
  taskQueueCapacity: z.number().int().min(10).max(1000).default(100),
});
export type ConcurrencyConfig = z.infer<typeof ConcurrencyConfigSchema>;

/**
 * Output streaming configuration
 */
export const OutputStreamConfigSchema = z.object({
  /** Enable output streaming (vs string concatenation) */
  enabled: z.boolean().default(true),

  /** Maximum output buffer size in bytes (default: 10MB) */
  maxBufferBytes: z.number().int().min(1024 * 1024).default(10 * 1024 * 1024),

  /** Write large outputs to temp files */
  useTempFiles: z.boolean().default(true),

  /** High water mark for PassThrough stream (default: 1MB) */
  highWaterMark: z.number().int().min(1024).default(1024 * 1024),
});
export type OutputStreamConfig = z.infer<typeof OutputStreamConfigSchema>;

/**
 * State management configuration
 */
export const StateManagementConfigSchema = z.object({
  /** Maximum tasks to keep in memory (default: 100) */
  maxTasksInMemory: z.number().int().min(10).max(1000).default(100),

  /** Maximum conflicts to keep in memory (default: 50) */
  maxConflictsInMemory: z.number().int().min(10).max(500).default(50),

  /** Maximum reassignments to keep in memory (default: 50) */
  maxReassignmentsInMemory: z.number().int().min(10).max(500).default(50),

  /** TTL for processed broadcasts in ms (default: 1 hour) */
  broadcastTTLMs: z.number().int().min(60000).default(3600000),

  /** Enable automatic archival of old state */
  enableArchival: z.boolean().default(true),
});
export type StateManagementConfig = z.infer<typeof StateManagementConfigSchema>;

/**
 * Complete memory management configuration
 */
export const MemoryConfigSchema = z.object({
  /** Enable memory monitoring */
  enabled: z.boolean().default(true),

  /** Memory thresholds in MB */
  thresholds: MemoryThresholdsSchema.default({}),

  /** Actions to take at each severity level */
  behavior: MemoryBehaviorSchema.default({}),

  /** Concurrency limits */
  concurrency: ConcurrencyConfigSchema.default({}),

  /** Output streaming configuration */
  outputStream: OutputStreamConfigSchema.default({}),

  /** State management configuration */
  stateManagement: StateManagementConfigSchema.default({}),

  /** Check interval in ms (default: 10s) */
  checkIntervalMs: z.number().int().min(1000).default(10000),

  /** Cooldown between forced GC calls in ms (default: 60s) */
  gcCooldownMs: z.number().int().min(10000).default(60000),

  /** Create heap dump on emergency (for debugging) */
  heapDumpOnEmergency: z.boolean().default(false),
});
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

/**
 * Memory statistics snapshot
 */
export const HeapStatsSchema = z.object({
  /** Heap used in bytes */
  heapUsed: z.number().int().min(0),

  /** Heap total in bytes */
  heapTotal: z.number().int().min(0),

  /** External memory in bytes */
  external: z.number().int().min(0),

  /** RSS (resident set size) in bytes */
  rss: z.number().int().min(0),

  /** Array buffers in bytes */
  arrayBuffers: z.number().int().min(0),

  /** Current severity level */
  severity: MemorySeveritySchema,

  /** Timestamp of this snapshot */
  timestamp: z.date(),
});
export type HeapStats = z.infer<typeof HeapStatsSchema>;

/**
 * Events emitted by MemoryMonitor
 */
export type MemoryEvent =
  | { type: 'severity_changed'; from: MemorySeverity; to: MemorySeverity; stats: HeapStats }
  | { type: 'gc_triggered'; stats: HeapStats; reason: string }
  | { type: 'throttle_started'; stats: HeapStats }
  | { type: 'throttle_stopped'; stats: HeapStats }
  | { type: 'tasks_paused'; stats: HeapStats }
  | { type: 'tasks_resumed'; stats: HeapStats }
  | { type: 'emergency_shutdown'; stats: HeapStats }
  | { type: 'heap_dump_created'; path: string; stats: HeapStats };

/**
 * Default memory configuration for quick initialization
 */
export const DEFAULT_MEMORY_CONFIG: MemoryConfig = MemoryConfigSchema.parse({});

/**
 * Format bytes as human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Convert MB to bytes
 */
export function mbToBytes(mb: number): number {
  return mb * 1024 * 1024;
}

/**
 * Convert bytes to MB
 */
export function bytesToMb(bytes: number): number {
  return bytes / (1024 * 1024);
}
