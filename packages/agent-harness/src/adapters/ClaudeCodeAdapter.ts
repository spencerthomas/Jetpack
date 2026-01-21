import { spawn } from 'child_process';
import fs from 'fs';
import type {
  ModelConfig,
  ExecutionRequest,
  ExecutionResult,
  ProgressCallback,
  OutputCallback,
} from '../types.js';
import { BaseAdapter } from './BaseAdapter.js';
import { TIMING, PROGRESS_STAGES } from '../constants.js';

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
  /** Agent for the session (--agent) */
  agent?: string;
  /** Timeout in milliseconds (overrides default) */
  timeout?: number;
  /** Path to settings file or JSON string (--settings) */
  settings?: string;
  /** Enable verbose output (--verbose) */
  verbose?: boolean;
  /** MCP configuration paths (--mcp-config) */
  mcpConfig?: string[];
  /** Provider configuration */
  providerConfig?: {
    baseUrl?: string;
    authToken?: string;
    apiKey?: string;
  };
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
  declare config: ClaudeCodeConfig; // Override config type

  constructor(config: ClaudeCodeConfig) {
    super({ ...config, provider: config.providerConfig?.baseUrl ? 'claude-code-custom' : 'claude-code' });
    this.cliPath = config.cliPath ?? 'claude';
    this.flags = config.flags ?? [];
    this.dangerouslySkipPermissions = config.dangerouslySkipPermissions ?? true;
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    this.validateCliPath(this.cliPath);

    return new Promise((resolve) => {
      const proc = spawn(this.cliPath, ['--version'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });

      let output = '';
      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        resolve(code === 0 && output.toLowerCase().includes('claude'));
      });

      proc.on('error', () => {
        resolve(false);
      });

      // Setup timeout
      const clearTimeoutFn = this.setupProcessTimeout(
        proc,
        TIMING.VERSION_CHECK_TIMEOUT_MS,
        () => resolve(false)
      );
      proc.on('close', () => clearTimeoutFn());
    });
  }

  async execute(
    request: ExecutionRequest,
    onProgress?: ProgressCallback,
    onOutput?: OutputCallback
  ): Promise<ExecutionResult> {
    this.validateCliPath(this.cliPath);

    const startTime = Date.now();

    // Build the prompt
    // For Claude Code, we typically want the task description and context
    // The system prompt is often handled by the CLI itself, but we can prepend it if needed
    const prompt = `${request.systemPrompt}\n\n${request.messages?.map((m) => `${m.role}: ${m.content}`).join('\n\n') ?? ''}`;

    // Build CLI arguments
    const args: string[] = ['--print'];

    if (this.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    if (this.config.verbose) {
      args.push('--verbose');
    }

    if (this.config.agent) {
      args.push('--agent', this.config.agent);
    }

    if (this.config.settings) {
      args.push('--settings', this.config.settings);
    }

    if (this.config.mcpConfig && this.config.mcpConfig.length > 0) {
      args.push('--mcp-config', ...this.config.mcpConfig);
    }

    // Model override
    if (this.config.model && this.config.model !== 'claude-cli') {
      args.push('--model', this.config.model);
    }

    args.push(...this.flags);
    args.push(prompt);

    // Prepare environment variables
    const env: NodeJS.ProcessEnv = {
      ...process.env,
    };

    // Sanitize literal empty quotes from env if present
    if (env.ANTHROPIC_API_KEY === '""' || env.ANTHROPIC_API_KEY === "''") {
      delete env.ANTHROPIC_API_KEY;
    }

    const logPath = `${process.cwd()}/claude_env_debug.log`;
    try {
      fs.appendFileSync(logPath, `--- NEW EXECUTION --- ${new Date().toISOString()}\n${JSON.stringify({
        baseUrl: this.config.providerConfig?.baseUrl,
        hasAuthToken: !!this.config.providerConfig?.authToken,
        hasApiKey: !!this.config.providerConfig?.apiKey,
        envKeyBefore: env.ANTHROPIC_API_KEY === undefined ? 'undefined' : (env.ANTHROPIC_API_KEY === '' ? 'EMPTY' : JSON.stringify(env.ANTHROPIC_API_KEY))
      }, null, 2)}\n`);
    } catch (e) {
      console.error('Failed to write debug log:', e);
    }

    if (this.config.providerConfig?.baseUrl) {
      env.ANTHROPIC_BASE_URL = this.config.providerConfig.baseUrl;
    }

    if (this.config.providerConfig?.authToken) {
      env.ANTHROPIC_AUTH_TOKEN = this.config.providerConfig.authToken;
    }

    // Always ensure API key is handled. 
    // If using alternative provider with auth token, API key should usually be empty string.
    // Always ensure API key is handled. 
    // If using alternative provider with auth token (OpenRouter), ANTHROPIC_API_KEY MUST be unset.
    if (env.ANTHROPIC_AUTH_TOKEN) {
      delete env.ANTHROPIC_API_KEY;
    } else if (this.config.providerConfig?.apiKey) {
      env.ANTHROPIC_API_KEY = this.config.providerConfig.apiKey;
    } else if (this.config.apiKey) {
      env.ANTHROPIC_API_KEY = this.config.apiKey;
    }

    try {
      fs.appendFileSync(logPath, `FINAL ENV:\n${JSON.stringify({
        ANTHROPIC_BASE_URL: env.ANTHROPIC_BASE_URL,
        ANTHROPIC_AUTH_TOKEN: env.ANTHROPIC_AUTH_TOKEN ? 'SET' : 'MISSING',
        ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY === undefined ? 'UNDEFINED' : (env.ANTHROPIC_API_KEY === '' ? 'EMPTY' : 'SET')
      }, null, 2)}\n\n`);
    } catch (e) { }

    if (this.config.verbose) {
      console.log('--- Claude Code Adapter Values ---');
      console.log('CLI Path:', this.cliPath);
      console.log('Args:', args.join(' '));
    }

    return new Promise((resolve) => {
      const proc = spawn(this.cliPath, args, {
        cwd: request.workDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
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
          onProgress?.(PROGRESS_STAGES[0]);
        } else if (chunk.includes('Planning') || chunk.includes('Thinking')) {
          onProgress?.(PROGRESS_STAGES[1]);
        } else if (chunk.includes('Writing') || chunk.includes('Creating')) {
          onProgress?.(PROGRESS_STAGES[2]);
        } else if (chunk.includes('Testing') || chunk.includes('Running')) {
          onProgress?.(PROGRESS_STAGES[3]);
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
      const timeoutMs = request.timeoutMs ?? this.config.timeout ?? TIMING.DEFAULT_TIMEOUT_MS;
      const clearTimeoutFn = this.setupProcessTimeout(
        proc,
        timeoutMs,
        (error) => {
          resolve({
            success: false,
            output: stdout,
            filesCreated: [],
            filesModified: [],
            filesDeleted: [],
            error: error.message,
            durationMs: Date.now() - startTime,
          });
        }
      );

      proc.on('close', (code) => {
        clearTimeoutFn();

        const durationMs = Date.now() - startTime;
        const files = this.parseFilesFromOutput(stdout);

        // Check for success indicators
        const success =
          code === 0 &&
          !stderr.toLowerCase().includes('error') &&
          !stderr.toLowerCase().includes('failed');

        if (!success) {
          console.error(`[ClaudeAdapter] Process failed with code ${code}`);
          console.error(`[ClaudeAdapter] STDERR:\n${stderr}`);
          console.error(`[ClaudeAdapter] STDOUT:\n${stdout}`);
        }

        resolve({
          success,
          output: stdout,
          filesCreated: files.filesCreated,
          filesModified: files.filesModified,
          filesDeleted: files.filesDeleted,
          error: success ? undefined : (stderr || stdout || `Process exited with code ${code}`),
          durationMs,
          tokenUsage:
            inputTokens > 0 || outputTokens > 0
              ? { inputTokens, outputTokens }
              : undefined,
        });
      });

      proc.on('error', (err) => {
        clearTimeoutFn();
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
