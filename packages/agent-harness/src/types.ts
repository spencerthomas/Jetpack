import { z } from 'zod';
import type { Task, TaskProgress, TaskResult, TaskFailure, AgentType, AgentStatus } from '@jetpack-agent/data';

// ============================================================================
// MODEL ADAPTER TYPES
// ============================================================================

/**
 * Configuration for a model adapter
 *
 * Defines the connection and behavior settings for interacting with
 * an AI model provider.
 */
export interface ModelConfig {
  /** Model provider identifier (claude, openai, gemini, codex, custom) */
  provider: string;
  /** Specific model ID to use (e.g., claude-3-5-sonnet-20241022) */
  model: string;
  /** API key or authentication token for the provider */
  apiKey?: string;
  /** Base URL for API calls (for custom endpoints) */
  baseUrl?: string;
  /** Maximum tokens to generate in a response */
  maxTokens?: number;
  /** Temperature setting for response generation (0-2, higher = more random) */
  temperature?: number;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Custom headers to include in API requests */
  headers?: Record<string, string>;
  /** Provider-specific options not covered by other fields */
  options?: Record<string, unknown>;
}

/**
 * Message in a conversation with the model
 *
 * Represents a single message in a conversation history, with a role
 * indicating who sent it and the content of the message.
 */
export interface ModelMessage {
  /** The role of the message sender */
  role: 'system' | 'user' | 'assistant';
  /** The content of the message */
  content: string;
}

/**
 * Request to execute a task
 *
 * Contains all the information needed to execute a task using a model adapter,
 * including the task itself, prompts, context, and execution constraints.
 */
export interface ExecutionRequest {
  /** The task to execute, including title, description, and requirements */
  task: Task;
  /** System prompt that sets the behavior and personality of the model */
  systemPrompt: string;
  /** Conversation history for multi-turn conversations */
  messages?: ModelMessage[];
  /** Relevant context from memory or previous work */
  context?: string[];
  /** Working directory for file operations */
  workDir: string;
  /** Maximum execution time in milliseconds */
  timeoutMs?: number;
}

/**
 * Result from model execution
 *
 * Contains the output of task execution, including success status,
 * generated content, file changes, and token usage statistics.
 */
export interface ExecutionResult {
  /** Whether the execution succeeded without errors */
  success: boolean;
  /** The primary output text from the model */
  output: string;
  /** Paths to files created during task execution */
  filesCreated: string[];
  /** Paths to files modified during task execution */
  filesModified: string[];
  /** Paths to files deleted during task execution */
  filesDeleted: string[];
  /** Insights or learnings gathered during the task */
  learnings?: string[];
  /** Error message if execution failed */
  error?: string;
  /** Total execution time in milliseconds */
  durationMs: number;
  /** Token usage statistics for the execution */
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Progress callback during execution
 *
 * Called periodically to report on the progress of a long-running task.
 *
 * @param progress - Task progress information including phase and percentage complete
 */
export type ProgressCallback = (progress: TaskProgress) => void;

/**
 * Output chunk callback for streaming
 *
 * Called as chunks of output are generated, enabling real-time display.
 *
 * @param chunk - A piece of generated output text
 */
export type OutputCallback = (chunk: string) => void;

/**
 * Interface that all model adapters must implement
 *
 * Model adapters provide a common interface for executing tasks with
 * different AI models and providers.
 */
export interface ModelAdapter {
  /** Provider name (e.g., 'claude-code', 'openai', 'gemini') */
  readonly provider: string;
  /** Model identifier (e.g., 'claude-3-5-sonnet-20241022') */
  readonly model: string;

  /**
   * Execute a task using this model
   *
   * @param request - The execution request containing task and prompts
   * @param onProgress - Optional callback for progress updates
   * @param onOutput - Optional callback for streaming output
   * @returns Promise resolving to the execution result
   */
  execute(
    request: ExecutionRequest,
    onProgress?: ProgressCallback,
    onOutput?: OutputCallback
  ): Promise<ExecutionResult>;

