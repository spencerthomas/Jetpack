import type {
  ModelConfig,
  ExecutionRequest,
  ExecutionResult,
  ProgressCallback,
  OutputCallback,
} from '../types.js';
import { BaseAdapter } from './BaseAdapter.js';
import { PROGRESS_STAGES } from '../constants.js';

/**
 * Configuration for mock adapter
 */
export interface MockAdapterConfig extends ModelConfig {
  /** Default result to return */
  defaultResult?: Partial<ExecutionResult>;
  /** Delay before returning (ms) */
  executionDelayMs?: number;
  /** Whether to simulate failure */
  shouldFail?: boolean;
  /** Custom execution function */
  onExecute?: (request: ExecutionRequest) => Promise<ExecutionResult>;
}

/**
 * Mock adapter for testing
 *
 * Returns configurable results without calling any real model.
 * Useful for unit tests and development.
 */
export class MockAdapter extends BaseAdapter {
  private mockConfig: MockAdapterConfig;
  private executionCount = 0;

  constructor(config: Partial<MockAdapterConfig> = {}) {
    const fullConfig: MockAdapterConfig = {
      provider: 'mock',
      model: 'test',
      ...config,
    };
    super(fullConfig);
    this.mockConfig = fullConfig;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async execute(
    request: ExecutionRequest,
    onProgress?: ProgressCallback,
    onOutput?: OutputCallback
  ): Promise<ExecutionResult> {
    this.executionCount++;
    const startTime = Date.now();

    // If custom execution function is provided, use it
    if (this.mockConfig.onExecute) {
      return this.mockConfig.onExecute(request);
    }

    // Simulate execution delay
    const delay = this.mockConfig.executionDelayMs ?? 100;
    if (delay > 0) {
      // Emit progress updates during delay
      const progressSteps = [
        ...PROGRESS_STAGES,
        { phase: 'reviewing' as const, percentComplete: 100, description: 'Complete' },
      ];

      const stepDelay = delay / progressSteps.length;

      for (const step of progressSteps) {
        await new Promise((resolve) => setTimeout(resolve, stepDelay));
        onProgress?.(step);
        onOutput?.(`[${step.phase}] ${step.description}\n`);
      }
    }

    const durationMs = Date.now() - startTime;

    // Check if should fail
    if (this.mockConfig.shouldFail) {
      return {
        success: false,
        output: 'Mock execution failed',
        filesCreated: [],
        filesModified: [],
        filesDeleted: [],
        error: 'Simulated failure',
        durationMs,
      };
    }

    // Return default or configured result
    const defaultResult: ExecutionResult = {
      success: true,
      output: `Successfully completed task: ${request.task.title}`,
      filesCreated: [],
      filesModified: [],
      filesDeleted: [],
      learnings: ['Mock learning from task'],
      durationMs,
      tokenUsage: {
        inputTokens: 100,
        outputTokens: 200,
      },
    };

    return {
      ...defaultResult,
      ...this.mockConfig.defaultResult,
      durationMs, // Always use actual duration
    };
  }

  /**
   * Get number of times execute was called
   */
  getExecutionCount(): number {
    return this.executionCount;
  }

  /**
   * Reset execution count
   */
  reset(): void {
    this.executionCount = 0;
  }

  /**
   * Update mock configuration
   */
  setConfig(config: Partial<MockAdapterConfig>): void {
    this.mockConfig = { ...this.mockConfig, ...config };
  }

  /**
   * Configure to fail on next execution
   */
  setFail(shouldFail: boolean): void {
    this.mockConfig.shouldFail = shouldFail;
  }
}

/**
 * Create a mock adapter for testing
 */
export function createMockAdapter(
  options: Partial<MockAdapterConfig> = {}
): MockAdapter {
  return new MockAdapter(options);
}
