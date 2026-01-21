import type { ChildProcess } from 'child_process';
import type {
  ModelAdapter,
  ModelConfig,
  ExecutionRequest,
  ExecutionResult,
  ProgressCallback,
  OutputCallback,
} from '../types.js';
import { TIMING } from '../constants.js';

/**
 * Base class for model adapters with common functionality
 */
export abstract class BaseAdapter implements ModelAdapter {
  protected config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  get model(): string {
    return this.config.model;
  }

  abstract execute(
    request: ExecutionRequest,
    onProgress?: ProgressCallback,
    onOutput?: OutputCallback
  ): Promise<ExecutionResult>;

  abstract isAvailable(): Promise<boolean>;

  async close(): Promise<void> {
    // Default: nothing to clean up
  }

  /**
   * Create a timeout promise
   */
  protected createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Execution timed out after ${ms}ms`)), ms);
    });
  }

  /**
   * Execute with timeout
   */
  protected async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([promise, this.createTimeout(timeoutMs)]);
  }

  /**
   * Set up timeout handling for a child process
   *
   * Uses SIGTERM first, then SIGKILL after a grace period if the process
   * doesn't terminate gracefully. Clears the timeout when the process closes.
   *
   * @param proc - The child process to timeout
   * @param timeoutMs - Timeout in milliseconds
   * @param onTimeout - Optional callback when timeout occurs
   * @returns A cleanup function that should be called when the process closes
   */
  protected setupProcessTimeout(
    proc: ChildProcess,
    timeoutMs: number,
    onTimeout?: (error: Error) => void
  ): () => void {
    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');

      // Force kill after grace period
      const killTimeout = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Process already gone
        }
      }, TIMING.KILL_GRACE_PERIOD_MS);

      // Track kill timeout for cleanup
      (timeout as any)._killTimeout = killTimeout;

      if (onTimeout) {
        onTimeout(new Error(`Process timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    // Return cleanup function
    return () => {
      clearTimeout(timeout);
      const killTimeout = (timeout as any)._killTimeout;
      if (killTimeout) {
        clearTimeout(killTimeout);
      }
    };
  }

  /**
   * Validate a CLI path for security
   *
   * Checks for shell injection attempts and path traversal.
   * Throws an error if the path is invalid.
   *
   * @param path - The CLI path to validate
   * @throws Error if the path contains shell metacharacters
   */
  protected validateCliPath(path: string): void {
    // Check for shell injection attempts
    const shellInjectionPattern = /[;&|`$()]/;
    if (shellInjectionPattern.test(path)) {
      throw new Error(`Invalid CLI path: contains shell metacharacters: ${path}`);
    }

    // Check for command substitution patterns
    const cmdSubPattern = /\$\([^)]*\)|`[^`]*`/;
    if (cmdSubPattern.test(path)) {
      throw new Error(`Invalid CLI path: contains command substitution: ${path}`);
    }

    // Warn if path is not absolute and not a simple command name
    if (path.includes('/') && !path.startsWith('/') && !path.startsWith('./')) {
      console.warn(`CLI path is relative: ${path}. Consider using an absolute path.`);
    }
  }

  /**
   * Parse common patterns from output to extract file operations
   *
   * Looks for patterns indicating files were created, modified, or deleted.
   * Uses regex to match file paths in quotes or backticks.
   *
   * @param output - The command output to parse
   * @returns Object with arrays of created, modified, and deleted files
   */
  protected parseFilesFromOutput(output: string): {
    filesCreated: string[];
    filesModified: string[];
    filesDeleted: string[];
  } {
    const filesCreated: string[] = [];
    const filesModified: string[] = [];
    const filesDeleted: string[] = [];

    // Look for file operation patterns
    const lines = output.split('\n');
    for (const line of lines) {
      const normalizedLine = line.toLowerCase();

      // Created patterns
      if (
        normalizedLine.includes('created') ||
        normalizedLine.includes('wrote') ||
        normalizedLine.includes('generated')
      ) {
        const match = line.match(/['"`]([^'"`]+\.[a-z]+)['"`]/i);
        if (match) filesCreated.push(match[1]);
      }

      // Modified patterns
      if (
        normalizedLine.includes('modified') ||
        normalizedLine.includes('updated') ||
        normalizedLine.includes('changed')
      ) {
        const match = line.match(/['"`]([^'"`]+\.[a-z]+)['"`]/i);
        if (match) filesModified.push(match[1]);
      }

      // Deleted patterns
      if (normalizedLine.includes('deleted') || normalizedLine.includes('removed')) {
        const match = line.match(/['"`]([^'"`]+\.[a-z]+)['"`]/i);
        if (match) filesDeleted.push(match[1]);
      }
    }

    return {
      filesCreated: [...new Set(filesCreated)],
      filesModified: [...new Set(filesModified)],
      filesDeleted: [...new Set(filesDeleted)],
    };
  }
}
