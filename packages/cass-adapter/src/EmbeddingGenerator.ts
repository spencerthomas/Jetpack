/**
 * EmbeddingGenerator - Unified interface for generating embeddings
 *
 * This module provides a high-level wrapper around embedding providers.
 * It supports multiple providers (OpenAI, Ollama) and gracefully falls back
 * when no provider is configured.
 *
 * Environment Variables:
 *   EMBEDDING_PROVIDER: "openai" | "ollama" | "none" (default: auto-detect)
 *   EMBEDDING_API_KEY: API key for the provider (falls back to OPENAI_API_KEY)
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
import {
  type IEmbeddingProvider,
  type EmbeddingResult,
  type EmbeddingProviderType,
  type ProviderConfig,
  type OpenAIProviderConfig,
  createProvider,
  createProviderWithFallback,
  getProviderType,
  getProviderInfo,
} from './embedding-providers';

// Re-export types for backwards compatibility
export type { EmbeddingResult, EmbeddingProviderType, ProviderConfig };
export { getProviderType, getProviderInfo };

// Legacy type aliases for backwards compatibility
export type EmbeddingModel =
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'
  | 'text-embedding-ada-002';

export interface EmbeddingConfig {
  /** Provider to use (default: auto-detect from environment) */
  provider?: EmbeddingProviderType;
  /** API key (for OpenAI; defaults to EMBEDDING_API_KEY or OPENAI_API_KEY env var) */
  apiKey?: string;
  /** Model to use for embeddings */
  model?: EmbeddingModel | string;
  /** Dimensions for the embedding (OpenAI only) */
  dimensions?: number;
  /** Maximum retries for failed requests */
  maxRetries?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Host URL for Ollama */
  ollamaHost?: string;
}

export class EmbeddingGenerator {
  private provider: IEmbeddingProvider;
  private logger: Logger;

  constructor(config: EmbeddingConfig = {}) {
    this.logger = new Logger('EmbeddingGenerator');

    // Convert legacy config to provider config
    const providerConfig = this.buildProviderConfig(config);
    this.provider = createProvider(providerConfig);

    if (!this.provider.isAvailable) {
      throw new Error(
        'No embedding provider available. Set EMBEDDING_PROVIDER and appropriate credentials. ' +
          'For OpenAI: set OPENAI_API_KEY or EMBEDDING_API_KEY. ' +
          'For Ollama: set EMBEDDING_PROVIDER=ollama.'
      );
    }

    this.logger.info(`Embedding generator initialized with ${this.provider.type} provider`);
  }

  private buildProviderConfig(config: EmbeddingConfig): ProviderConfig | undefined {
    // If provider is explicitly specified
    if (config.provider === 'none') {
      return { provider: 'none' };
    }

    if (config.provider === 'ollama') {
      return {
        provider: 'ollama',
        host: config.ollamaHost,
        model: config.model,
        maxRetries: config.maxRetries,
        timeout: config.timeout,
      };
    }

    if (config.provider === 'openai' || config.apiKey) {
      return {
        provider: 'openai',
        apiKey: config.apiKey,
        model: config.model as OpenAIProviderConfig['model'],
        dimensions: config.dimensions,
        maxRetries: config.maxRetries,
        timeout: config.timeout,
      };
    }

    // Auto-detect from environment
    return undefined;
  }

  /**
   * Generate embeddings for a single text
   */
  async generate(text: string): Promise<EmbeddingResult> {
    return this.provider.generate(text);
  }

  /**
   * Generate embeddings for multiple texts in batch
   * More efficient than calling generate() multiple times (for providers that support it)
   */
  async generateBatch(texts: string[]): Promise<EmbeddingResult[]> {
    return this.provider.generateBatch(texts);
  }

  /**
   * Check if the embedding service is available
   */
  async healthCheck(): Promise<boolean> {
    return this.provider.healthCheck();
  }

  /**
   * Get the current configuration
   */
  getConfig(): { model: string; dimensions?: number; provider: EmbeddingProviderType } {
    const config = this.provider.getConfig();
    return {
      ...config,
      provider: this.provider.type,
    };
  }

  /**
   * Get the provider type
   */
  getProviderType(): EmbeddingProviderType {
    return this.provider.type;
  }

  /**
   * Check if the provider is available
   */
  isAvailable(): boolean {
    return this.provider.isAvailable;
  }
}

/**
 * Create an embedding generator if a provider is available, otherwise return null
 *
 * This function provides graceful degradation - it will return null if no
 * embedding provider is configured, allowing the caller to fall back to
 * text-based search.
 */
export function createEmbeddingGenerator(config: EmbeddingConfig = {}): EmbeddingGenerator | null {
  const logger = new Logger('EmbeddingGenerator');

  // First check if any provider will be available
  const providerType = config.provider ?? getProviderType();

  if (providerType === 'none') {
    logger.debug('No embedding provider configured');
    return null;
  }

  try {
    return new EmbeddingGenerator(config);
  } catch (error) {
    logger.warn('Failed to create embedding generator:', error);
    return null;
  }
}

/**
 * Create an embedding generator with fallback behavior
 *
 * Returns both the generator (or null) and information about whether it was configured.
 * This is useful for logging and UI feedback.
 */
export function createEmbeddingGeneratorWithFallback(config: EmbeddingConfig = {}): {
  generator: EmbeddingGenerator | null;
  wasConfigured: boolean;
  providerType: EmbeddingProviderType;
} {
  const { provider, wasConfigured } = createProviderWithFallback(
    config.provider
      ? ({
          provider: config.provider,
          apiKey: config.apiKey,
          model: config.model,
          dimensions: config.dimensions,
          maxRetries: config.maxRetries,
          timeout: config.timeout,
          host: config.ollamaHost,
        } as ProviderConfig)
      : undefined
  );

  if (!wasConfigured || !provider.isAvailable) {
    return {
      generator: null,
      wasConfigured: false,
      providerType: 'none',
    };
  }

  try {
    const generator = new EmbeddingGenerator(config);
    return {
      generator,
      wasConfigured: true,
      providerType: provider.type,
    };
  } catch {
    return {
      generator: null,
      wasConfigured: false,
      providerType: 'none',
    };
  }
}
