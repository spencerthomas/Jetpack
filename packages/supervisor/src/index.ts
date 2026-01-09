// Main exports
export { SupervisorAgent, SupervisorAgentConfig, SupervisorResult } from './SupervisorAgent';

// LLM providers
export { LLMProvider, LLMProviderConfig, LLMProviderConfigInput, ChatMessage, createLLMProvider } from './llm';
export { ClaudeProvider } from './llm/ClaudeProvider';
export { OpenAIProvider } from './llm/OpenAIProvider';

// Graph exports
export { SupervisorStateAnnotation, SupervisorState, Conflict, Reassignment, PlannedTask } from './graph/state';
export { createSupervisorGraph, SupervisorGraph, SupervisorGraphConfig } from './graph/graph';

// Prompts (for customization)
export * from './prompts';
