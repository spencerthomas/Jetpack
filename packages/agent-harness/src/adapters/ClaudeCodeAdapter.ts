import { spawn } from 'child_process';
import type {
  ModelConfig,
  ExecutionRequest,
  ExecutionResult,
  ProgressCallback,
  OutputCallback,
} from '../types.js';
import { BaseAdapter } from './BaseAdapter.js';

/**
 * Configuration specific to Claude Code CLI
 */
export interface ClaudeCodeConfig extends ModelConfig {
  /** Path to claude CLI binary (default: 'claude') */
  cliPath?: string;
  /** Additional CLI flags */
  flags?: string[];
  /** Skip permission prompts */
  dangerouslySkipPermissions?: boolean;
}

/**
 * Adapter for Claude Code CLI
 *
 * Spawns the 'claude' CLI to execute tasks. This is the native way
 * to use Claude for coding tasks.
 */
export class ClaudeCodeAdapter extends BaseAdapter {
  private cliPath: string;
  private flags: string[];
  private dangerouslySkipPermissions: boolean;

  constructor(config: ClaudeCodeConfig) {
    super({ ...config, provider: 'claude-code' });
    this.cliPath = config.cliPath ?? 'claude';
    this.flags = config.flags ?? [];
    this.dangerouslySkipPermissions = config.dangerouslySkipPermissions ?? true;
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(this.cliPath, ['--version'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });

      let output = '';
      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        resolve(code === 0 && output.includes('claude'));
      });

      proc.on('error', () => {
        resolve(false);
      });

      // Timeout
      setTimeout(() => {
        proc.kill();
        resolve(false);
      }, 5000);
    });
  }

  async execute(
    request: ExecutionRequest,
    onProgress?: ProgressCallback,
    onOutput?: OutputCallback
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Build the prompt
    const prompt = `${request.systemPrompt}

${request.messages?.map((m) => `${m.role}: ${m.content}`).join('\n\n') ?? ''}`;

    // Build CLI arguments
    const args: string[] = ['--print'];

    if (this.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    args.push(...this.flags);
    args.push(prompt);

    return new Promise((resolve) => {
      const proc = spawn(this.cliPath, args, {
        cwd: request.workDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Pass through API key if set
          ...(this.config.apiKey ? { ANTHROPIC_API_KEY: this.config.apiKey } : {}),
        },
      });

      let stdout = '';
      let stderr = '';
      let inputTokens = 0;
      let outputTokens = 0;

      proc.stdout?.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        onOutput?.(chunk);

        // Try to extract progress from output
        if (chunk.includes('Reading') || chunk.includes('Analyzing')) {
          onProgress?.({
            phase: 'analyzing',
            percentComplete: 20,
            description: 'Analyzing codebase',
          });
        } else if (chunk.includes('Planning') || chunk.includes('Thinking')) {
          onProgress?.({
            phase: 'planning',
            percentComplete: 40,
            description: 'Planning implementation',
          });
        } else if (chunk.includes('Writing') || chunk.includes('Creating')) {
          onProgress?.({
            phase: 'implementing',
            percentComplete: 60,
            description: 'Implementing changes',
          });
        } else if (chunk.includes('Testing') || chunk.includes('Running')) {
          onProgress?.({
            phase: 'testing',
            percentComplete: 80,
            description: 'Running tests',
          });
        }

        // Extract token usage if available
        const tokenMatch = chunk.match(
          /(\d+)\s*input\s*tokens.*?(\d+)\s*output\s*tokens/i
        );
        if (tokenMatch) {
          inputTokens = parseInt(tokenMatch[1], 10);
          outputTokens = parseInt(tokenMatch[2], 10);
        }
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Set up timeout
      const timeoutMs = request.timeoutMs ?? this.config.timeoutMs ?? 30 * 60 * 1000;
      const timeout = setTimeout(() => {
        proc.kill('SIGTERM');
        setTimeout(() => proc.kill('SIGKILL'), 5000);
      }, timeoutMs);

      proc.on('close', (code) => {
        clearTimeout(timeout);

        const durationMs = Date.now() - startTime;
        const files = this.parseFilesFromOutput(stdout);

        // Check for success indicators
        const success =
          code === 0 &&
          !stderr.toLowerCase().includes('error') &&
          !stderr.toLowerCase().includes('failed');

        resolve({
          success,
          output: stdout,
          filesCreated: files.filesCreated,
          filesModified: files.filesModified,
          filesDeleted: files.filesDeleted,
          error: success ? undefined : stderr || `Process exited with code ${code}`,
          durationMs,
          tokenUsage:
            inputTokens > 0 || outputTokens > 0
              ? { inputTokens, outputTokens }
              : undefined,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          output: stdout,
          filesCreated: [],
          filesModified: [],
          filesDeleted: [],
          error: err.message,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }
}

/**
 * Create a Claude Code adapter with default configuration
 */
export function createClaudeCodeAdapter(
  options: Partial<ClaudeCodeConfig> = {}
): ClaudeCodeAdapter {
  return new ClaudeCodeAdapter({
    provider: 'claude-code',
    model: 'claude-cli',
    ...options,
  });
}
