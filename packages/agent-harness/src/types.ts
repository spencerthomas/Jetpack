import { z } from 'zod';
import type { Task, TaskProgress, TaskResult, TaskFailure, AgentType, AgentStatus } from '@jetpack-agent/data';

// ============================================================================
// MODEL ADAPTER TYPES
// ============================================================================

/**
 * Configuration for a model adapter
 */
export interface ModelConfig {
  /** Model provider (claude, openai, gemini, codex, custom) */
  provider: string;
  /** Specific model ID (e.g., claude-3-5-sonnet-20241022) */
  model: string;
  /** API key or authentication token */
  apiKey?: string;
  /** Base URL for API calls */
  baseUrl?: string;
  /** Maximum tokens for responses */
  maxTokens?: number;
  /** Temperature for generation */
  temperature?: number;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Custom headers for API requests */
  headers?: Record<string, string>;
  /** Provider-specific options */
  options?: Record<string, unknown>;
}

/**
 * Message in a conversation with the model
 */
export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Request to execute a task
 */
export interface ExecutionRequest {
  /** The task to execute */
  task: Task;
  /** System prompt for the model */
  systemPrompt: string;
  /** Conversation history (if any) */
  messages?: ModelMessage[];
  /** Relevant context from memory */
  context?: string[];
  /** Working directory for file operations */
  workDir: string;
  /** Maximum execution time in milliseconds */
  timeoutMs?: number;
}

/**
 * Result from model execution
 */
export interface ExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Output from the model */
  output: string;
  /** Files created during execution */
  filesCreated: string[];
  /** Files modified during execution */
  filesModified: string[];
  /** Files deleted during execution */
  filesDeleted: string[];
  /** Learnings or insights from the task */
  learnings?: string[];
  /** Error message if execution failed */
  error?: string;
  /** Execution time in milliseconds */
  durationMs: number;
  /** Token usage statistics */
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Progress callback during execution
 */
export type ProgressCallback = (progress: TaskProgress) => void;

/**
 * Output chunk callback for streaming
 */
export type OutputCallback = (chunk: string) => void;

/**
 * Interface that all model adapters must implement
 */
export interface ModelAdapter {
  /** Provider name */
  readonly provider: string;
  /** Model ID */
  readonly model: string;

  /**
   * Execute a task using this model
   */
  execute(
    request: ExecutionRequest,
    onProgress?: ProgressCallback,
    onOutput?: OutputCallback
  ): Promise<ExecutionResult>;

  /**
   * Check if the model is available and configured correctly
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get estimated cost for a task (optional)
   */
  estimateCost?(task: Task): Promise<{ inputCost: number; outputCost: number }>;

  /**
   * Clean up any resources
   */
  close?(): Promise<void>;
}

// ============================================================================
// AGENT HARNESS TYPES
// ============================================================================

/**
 * Agent harness configuration
 */
export interface AgentHarnessConfig {
  /** Unique agent ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Agent type for the swarm */
  type: AgentType;
  /** Model adapter to use */
  model: ModelAdapter;
  /** Skills this agent has */
  skills: string[];
  /** Working directory for file operations */
  workDir: string;
  /** Maximum task duration in minutes */
  maxTaskMinutes?: number;
  /** Whether agent can run tests */
  canRunTests?: boolean;
  /** Whether agent can run builds */
  canRunBuild?: boolean;
  /** Whether agent can access browser */
  canAccessBrowser?: boolean;
  /** Heartbeat interval in milliseconds */
  heartbeatIntervalMs?: number;
  /** Work polling interval in milliseconds */
  workPollingIntervalMs?: number;
  /** Machine information */
  machine?: {
    id: string;
    hostname: string;
  };
}

/**
 * Agent lifecycle events
 */
export type AgentEvent =
  | { type: 'started' }
  | { type: 'stopped'; reason: string }
  | { type: 'task_claimed'; taskId: string }
  | { type: 'task_started'; taskId: string }
  | { type: 'task_progress'; taskId: string; progress: TaskProgress }
  | { type: 'task_completed'; taskId: string; result: TaskResult }
  | { type: 'task_failed'; taskId: string; failure: TaskFailure }
  | { type: 'heartbeat' }
  | { type: 'error'; error: Error };

/**
 * Callback for agent events
 */
export type AgentEventCallback = (event: AgentEvent) => void;

/**
 * Agent runtime statistics
 */
