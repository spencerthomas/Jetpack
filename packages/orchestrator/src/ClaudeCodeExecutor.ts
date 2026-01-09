import { spawn, ChildProcess } from 'child_process';
import { Task, Logger, MemoryEntry } from '@jetpack/shared';

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  duration: number;
}

export interface ExecutionContext {
  task: Task;
  memories: MemoryEntry[];
  workDir: string;
  agentName: string;
  agentSkills: string[];
}

export class ClaudeCodeExecutor {
  private logger: Logger;
  private currentProcess?: ChildProcess;
  private defaultWorkDir: string;

  constructor(workDir: string) {
    this.defaultWorkDir = workDir;
    this.logger = new Logger('ClaudeCodeExecutor');
  }

  /**
   * Execute a task using Claude Code CLI
   */
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();
    const prompt = this.buildPrompt(context);
    const workDir = context.workDir || this.defaultWorkDir;

    this.logger.info(`Executing task: ${context.task.title}`);
    this.logger.debug(`Prompt length: ${prompt.length} chars`);

    try {
      const output = await this.runClaudeCode(prompt, workDir);
      const duration = Date.now() - startTime;

      this.logger.info(`Task completed in ${duration}ms`);

      return {
        success: true,
        output,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(`Task failed: ${errorMessage}`);

      return {
        success: false,
        output: '',
        error: errorMessage,
        duration,
      };
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
      const args = [
        '--print',  // Non-interactive, output only
        '--dangerously-skip-permissions',  // Allow file operations
        prompt,
      ];

      this.logger.debug(`Spawning: claude ${args.slice(0, 2).join(' ')} "<prompt>"`);

      this.currentProcess = spawn('claude', args, {
        cwd: workDir,
        env: {
          ...process.env,
          // Ensure Claude Code uses the same environment
          FORCE_COLOR: '0',  // Disable colors for cleaner output
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

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
   * Kill the current Claude Code process if running
   */
  abort(): void {
    if (this.currentProcess) {
      this.logger.warn('Aborting Claude Code execution');
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = undefined;
    }
  }
}