  /**
   * Check if the model is available and configured correctly
   *
   * @returns Promise resolving to true if the model can be used
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get estimated cost for a task (optional)
   *
   * @param task - The task to estimate cost for
   * @returns Promise resolving to input and output cost estimates
   */
  estimateCost?(task: Task): Promise<{ inputCost: number; outputCost: number }>;

  /**
   * Clean up any resources (optional)
   *
   * Called when the adapter is no longer needed to release resources
   * like open connections or spawned processes.
   *
   * @returns Promise resolving when cleanup is complete
   */
  close?(): Promise<void>;
}

// ============================================================================
// AGENT HARNESS TYPES
// ============================================================================

/**
 * Agent harness configuration
 *
 * Defines how an agent should behave, including its identity, capabilities,
 * and connection to a model adapter.
 */
export interface AgentHarnessConfig {
  /** Unique identifier for this agent within the swarm */
  id: string;
  /** Human-readable name for display purposes */
  name: string;
  /** Agent type identifier for swarm coordination */
  type: AgentType;
  /** The model adapter this agent uses to execute tasks */
  model: ModelAdapter;
  /** Skills/capabilities this agent can provide */
  skills: string[];
  /** Working directory for file operations */
  workDir: string;
  /** Maximum duration a task may run (in minutes) */
  maxTaskMinutes?: number;
  /** Whether this agent can run test suites */
  canRunTests?: boolean;
  /** Whether this agent can run build processes */
  canRunBuild?: boolean;
  /** Whether this agent can access browser automation */
  canAccessBrowser?: boolean;
  /** How often to send heartbeat signals (milliseconds) */
  heartbeatIntervalMs?: number;
  /** How often to poll for new work (milliseconds) */
  workPollingIntervalMs?: number;
  /** Information about the machine this agent is running on */
  machine?: {
    id: string;
    hostname: string;
  };
}

/**
 * Agent lifecycle events
 *
 * Events emitted by the agent during its lifecycle and task execution.
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
 * Callback function for agent events
 *
 * Registered listeners will be called whenever an agent emits an event.
 */
export type AgentEventCallback = (event: AgentEvent) => void;

/**
 * Agent runtime statistics
 *
 * Current status and performance metrics for an agent.
 */
export interface AgentStats {
  /** Total number of tasks successfully completed */
  tasksCompleted: number;
  /** Total number of tasks that failed */
  tasksFailed: number;
  /** Total time spent on tasks (in minutes) */
  totalRuntimeMinutes: number;
  /** ID of the currently executing task, if any */
  currentTaskId: string | null;
  /** When the current task was started, if any */
  currentTaskStartedAt: Date | null;
  /** When the last heartbeat was sent */
  lastHeartbeat: Date | null;
  /** Current agent status */
  status: AgentStatus;
}

// ============================================================================
// PROMPT TEMPLATES
// ============================================================================

/**
 * Template for generating system and task prompts
 *
 * Defines how prompts should be formatted for a given model adapter.
 * Custom implementations can provide specialized prompt templates
 * for different models or use cases.
 */
export interface PromptTemplate {
  /**
   * Generate a system prompt for an agent
   *
   * @param config - Configuration including agent name, skills, and work directory
   * @returns A formatted system prompt string
   */
  generateSystemPrompt(config: {
    agentName: string;
    skills: string[];
    workDir: string;
  }): string;

  /**
   * Generate a task-specific prompt
   *
   * @param config - Configuration including the task and optional context
   * @returns A formatted task prompt string
   */
  generateTaskPrompt(config: {
    task: Task;
    context?: string[];
  }): string;

  /**
   * Parse model output to extract structured results
   *
   * Attempts to extract file operations and learnings from the
   * model's output text using pattern matching.
   *
   * @param output - The raw output text from the model
   * @returns Partial execution result with extracted information
   */
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
