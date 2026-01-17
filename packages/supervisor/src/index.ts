// Main exports
export {
  SupervisorAgent,
  SupervisorAgentConfig,
  SupervisorResult,
  BackgroundMonitoringStats,
} from './SupervisorAgent';

// LLM providers
export { LLMProvider, LLMProviderConfig, LLMProviderConfigInput, ChatMessage, createLLMProvider } from './llm';
export { ClaudeProvider } from './llm/ClaudeProvider';
export { OpenAIProvider } from './llm/OpenAIProvider';

// Graph exports
export {
  SupervisorStateAnnotation,
  SupervisorState,
  Conflict,
  Reassignment,
  PlannedTask,
  // Continuous mode types
  Objective,
  ObjectiveStatus,
  ObjectiveStatusSchema,
  Milestone,
  MilestoneStatus,
  MilestoneStatusSchema,
  QueueThresholds,
  QueueThresholdsSchema,
} from './graph/state';
export { createSupervisorGraph, SupervisorGraph, SupervisorGraphConfig } from './graph/graph';
export { createContinuousGraph, ContinuousGraph, ContinuousGraphConfig } from './graph/continuousGraph';

// Prompts (for customization)
export * from './prompts';
