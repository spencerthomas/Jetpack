import { spawn, ChildProcess } from 'child_process';
import { Task, Logger, MemoryEntry } from '@jetpack/shared';

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
  agentName: string;
  agentSkills: string[];
}

export interface ExecutorConfig {
  /** Maximum execution time in ms (default: 5 minutes) */
  timeoutMs?: number;
  /** Time to wait after SIGTERM before sending SIGKILL (default: 10 seconds) */
  gracefulShutdownMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes (increased from 5 minutes for complex tasks)
const DEFAULT_GRACEFUL_SHUTDOWN_MS = 10 * 1000; // 10 seconds

export class ClaudeCodeExecutor {
  private logger: Logger;
  private currentProcess?: ChildProcess;
  private defaultWorkDir: string;
  private timeoutMs: number;
  private gracefulShutdownMs: number;
  private executionTimeout?: NodeJS.Timeout;
  private killTimeout?: NodeJS.Timeout;

  constructor(workDir: string, config: ExecutorConfig = {}) {
    this.defaultWorkDir = workDir;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.gracefulShutdownMs = config.gracefulShutdownMs ?? DEFAULT_GRACEFUL_SHUTDOWN_MS;
    this.logger = new Logger('ClaudeCodeExecutor');
  }

  /**
   * Execute a task using Claude Code CLI with timeout protection
   */
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();
    const prompt = this.buildPrompt(context);
    const workDir = context.workDir || this.defaultWorkDir;

    this.logger.info(`Executing task: ${context.task.title}`);
    this.logger.debug(`Prompt length: ${prompt.length} chars, timeout: ${this.timeoutMs}ms`);

    // Create a timeout promise that will abort the execution
    let timedOut = false;
    const timeoutPromise = new Promise<never>((_, reject) => {
      this.executionTimeout = setTimeout(() => {
        timedOut = true;
        this.logger.warn(`Task execution timed out after ${this.timeoutMs}ms`);
        this.abort();
        reject(new Error(`Task execution timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
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
  }

  /**
   * Build a prompt for Claude Code from task context
   */
  private buildPrompt(context: ExecutionContext): string {
    const { task, memories, agentName, agentSkills } = context;

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
        // Log progress in real-time
        process.stdout.write(chunk);
      });

      this.currentProcess.stderr?.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        // Log errors in real-time
        process.stderr.write(chunk);
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
   * First sends SIGTERM for graceful shutdown, then SIGKILL after timeout.
   */
  abort(): void {
    if (!this.currentProcess) {
      return;
    }

    const proc = this.currentProcess;
    const pid = proc.pid;

    this.logger.warn(`Aborting Claude Code execution (pid: ${pid})`);

    // First try graceful termination
    proc.kill('SIGTERM');

    // Set up SIGKILL fallback if process doesn't terminate
    this.killTimeout = setTimeout(() => {
      // Check if process is still running
      if (proc.killed) {
        this.logger.debug(`Process ${pid} already terminated`);
        return;
      }

      this.logger.warn(`Process ${pid} did not terminate after ${this.gracefulShutdownMs}ms, sending SIGKILL`);

      try {
        proc.kill('SIGKILL');
      } catch (error) {
        // Process might have already exited
        this.logger.debug(`SIGKILL failed (process likely already exited):`, error);
      }
    }, this.gracefulShutdownMs);

    // Also listen for exit to clear the kill timeout
    proc.once('exit', () => {
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
