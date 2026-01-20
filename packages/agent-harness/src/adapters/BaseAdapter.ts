import type {
  ModelAdapter,
  ModelConfig,
  ExecutionRequest,
  ExecutionResult,
  ProgressCallback,
  OutputCallback,
} from '../types.js';

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
   * Parse common patterns from output
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
