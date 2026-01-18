/**
 * Embedding Provider Factory
 *
 * Creates embedding providers based on configuration or environment variables.
 *
 * Environment Variables:
 *   EMBEDDING_PROVIDER: "openai" | "ollama" | "none" (default: auto-detect)
 *   EMBEDDING_API_KEY: API key for the provider (falls back to OPENAI_API_KEY for OpenAI)
 *   EMBEDDING_MODEL: Model to use for embeddings
 *
 * For OpenAI:
 *   OPENAI_API_KEY: Alternative to EMBEDDING_API_KEY
 *
 * For Ollama:
 *   OLLAMA_HOST: Ollama server URL (default: http://localhost:11434)
 *   OLLAMA_EMBEDDING_MODEL: Model to use (default: nomic-embed-text)
 */

import { Logger } from '@jetpack-agent/shared';
import type {
  IEmbeddingProvider,
  EmbeddingProviderType,
  ProviderConfig,
  OpenAIProviderConfig,
} from './types';
import { OpenAIProvider } from './OpenAIProvider';
import { OllamaProvider } from './OllamaProvider';
import { NoneProvider } from './NoneProvider';

const logger = new Logger('EmbeddingProviderFactory');

/**
 * Get the configured provider type from environment or detect automatically
 */
export function getProviderType(): EmbeddingProviderType {
  const envProvider = process.env.EMBEDDING_PROVIDER?.toLowerCase();

  if (envProvider) {
    if (envProvider === 'openai' || envProvider === 'ollama' || envProvider === 'none') {
      return envProvider;
    }
    logger.warn(`Unknown EMBEDDING_PROVIDER "${envProvider}", auto-detecting...`);
  }

  // Auto-detect based on available credentials
  const hasOpenAIKey = !!(process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY);
  if (hasOpenAIKey) {
    logger.debug('Auto-detected OpenAI provider (API key found)');
    return 'openai';
  }

  // Could add Ollama auto-detection here (ping localhost:11434)
  // but that adds latency, so we require explicit configuration for Ollama
  logger.debug('No embedding provider configured');
  return 'none';
}

/**
 * Create an embedding provider based on configuration
 */
export function createProvider(config?: ProviderConfig): IEmbeddingProvider {
  // If explicit config provided, use it
  if (config) {
    switch (config.provider) {
      case 'openai':
        return new OpenAIProvider(config);
      case 'ollama':
        return new OllamaProvider(config);
      case 'none':
        return new NoneProvider();
    }
  }

  // Otherwise, detect from environment
  const providerType = getProviderType();
  return createProviderByType(providerType);
}

/**
 * Create a provider by type using environment configuration
 */
export function createProviderByType(type: EmbeddingProviderType): IEmbeddingProvider {
  switch (type) {
    case 'openai': {
      const model = process.env.EMBEDDING_MODEL as OpenAIProviderConfig['model'] | undefined;
      return new OpenAIProvider({ model });
    }
    case 'ollama': {
      const model = process.env.EMBEDDING_MODEL || process.env.OLLAMA_EMBEDDING_MODEL;
      return new OllamaProvider({ model });
    }
    case 'none':
    default:
      return new NoneProvider();
  }
}

/**
 * Try to create a working provider, falling back gracefully
 *
 * @param config Optional explicit configuration
 * @returns A tuple of [provider, wasConfigured] where wasConfigured is true if a real provider was created
 */
export function createProviderWithFallback(config?: ProviderConfig): {
  provider: IEmbeddingProvider;
  wasConfigured: boolean;
} {
  try {
    const provider = createProvider(config);
    return {
      provider,
      wasConfigured: provider.isAvailable && provider.type !== 'none',
    };
  } catch (error) {
    logger.warn('Failed to create embedding provider, using NoneProvider:', error);
    return {
      provider: new NoneProvider(),
      wasConfigured: false,
    };
  }
}

/**
 * Get information about the current embedding configuration
 */
export function getProviderInfo(): {
  type: EmbeddingProviderType;
  isConfigured: boolean;
  model?: string;
  environmentVariables: Record<string, string | undefined>;
} {
  const type = getProviderType();
  const hasOpenAIKey = !!(process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY);
  const hasOllamaConfig = !!process.env.OLLAMA_HOST || !!process.env.OLLAMA_EMBEDDING_MODEL;

  return {
    type,
    isConfigured: type !== 'none' && (hasOpenAIKey || hasOllamaConfig || type === 'ollama'),
    model: process.env.EMBEDDING_MODEL,
    environmentVariables: {
      EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER,
      EMBEDDING_API_KEY: process.env.EMBEDDING_API_KEY ? '[set]' : undefined,
      EMBEDDING_MODEL: process.env.EMBEDDING_MODEL,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '[set]' : undefined,
      OLLAMA_HOST: process.env.OLLAMA_HOST,
      OLLAMA_EMBEDDING_MODEL: process.env.OLLAMA_EMBEDDING_MODEL,
    },
  };
}