export interface AgentStats {
  tasksCompleted: number;
  tasksFailed: number;
  totalRuntimeMinutes: number;
  currentTaskId: string | null;
  currentTaskStartedAt: Date | null;
  lastHeartbeat: Date | null;
  status: AgentStatus;
}

// ============================================================================
// PROMPT TEMPLATES
// ============================================================================

/**
 * Template for generating system prompts
 */
export interface PromptTemplate {
  /** Generate system prompt for a task */
  generateSystemPrompt(config: {
    agentName: string;
    skills: string[];
    workDir: string;
  }): string;

  /** Generate task prompt */
  generateTaskPrompt(config: {
    task: Task;
    context?: string[];
  }): string;

  /** Parse model output to extract results */
  parseOutput(output: string): Partial<ExecutionResult>;
}

/**
 * Default prompt template configuration
 */
export const DefaultPromptTemplate: PromptTemplate = {
  generateSystemPrompt({ agentName, skills, workDir }) {
    return `You are ${agentName}, an AI agent working as part of a swarm to deliver software.

## Your Skills
${skills.map((s) => `- ${s}`).join('\n')}

## Working Directory
${workDir}

## Instructions
- Complete tasks thoroughly and correctly
- Write clean, well-documented code
- Run tests when appropriate
- Report any issues or blockers
- Learn from your work and share insights

## Output Format
When you complete a task, summarize:
1. What you did
2. Files created/modified/deleted
3. Any learnings or insights
4. Any remaining issues or suggestions`;
  },

  generateTaskPrompt({ task, context }) {
    let prompt = `## Task
**ID:** ${task.id}
**Title:** ${task.title}
**Priority:** ${task.priority}
**Type:** ${task.type}

${task.description || 'No description provided.'}`;

    if (task.files && task.files.length > 0) {
      prompt += `\n\n## Relevant Files\n${task.files.map((f) => `- ${f}`).join('\n')}`;
    }

    if (task.requiredSkills && task.requiredSkills.length > 0) {
      prompt += `\n\n## Required Skills\n${task.requiredSkills.map((s) => `- ${s}`).join('\n')}`;
    }

    if (context && context.length > 0) {
      prompt += `\n\n## Context from Previous Work\n${context.map((c) => `- ${c}`).join('\n')}`;
    }

    return prompt;
  },

  parseOutput(output) {
    // Simple parsing - adapters can override with more sophisticated parsing
    const filesCreated: string[] = [];
    const filesModified: string[] = [];
    const filesDeleted: string[] = [];
    const learnings: string[] = [];

    // Look for common patterns in output
    const createdMatch = output.match(/files?\s+created[:\s]+([^\n]+)/gi);
    const modifiedMatch = output.match(/files?\s+modified[:\s]+([^\n]+)/gi);
    const deletedMatch = output.match(/files?\s+deleted[:\s]+([^\n]+)/gi);
    const learningMatch = output.match(/learnings?[:\s]+([^\n]+)/gi);

    // Extract file paths (simplified)
    const extractPaths = (matches: RegExpMatchArray | null): string[] => {
      if (!matches) return [];
      return matches
        .flatMap((m) => m.split(/[,\n]/).map((p) => p.trim()))
        .filter((p) => p.includes('/') || p.includes('.'));
    };

    return {
      filesCreated: extractPaths(createdMatch),
      filesModified: extractPaths(modifiedMatch),
      filesDeleted: extractPaths(deletedMatch),
      learnings: learningMatch?.map((l) => l.replace(/learnings?[:\s]+/i, '').trim()),
    };
  },
};

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

export const ModelConfigSchema = z.object({
  provider: z.string(),
  model: z.string(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  timeoutMs: z.number().optional(),
  headers: z.record(z.string()).optional(),
  options: z.record(z.unknown()).optional(),
});

export const AgentHarnessConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['claude-code', 'codex', 'gemini', 'browser', 'custom']),
  skills: z.array(z.string()),
  workDir: z.string(),
  maxTaskMinutes: z.number().optional(),
  canRunTests: z.boolean().optional(),
  canRunBuild: z.boolean().optional(),
  canAccessBrowser: z.boolean().optional(),
  heartbeatIntervalMs: z.number().optional(),
  workPollingIntervalMs: z.number().optional(),
  machine: z
    .object({
      id: z.string(),
      hostname: z.string(),
    })
    .optional(),
});
