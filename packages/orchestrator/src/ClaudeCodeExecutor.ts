import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Task, Logger, MemoryEntry, ExecutionOutputEvent, AgentSkill } from '@jetpack-agent/shared';
import { buildAgentPrompt, getSkillSpecificInstructions } from './prompts/agent-system';

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  duration: number;
  timedOut?: boolean;
}

export interface ExecutionContext {
  task: Task;
  memories: MemoryEntry[];
  workDir: string;
  agentId: string;
  agentName: string;
  agentSkills: string[];
}

export interface ExecutorConfig {
  /** Maximum execution time in ms (default: 30 minutes) - used as fallback if task has no estimate */
  timeoutMs?: number;
  /** Time to wait after SIGTERM before sending SIGKILL (default: 30 seconds) */
  gracefulShutdownMs?: number;
  /** Emit events for TUI consumption instead of writing to stdout directly */
  emitOutputEvents?: boolean;
  // BUG-6 FIX: Dynamic timeout configuration
  /** Multiplier for task.estimatedMinutes to calculate timeout (default: 2.0) */
  timeoutMultiplier?: number;
  /** Minimum timeout in ms regardless of estimate (default: 5 minutes) */
  minTimeoutMs?: number;
  /** Maximum timeout in ms regardless of estimate (default: 2 hours) */
  maxTimeoutMs?: number;
  /** Enable TDD-biased system prompt (default: true) - Enhancement 6 */
  enableTddPrompt?: boolean;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes (fallback for tasks without estimates)
const DEFAULT_GRACEFUL_SHUTDOWN_MS = 30 * 1000; // 30 seconds (BUG-7 FIX: increased from 10s)
// BUG-6 FIX: Dynamic timeout constants
const DEFAULT_TIMEOUT_MULTIPLIER = 2.0; // Task gets 2x estimated time
const DEFAULT_MIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes minimum
const DEFAULT_MAX_TIMEOUT_MS = 120 * 60 * 1000; // 2 hours maximum

export class ClaudeCodeExecutor extends EventEmitter {
  private logger: Logger;
  private currentProcess?: ChildProcess;
  private defaultWorkDir: string;
  private timeoutMs: number;
  private gracefulShutdownMs: number;
  private executionTimeout?: NodeJS.Timeout;
  private killTimeout?: NodeJS.Timeout;
  private sigintTimeout?: NodeJS.Timeout; // BUG-7 FIX: For 3-stage termination
  private emitOutputEvents: boolean;
  private currentContext?: ExecutionContext;
  // BUG-6 FIX: Dynamic timeout config
  private timeoutMultiplier: number;
  private minTimeoutMs: number;
  private maxTimeoutMs: number;
  // Enhancement 6: TDD-biased prompt
  private enableTddPrompt: boolean;

  constructor(workDir: string, config: ExecutorConfig = {}) {
    super();
    this.defaultWorkDir = workDir;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.gracefulShutdownMs = config.gracefulShutdownMs ?? DEFAULT_GRACEFUL_SHUTDOWN_MS;
    this.emitOutputEvents = config.emitOutputEvents ?? false;
    // BUG-6 FIX: Dynamic timeout configuration
    this.timeoutMultiplier = config.timeoutMultiplier ?? DEFAULT_TIMEOUT_MULTIPLIER;
    this.minTimeoutMs = config.minTimeoutMs ?? DEFAULT_MIN_TIMEOUT_MS;
    this.maxTimeoutMs = config.maxTimeoutMs ?? DEFAULT_MAX_TIMEOUT_MS;
    // Enhancement 6: TDD-biased prompt (enabled by default)
    this.enableTddPrompt = config.enableTddPrompt ?? true;
    this.logger = new Logger('ClaudeCodeExecutor');
  }

  /**
   * BUG-6 FIX: Calculate dynamic timeout based on task.estimatedMinutes
   * Uses multiplier to give tasks breathing room (default: 2x estimate)
   */
  private calculateTimeout(task: Task): number {
    // If task has an estimate, use it with multiplier
    if (task.estimatedMinutes && task.estimatedMinutes > 0) {
      const calculated = task.estimatedMinutes * 60 * 1000 * this.timeoutMultiplier;
      const timeout = Math.max(this.minTimeoutMs, Math.min(this.maxTimeoutMs, calculated));
      this.logger.debug(
        `Task ${task.id}: estimated ${task.estimatedMinutes}m × ${this.timeoutMultiplier} = ${Math.round(timeout / 60000)}m timeout`
      );
      return timeout;
    }

    // Fallback: heuristic based on task complexity indicators
    let baseTimeout = this.timeoutMs;
    const descLength = task.description?.length ?? 0;
    const skillCount = task.requiredSkills?.length ?? 0;

    // Longer descriptions suggest more complex tasks
    if (descLength > 1000) {
      baseTimeout *= 1.5;
    } else if (descLength > 500) {
      baseTimeout *= 1.25;
    }

    // More required skills suggest more complex tasks
    if (skillCount > 3) {
      baseTimeout *= 1.25;
    }

    const finalTimeout = Math.min(this.maxTimeoutMs, baseTimeout);
    this.logger.debug(
      `Task ${task.id}: no estimate, using heuristic timeout of ${Math.round(finalTimeout / 60000)}m`
    );
    return finalTimeout;
  }

