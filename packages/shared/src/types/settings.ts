import { z } from 'zod';
import { RuntimeModeSchema, RuntimeLimitsSchema } from './runtime';

/**
 * Runtime settings that control autonomous operation behavior
 */
export const RuntimeSettingsSchema = z.object({
  /** Runtime mode controlling continuation logic */
  mode: RuntimeModeSchema.default('iteration-limit'),

  /** Max iterations for iteration-limit mode (default: 100) */
  maxIterations: z.number().int().min(0).default(100),

  /** Idle timeout in ms for idle-pause mode (default: 5 min) */
  idleTimeoutMs: z.number().int().min(0).default(300000),

  /** Objective description for objective-based mode */
  objective: z.string().optional(),

  /** How often to check if objective is met in ms (default: 60s) */
  objectiveCheckIntervalMs: z.number().int().min(1000).default(60000),

  /** Runtime limits (max cycles, runtime, failures, etc.) */
  limits: RuntimeLimitsSchema.optional(),
});
export type RuntimeSettings = z.infer<typeof RuntimeSettingsSchema>;

/**
 * Agent-specific settings
 */
export const AgentSettingsSchema = z.object({
  /** How often agents poll for work in ms (default: 30s) - BUG-5 fix */
  workPollingIntervalMs: z.number().int().min(1000).default(30000),

  /** Multiplier for task.estimatedMinutes to calculate timeout (default: 2.0) - BUG-6 fix */
  timeoutMultiplier: z.number().min(1.0).max(10.0).default(2.0),

  /** Minimum timeout regardless of estimate in ms (default: 5 min) */
  minTimeoutMs: z.number().int().min(60000).default(300000),

  /** Maximum timeout regardless of estimate in ms (default: 2 hours) */
  maxTimeoutMs: z.number().int().min(300000).default(7200000),

  /** Graceful shutdown timeout in ms (default: 30s) - BUG-7 fix */
  gracefulShutdownMs: z.number().int().min(5000).default(30000),
});
export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

/**
 * Browser validation settings for UI tasks
 */
export const BrowserValidationSettingsSchema = z.object({
  /** Enable browser validation for UI tasks */
  enabled: z.boolean().default(false),

  /** URL of dev server to validate against */
  devServerUrl: z.string().url().default('http://localhost:3000'),

  /** Timeout for page load in ms */
  pageLoadTimeoutMs: z.number().int().min(1000).default(30000),

  /** Whether to take screenshots on validation */
  captureScreenshots: z.boolean().default(true),
});
export type BrowserValidationSettings = z.infer<typeof BrowserValidationSettingsSchema>;

/**
 * Quality infrastructure settings
 */
export const QualitySettingsSchema = z.object({
  /** Enable quality metrics collection */
  enabled: z.boolean().default(true),

  /** Run build check after task completion */
  checkBuild: z.boolean().default(true),

  /** Run tests after task completion */
  checkTests: z.boolean().default(true),

  /** Run linter after task completion */
  checkLint: z.boolean().default(false),

  /** Detect and report regressions */
  detectRegressions: z.boolean().default(true),
});
export type QualitySettings = z.infer<typeof QualitySettingsSchema>;

/**
 * Supervisor settings
 */
export const SupervisorSettingsSchema = z.object({
  /** LLM provider to use */
  provider: z.enum(['claude', 'openai']).default('claude'),

  /** Model to use for planning */
  model: z.string().default('claude-sonnet-4-20250514'),

  /** Enable failure analysis and escalation */
  enableFailureAnalysis: z.boolean().default(true),

  /** Auto-decompose failed tasks into subtasks */
  autoDecompose: z.boolean().default(true),
});
export type SupervisorSettings = z.infer<typeof SupervisorSettingsSchema>;

/**
 * Complete Jetpack settings configuration
 * Used by both CLI and web UI
 */
export const JetpackSettingsSchema = z.object({
  /** Runtime/autonomous operation settings */
  runtime: RuntimeSettingsSchema.default({}),

  /** Agent execution settings */
  agents: AgentSettingsSchema.default({}),

  /** Browser validation settings */
  browserValidation: BrowserValidationSettingsSchema.default({}),

  /** Quality metrics settings */
  quality: QualitySettingsSchema.default({}),

  /** Supervisor/LLM settings */
  supervisor: SupervisorSettingsSchema.default({}),

  /** Number of agents to spawn (default: 3) */
  agentCount: z.number().int().min(1).max(10).default(3),

  /** Working directory override */
  workDir: z.string().optional(),
});
export type JetpackSettings = z.infer<typeof JetpackSettingsSchema>;

/**
 * Default settings for quick initialization
 */
export const DEFAULT_SETTINGS: JetpackSettings = JetpackSettingsSchema.parse({});

/**
 * Settings file name (stored in .jetpack/)
 */
export const SETTINGS_FILE = 'settings.json';
