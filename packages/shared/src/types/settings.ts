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
 * Hybrid mode for distributed execution
 * - local: All processing happens locally (default)
 * - edge: All processing happens on Cloudflare edge
 * - hybrid: Task storage on edge, agent execution local
 */
export const HybridModeSchema = z.enum(['local', 'edge', 'hybrid']);
export type HybridMode = z.infer<typeof HybridModeSchema>;

/**
 * Hybrid/Edge mode settings for distributed execution
 */
export const HybridModeSettingsSchema = z.object({
  /** Execution mode: local, edge, or hybrid */
  mode: HybridModeSchema.default('local'),

  /** Cloudflare Worker API URL (required for edge/hybrid modes) */
  cloudflareUrl: z.string().url().optional(),

  /** API token for authenticating with Cloudflare Worker */
  apiToken: z.string().optional(),

  /** Sync interval in ms for hybrid mode (default: 5 seconds) */
  syncIntervalMs: z.number().int().min(1000).default(5000),

  /** Enable offline fallback for hybrid mode */
  offlineFallback: z.boolean().default(true),
});
export type HybridModeSettings = z.infer<typeof HybridModeSettingsSchema>;

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

  /** Hybrid/edge mode settings */
  hybrid: HybridModeSettingsSchema.default({}),

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

/**
 * Environment variable names for Jetpack configuration
 */
export const ENV_VARS = {
  /** Jetpack runtime mode: 'local' | 'hybrid' | 'cloud' */
  MODE: 'JETPACK_MODE',
  /** Cloudflare Worker API URL */
  CLOUDFLARE_API_URL: 'CLOUDFLARE_API_URL',
  /** Cloudflare Worker API token */
  CLOUDFLARE_API_TOKEN: 'CLOUDFLARE_API_TOKEN',
  /** Working directory override */
  WORK_DIR: 'JETPACK_WORK_DIR',
  /** Anthropic API key for Claude */
  ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
  /** OpenAI API key */
  OPENAI_API_KEY: 'OPENAI_API_KEY',
  /** Ollama base URL */
  OLLAMA_BASE_URL: 'OLLAMA_BASE_URL',
} as const;

/**
 * Environment configuration loaded from process.env
 */
export interface EnvironmentConfig {
  /** Jetpack runtime mode */
  mode: HybridMode;
  /** Cloudflare Worker API URL (for hybrid/cloud modes) */
  cloudflareApiUrl?: string;
  /** Cloudflare Worker API token */
  cloudflareApiToken?: string;
  /** Working directory override */
  workDir?: string;
  /** Anthropic API key */
  anthropicApiKey?: string;
  /** OpenAI API key */
  openaiApiKey?: string;
  /** Ollama base URL */
  ollamaBaseUrl?: string;
}

/**
 * Load environment configuration from process.env
 * Returns validated config or throws if required values are missing for the mode
 */
export function loadEnvironmentConfig(): EnvironmentConfig {
  const mode = (process.env[ENV_VARS.MODE] || 'local') as HybridMode;

  // Validate mode
  const validModes: HybridMode[] = ['local', 'hybrid', 'edge'];
  if (!validModes.includes(mode)) {
    throw new Error(
      `Invalid JETPACK_MODE: "${mode}". Valid values: ${validModes.join(', ')}`
    );
  }

  const config: EnvironmentConfig = {
    mode,
    cloudflareApiUrl: process.env[ENV_VARS.CLOUDFLARE_API_URL],
    cloudflareApiToken: process.env[ENV_VARS.CLOUDFLARE_API_TOKEN],
    workDir: process.env[ENV_VARS.WORK_DIR],
    anthropicApiKey: process.env[ENV_VARS.ANTHROPIC_API_KEY],
    openaiApiKey: process.env[ENV_VARS.OPENAI_API_KEY],
    ollamaBaseUrl: process.env[ENV_VARS.OLLAMA_BASE_URL],
  };

  // Validate required values for hybrid/edge modes
  if (mode === 'hybrid' || mode === 'edge') {
    if (!config.cloudflareApiUrl) {
      throw new Error(
        `CLOUDFLARE_API_URL is required for ${mode} mode. ` +
        `Set it in your .env file or environment.`
      );
    }
    if (!config.cloudflareApiToken) {
      throw new Error(
        `CLOUDFLARE_API_TOKEN is required for ${mode} mode. ` +
        `Set it in your .env file or environment.`
      );
    }
  }

  return config;
}

/**
 * Merge environment config with explicit config, environment takes precedence
 * for security-sensitive values (API tokens) when not explicitly provided
 */
export function mergeWithEnvironment(
  explicitConfig: Partial<JetpackSettings>,
  envConfig: EnvironmentConfig
): Partial<JetpackSettings> {
  const merged: Partial<JetpackSettings> = { ...explicitConfig };

  // Apply workDir from environment if not explicitly set
  if (!merged.workDir && envConfig.workDir) {
    merged.workDir = envConfig.workDir;
  }

  // Apply hybrid settings from environment
  // Initialize with defaults if not set
  if (!merged.hybrid) {
    merged.hybrid = {
      mode: 'local',
      syncIntervalMs: 5000,
      offlineFallback: true,
    };
  }

  // Mode from environment (if not explicitly set)
  if (merged.hybrid.mode === 'local' && envConfig.mode !== 'local') {
    merged.hybrid.mode = envConfig.mode;
  }

  // Cloudflare settings from environment (if not explicitly set)
  if (!merged.hybrid.cloudflareUrl && envConfig.cloudflareApiUrl) {
    merged.hybrid.cloudflareUrl = envConfig.cloudflareApiUrl;
  }
  if (!merged.hybrid.apiToken && envConfig.cloudflareApiToken) {
    merged.hybrid.apiToken = envConfig.cloudflareApiToken;
  }

  return merged;
}
