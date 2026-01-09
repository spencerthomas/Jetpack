export { LLMProvider, LLMProviderConfig, LLMProviderConfigInput, LLMProviderConfigSchema, ChatMessage, toBaseMessages } from './LLMProvider';
export { ClaudeProvider } from './ClaudeProvider';
export { OpenAIProvider } from './OpenAIProvider';

import { LLMProvider, LLMProviderConfigInput } from './LLMProvider';
import { ClaudeProvider } from './ClaudeProvider';
import { OpenAIProvider } from './OpenAIProvider';

/**
 * Factory function to create an LLM provider based on configuration
 */
export function createLLMProvider(config: LLMProviderConfigInput): LLMProvider {
  switch (config.provider) {
    case 'claude':
      return new ClaudeProvider({
        model: config.model,
        apiKey: config.apiKey,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });
    case 'openai':
      return new OpenAIProvider({
        model: config.model,
        apiKey: config.apiKey,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });
    case 'ollama':
      // For Ollama, we use OpenAI-compatible API with custom base URL
      // This requires setting OLLAMA_BASE_URL environment variable
      return new OpenAIProvider({
        model: config.model,
        apiKey: 'ollama', // Ollama doesn't require API key
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}