  /**
   * Execute a task using Claude Code CLI with timeout protection
   */
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();
    const prompt = this.buildPrompt(context);
    const workDir = context.workDir || this.defaultWorkDir;

    // Store context for event emission
    this.currentContext = context;

    // BUG-6 FIX: Calculate dynamic timeout based on task estimate
    const taskTimeout = this.calculateTimeout(context.task);

    this.logger.info(`Executing task: ${context.task.title}`);
    this.logger.debug(`Prompt length: ${prompt.length} chars, timeout: ${Math.round(taskTimeout / 60000)}m`);

    // Create a timeout promise that will abort the execution
    let timedOut = false;
    const timeoutPromise = new Promise<never>((_, reject) => {
      this.executionTimeout = setTimeout(() => {
        timedOut = true;
        this.logger.warn(`Task execution timed out after ${Math.round(taskTimeout / 60000)} minutes`);
        this.abort();
        reject(new Error(`Task execution timed out after ${Math.round(taskTimeout / 60000)} minutes`));
      }, taskTimeout);
    });

    try {
      // Race between execution and timeout
      const output = await Promise.race([
        this.runClaudeCode(prompt, workDir),
        timeoutPromise,
      ]);

      // Clear timeout if execution completed
      this.clearTimeouts();
      const duration = Date.now() - startTime;

      this.logger.info(`Task completed in ${duration}ms`);

      return {
        success: true,
        output,
        duration,
      };
    } catch (error) {
      this.clearTimeouts();
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(`Task failed: ${errorMessage}`);

      return {
        success: false,
        output: '',
        error: errorMessage,
        duration,
        timedOut,
      };
    }
  }

  /**
   * Clear all pending timeouts
   */
  private clearTimeouts(): void {
    if (this.executionTimeout) {
      clearTimeout(this.executionTimeout);
      this.executionTimeout = undefined;
    }
    if (this.killTimeout) {
      clearTimeout(this.killTimeout);
      this.killTimeout = undefined;
    }
    // BUG-7 FIX: Also clear SIGINT timeout
    if (this.sigintTimeout) {
      clearTimeout(this.sigintTimeout);
      this.sigintTimeout = undefined;
    }
  }

  /**
   * Build a prompt for Claude Code from task context
   * Enhancement 6: Now uses TDD-biased prompt builder
   */
  private buildPrompt(context: ExecutionContext): string {
    const { task, memories, agentName, agentSkills } = context;

    // Use the new TDD-biased prompt builder if enabled
    if (this.enableTddPrompt) {
      let prompt = buildAgentPrompt({
        task,
        agentName,
        agentSkills: agentSkills as AgentSkill[],
        memories,
        includeTddPrompt: true,
      });

      // Add skill-specific guidelines
      const skillInstructions = getSkillSpecificInstructions(agentSkills as AgentSkill[]);
      if (skillInstructions) {
        prompt += '\n' + skillInstructions;
      }

      return prompt;
    }

    // Legacy prompt (fallback if TDD prompt is disabled)
    let prompt = `You are ${agentName}, an AI agent with skills in: ${agentSkills.join(', ')}.

## Task
**Title:** ${task.title}
**Priority:** ${task.priority}
**Required Skills:** ${task.requiredSkills.join(', ') || 'general'}
`;

    if (task.description) {
      prompt += `\n**Description:**\n${task.description}\n`;
    }

    // Add relevant memories as context
    if (memories.length > 0) {
      prompt += `\n## Relevant Context from Previous Work\n`;
      for (const memory of memories) {
        prompt += `- ${memory.content}\n`;
      }
    }

    prompt += `
## Instructions
Complete this task by making the necessary code changes. Follow these guidelines:
1. Analyze the requirements carefully
2. Make targeted, minimal changes
3. Follow existing code patterns and conventions
4. Test your changes if applicable
5. Do not make changes outside the scope of this task

When done, provide a brief summary of what you accomplished.
`;

    return prompt;
  }

