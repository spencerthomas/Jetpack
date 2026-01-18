/**
 * Ollama Embedding Provider
 *
 * Uses Ollama's local embedding API (nomic-embed-text by default).
 * Provides local embeddings without requiring external API keys.
 */

import { Logger } from '@jetpack-agent/shared';
import type { IEmbeddingProvider, EmbeddingResult, OllamaProviderConfig } from './types';

const DEFAULT_HOST = 'http://localhost:11434';
const DEFAULT_MODEL = 'nomic-embed-text';
const DEFAULT_TIMEOUT = 60000;
const DEFAULT_MAX_RETRIES = 3;

interface OllamaEmbeddingResponse {
  embedding: number[];
}

export class OllamaProvider implements IEmbeddingProvider {
  readonly type = 'ollama' as const;
  readonly isAvailable: boolean;

  private logger: Logger;
  private host: string;
  private model: string;
  private timeout: number;
  private maxRetries: number;

  constructor(config: Omit<OllamaProviderConfig, 'provider'> = {}) {
    this.logger = new Logger('OllamaProvider');
    this.host = config.host ?? process.env.OLLAMA_HOST ?? DEFAULT_HOST;
    this.model = config.model ?? process.env.OLLAMA_EMBEDDING_MODEL ?? DEFAULT_MODEL;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;

    // Ollama is available if we have a host (default localhost)
    this.isAvailable = true;
    this.logger.info(`Ollama provider initialized with host: ${this.host}, model: ${this.model}`);
  }

  async generate(text: string): Promise<EmbeddingResult> {
    if (!text || text.trim().length === 0) {
      throw new Error('Cannot generate embedding for empty text');
    }

    this.logger.debug(`Generating embedding for text (${text.length} chars)`);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(`${this.host}/api/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            prompt: text,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Ollama API error: ${response.status} - ${errorBody}`);
        }

        const data = (await response.json()) as OllamaEmbeddingResponse;

        if (!data.embedding || !Array.isArray(data.embedding)) {
          throw new Error('Invalid response from Ollama: missing embedding array');
        }

        this.logger.debug(`Generated ${data.embedding.length}-dim embedding`);

        return {
          embedding: data.embedding,
          model: this.model,
          tokensUsed: 0, // Ollama doesn't report token usage
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (error instanceof Error && error.name === 'AbortError') {
          this.logger.warn(`Ollama request timed out (attempt ${attempt + 1}/${this.maxRetries})`);
        } else {
          this.logger.warn(
            `Ollama request failed (attempt ${attempt + 1}/${this.maxRetries}):`,
            error
          );
        }

        if (attempt < this.maxRetries - 1) {
          // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError ?? new Error('Failed to generate embedding after all retries');
  }

  async generateBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) {
      return [];
    }

    const validTexts = texts.filter((t) => t && t.trim().length > 0);
    if (validTexts.length === 0) {
      throw new Error('No valid texts to generate embeddings for');
    }

    this.logger.debug(`Generating batch embeddings for ${validTexts.length} texts`);

    // Ollama doesn't support batch embeddings natively, so we process sequentially
    const results: EmbeddingResult[] = [];
    for (const text of validTexts) {
      const result = await this.generate(text);
      results.push(result);
    }

    this.logger.debug(`Generated ${results.length} embeddings`);
    return results;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.host}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return false;
      }

      // Verify the model is available
      const data = (await response.json()) as { models?: Array<{ name: string }> };
      const models = data.models ?? [];
      const modelAvailable = models.some(
        (m) => m.name === this.model || m.name.startsWith(`${this.model}:`)
      );

      if (!modelAvailable) {
        this.logger.warn(`Ollama model '${this.model}' not found. Available models:`, models);
        // Still return true if Ollama is running, model can be pulled
      }

      return true;
    } catch {
      return false;
    }
  }

  getConfig(): { model: string } {
    return {
      model: this.model,
    };
  }
}
