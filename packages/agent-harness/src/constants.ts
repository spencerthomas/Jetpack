/**
 * Default values and constants used throughout the agent-harness package
 */

/**
 * Default timing intervals (in milliseconds)
 */
export const TIMING = {
  /** Default heartbeat interval */
  HEARTBEAT_INTERVAL_MS: 30_000,
  /** Default work polling interval */
  WORK_POLLING_INTERVAL_MS: 10_000,
  /** Default version check timeout for CLI availability */
  VERSION_CHECK_TIMEOUT_MS: 5_000,
  /** Grace period before SIGKILL after SIGTERM */
  KILL_GRACE_PERIOD_MS: 5_000,
  /** Default task timeout in milliseconds (30 minutes) */
  DEFAULT_TIMEOUT_MS: 30 * 60 * 1000,
} as const;

/**
 * Task execution defaults
 */
export const TASK = {
  /** Default maximum task duration in minutes */
  DEFAULT_MAX_TASK_MINUTES: 60,
  /** Output truncation length for database storage */
  OUTPUT_TRUNCATION_LENGTH: 1000,
} as const;

/**
 * Progress reporting stages
 */
export const PROGRESS_STEPS = {
  /** Analyzing phase percentage */
  ANALYZING: 20,
  /** Planning phase percentage */
  PLANNING: 40,
  /** Implementing phase percentage */
  IMPLEMENTING: 60,
  /** Testing phase percentage */
  TESTING: 80,
  /** Complete percentage */
  COMPLETE: 100,
} as const;

/**
 * Progress stage definitions
 */
export const PROGRESS_STAGES = [
  {
    phase: 'analyzing' as const,
    percentComplete: PROGRESS_STEPS.ANALYZING,
    description: 'Analyzing codebase',
  },
  {
    phase: 'planning' as const,
    percentComplete: PROGRESS_STEPS.PLANNING,
    description: 'Planning implementation',
  },
  {
    phase: 'implementing' as const,
    percentComplete: PROGRESS_STEPS.IMPLEMENTING,
    description: 'Implementing changes',
  },
  {
    phase: 'testing' as const,
    percentComplete: PROGRESS_STEPS.TESTING,
    description: 'Running tests',
  },
] as const;