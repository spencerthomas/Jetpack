/**
 * @jetpack-agent/agent-harness
 *
 * Model-agnostic agent harness for Jetpack Swarm.
 * Wraps any AI model adapter to participate in the swarm.
 */

// Core types
export type {
  ModelConfig,
  ModelMessage,
  ExecutionRequest,
  ExecutionResult,
  ProgressCallback,
  OutputCallback,
  ModelAdapter,
  AgentHarnessConfig,
  AgentEvent,
  AgentEventCallback,
  AgentStats,
  PromptTemplate,
} from './types.js';

export {
  DefaultPromptTemplate,
  ModelConfigSchema,
  AgentHarnessConfigSchema,
} from './types.js';

// Agent harness
export { AgentHarness } from './AgentHarness.js';

// Adapters
export {
  BaseAdapter,
  ClaudeCodeAdapter,
  createClaudeCodeAdapter,
  MockAdapter,
  createMockAdapter,
} from './adapters/index.js';

export type { ClaudeCodeConfig, MockAdapterConfig } from './adapters/index.js';

// Factory function for creating agents
import type { DataLayer } from '@jetpack-agent/data';
import type { AgentHarnessConfig, ModelAdapter, PromptTemplate } from './types.js';
import { AgentHarness } from './AgentHarness.js';
import { createClaudeCodeAdapter } from './adapters/ClaudeCodeAdapter.js';
import { createMockAdapter } from './adapters/MockAdapter.js';
import { DefaultPromptTemplate } from './types.js';

/**
 * Create an agent harness with the specified model adapter
 */
export function createAgentHarness(
  dataLayer: DataLayer,
  config: Omit<AgentHarnessConfig, 'model'> & { model: ModelAdapter },
  promptTemplate?: PromptTemplate
): AgentHarness {
  return new AgentHarness(dataLayer, config, promptTemplate ?? DefaultPromptTemplate);
}

/**
 * Create a Claude Code agent harness
 */
export function createClaudeCodeAgent(
  dataLayer: DataLayer,
  config: Omit<AgentHarnessConfig, 'model' | 'type'> & {
    model?: { apiKey?: string; cliPath?: string };
  }
): AgentHarness {
  const adapter = createClaudeCodeAdapter(config.model);
  return new AgentHarness(dataLayer, {
    ...config,
    type: 'claude-code',
    model: adapter,
  });
}

/**
 * Create a mock agent harness for testing
 */
export function createMockAgent(
  dataLayer: DataLayer,
  config: Omit<AgentHarnessConfig, 'model' | 'type'> & {
    model?: { executionDelayMs?: number; shouldFail?: boolean };
  }
): AgentHarness {
  const adapter = createMockAdapter(config.model);
  return new AgentHarness(dataLayer, {
    ...config,
    type: 'custom',
    model: adapter,
  });
}
