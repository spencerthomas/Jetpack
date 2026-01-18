/**
 * Embedding Provider Types
 *
 * Defines the interface for embedding providers and their configuration.
 * Supports multiple providers: OpenAI, Ollama (local), and potentially Anthropic.
 */

/**
 * Result from generating an embedding
 */
export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokensUsed: number;
}

/**
 * Supported embedding providers
 */
export type EmbeddingProviderType = 'openai' | 'ollama' | 'none';

/**
 * Base configuration shared by all providers
 */
export interface BaseProviderConfig {
  /** Maximum retries for failed requests */
  maxRetries?: number;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * OpenAI-specific configuration
 */
export interface OpenAIProviderConfig extends BaseProviderConfig {
  provider: 'openai';
  /** OpenAI API key (defaults to EMBEDDING_API_KEY or OPENAI_API_KEY env var) */
  apiKey?: string;
  /** Model to use (default: text-embedding-3-small) */
  model?: 'text-embedding-3-small' | 'text-embedding-3-large' | 'text-embedding-ada-002';
  /** Dimensions for the embedding (model-dependent) */
  dimensions?: number;
}

/**
 * Ollama-specific configuration (local embeddings)
 */
export interface OllamaProviderConfig extends BaseProviderConfig {
  provider: 'ollama';
  /** Ollama host URL (default: http://localhost:11434) */
  host?: string;
  /** Model to use (default: nomic-embed-text) */
  model?: string;
}

/**
 * No-op provider configuration (graceful fallback)
 */
export interface NoneProviderConfig {
  provider: 'none';
}

/**
 * Union of all provider configurations
 */
export type ProviderConfig = OpenAIProviderConfig | OllamaProviderConfig | NoneProviderConfig;

/**
 * Interface that all embedding providers must implement
 */
export interface IEmbeddingProvider {
  /** Provider type identifier */
  readonly type: EmbeddingProviderType;

  /** Whether the provider is available and configured */
  readonly isAvailable: boolean;

  /**
   * Generate embedding for a single text
   */
  generate(text: string): Promise<EmbeddingResult>;

  /**
   * Generate embeddings for multiple texts in batch
   * More efficient than calling generate() multiple times for providers that support batching
   */
  generateBatch(texts: string[]): Promise<EmbeddingResult[]>;

  /**
   * Check if the provider is healthy and can process requests
   */
  healthCheck(): Promise<boolean>;

  /**
   * Get the current configuration
   */
  getConfig(): { model: string; dimensions?: number };
}