  /**
   * Spawn Claude Code CLI and run the prompt
   */
  private runClaudeCode(prompt: string, workDir: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Use claude CLI with --print flag for non-interactive mode
      // and --dangerously-skip-permissions to allow file changes
      // Pass prompt via stdin to avoid command line length limits
      const args = [
        '--print',  // Non-interactive, output only
        '--dangerously-skip-permissions',  // Allow file operations
      ];

      this.logger.debug(`Spawning: claude ${args.join(' ')} (prompt via stdin)`);

      this.currentProcess = spawn('claude', args, {
        cwd: workDir,
        env: {
          ...process.env,
          // Ensure Claude Code uses the same environment
          FORCE_COLOR: '0',  // Disable colors for cleaner output
          // Propagate JETPACK_WORK_DIR so Claude Code knows the project directory
          JETPACK_WORK_DIR: workDir,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Write prompt to stdin and close it
      if (this.currentProcess.stdin) {
        this.currentProcess.stdin.write(prompt);
        this.currentProcess.stdin.end();
      }

      let stdout = '';
      let stderr = '';

      this.currentProcess.stdout?.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;

        // Emit output event for TUI if enabled
        if (this.emitOutputEvents && this.currentContext) {
          const event: ExecutionOutputEvent = {
            agentId: this.currentContext.agentId,
            agentName: this.currentContext.agentName,
            taskId: this.currentContext.task.id,
            taskTitle: this.currentContext.task.title,
            chunk,
            stream: 'stdout',
            timestamp: new Date(),
          };
          this.emit('output', event);
        } else {
          // Fallback: Log progress in real-time to stdout
          process.stdout.write(chunk);
        }
      });

      this.currentProcess.stderr?.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;

        // Emit output event for TUI if enabled
        if (this.emitOutputEvents && this.currentContext) {
          const event: ExecutionOutputEvent = {
            agentId: this.currentContext.agentId,
            agentName: this.currentContext.agentName,
            taskId: this.currentContext.task.id,
            taskTitle: this.currentContext.task.title,
            chunk,
            stream: 'stderr',
            timestamp: new Date(),
          };
          this.emit('output', event);
        } else {
          // Fallback: Log errors in real-time to stderr
          process.stderr.write(chunk);
        }
      });

      this.currentProcess.on('close', (code) => {
        this.currentProcess = undefined;

        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Claude Code exited with code ${code}: ${stderr || stdout}`));
        }
      });

      this.currentProcess.on('error', (error) => {
        this.currentProcess = undefined;
        reject(new Error(`Failed to spawn Claude Code: ${error.message}`));
      });
    });
  }

  /**
   * Kill the current Claude Code process if running.
   * BUG-7 FIX: Uses 3-stage termination for graceful shutdown:
   * 1. SIGINT (5s) - Allow Claude to save state
   * 2. SIGTERM (gracefulShutdownMs) - Standard shutdown request
   * 3. SIGKILL - Force kill if unresponsive
   */
  abort(): void {
    if (!this.currentProcess) {
      return;
    }

    const proc = this.currentProcess;
    const pid = proc.pid;

    this.logger.warn(`Aborting Claude Code execution (pid: ${pid}) - starting 3-stage termination`);

    // Stage 1: SIGINT - Allow Claude to save state (like Ctrl+C)
    this.logger.debug(`Stage 1: Sending SIGINT to process ${pid}`);
    try {
      proc.kill('SIGINT');
    } catch (error) {
      this.logger.debug(`SIGINT failed (process may have already exited):`, error);
      return;
    }

    // Stage 2: SIGTERM after 5 seconds if still running
    this.sigintTimeout = setTimeout(() => {
      if (proc.killed) {
        this.logger.debug(`Process ${pid} terminated after SIGINT`);
        return;
      }

      this.logger.debug(`Stage 2: Sending SIGTERM to process ${pid}`);
      try {
        proc.kill('SIGTERM');
      } catch (error) {
        this.logger.debug(`SIGTERM failed:`, error);
        return;
      }

      // Stage 3: SIGKILL after gracefulShutdownMs if still running
      this.killTimeout = setTimeout(() => {
        if (proc.killed) {
          this.logger.debug(`Process ${pid} terminated after SIGTERM`);
          return;
        }

        this.logger.warn(`Stage 3: Process ${pid} did not terminate after ${this.gracefulShutdownMs}ms, sending SIGKILL`);
        try {
          proc.kill('SIGKILL');
        } catch (error) {
          this.logger.debug(`SIGKILL failed (process likely already exited):`, error);
        }
      }, this.gracefulShutdownMs);

    }, 5000); // 5 seconds for SIGINT stage

    // Listen for exit to clear all timeouts
    proc.once('exit', () => {
      if (this.sigintTimeout) {
        clearTimeout(this.sigintTimeout);
        this.sigintTimeout = undefined;
      }
      if (this.killTimeout) {
        clearTimeout(this.killTimeout);
        this.killTimeout = undefined;
      }
      this.currentProcess = undefined;
    });
  }

  /**
   * Force kill the process immediately without graceful shutdown
   */
  forceKill(): void {
    if (this.currentProcess) {
      const pid = this.currentProcess.pid;
      this.logger.warn(`Force killing Claude Code execution (pid: ${pid})`);
      this.clearTimeouts();
      this.currentProcess.kill('SIGKILL');
      this.currentProcess = undefined;
    }
  }

  /**
   * Check if there's currently an execution in progress
   */
  isExecuting(): boolean {
    return this.currentProcess !== undefined;
  }
}
