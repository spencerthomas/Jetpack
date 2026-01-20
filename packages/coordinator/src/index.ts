/**
 * @jetpack-agent/coordinator
 *
 * Swarm coordinator for Jetpack - manages agent lifecycle and work distribution
 */

// Types
export type {
  CoordinatorConfig,
  AgentSpawnConfig,
  CoordinatorEvent,
  CoordinatorEventCallback,
  SwarmStats,
  DistributionResult,
  AgentHealth,
  ManagedAgent,
  AgentAssignment,
  ClaimStrategy,
} from './types.js';

export { AgentSpawnConfigSchema, CoordinatorConfigSchema } from './types.js';

// Main coordinator
export { SwarmCoordinator } from './SwarmCoordinator.js';

// Re-export commonly used types from dependencies
export type {
  DataLayer,
  Task,
  Agent,
  TaskFilter,
  AgentFilter,
} from '@jetpack-agent/data';

export type {
  ModelAdapter,
  AgentHarness,
  AgentEvent,
} from '@jetpack-agent/agent-harness';
