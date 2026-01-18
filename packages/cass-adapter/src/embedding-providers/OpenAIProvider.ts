/**
 * OpenAI Embedding Provider
 *
 * Uses OpenAI's embedding API (text-embedding-3-small by default).
 * Supports batch embedding for efficiency.
 */

import OpenAI from 'openai';
import { Logger } from '@jetpack-agent/shared';
import type { IEmbeddingProvider, EmbeddingResult, OpenAIProviderConfig } from './types';

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_DIMENSIONS = 1536;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 30000;

export class OpenAIProvider implements IEmbeddingProvider {
  readonly type = 'openai' as const;
  readonly isAvailable: boolean;

  private client: OpenAI | null = null;
  private logger: Logger;
  private model: string;
  private dimensions: number;

  constructor(config: Omit<OpenAIProviderConfig, 'provider'> = {}) {
    this.logger = new Logger('OpenAIProvider');
    this.model = config.model ?? DEFAULT_MODEL;
    this.dimensions = config.dimensions ?? DEFAULT_DIMENSIONS;

    // Check for API key from config or environment variables
    const apiKey = config.apiKey ?? process.env.EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY;

    if (apiKey) {
      try {
        this.client = new OpenAI({
          apiKey,
          maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
          timeout: config.timeout ?? DEFAULT_TIMEOUT,
        });
        this.isAvailable = true;
        this.logger.info(`OpenAI provider initialized with model: ${this.model}`);
      } catch (error) {
        this.logger.error('Failed to initialize OpenAI client:', error);
        this.isAvailable = false;
      }
    } else {
      this.isAvailable = false;
      this.logger.debug('OpenAI provider not available: no API key configured');
    }
  }

  async generate(text: string): Promise<EmbeddingResult> {
    if (!this.client) {
      throw new Error('OpenAI provider not available: no API key configured');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Cannot generate embedding for empty text');
    }

    this.logger.debug(`Generating embedding for text (${text.length} chars)`);

    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
      dimensions: this.model === 'text-embedding-ada-002' ? undefined : this.dimensions,
    });

    const embedding = response.data[0].embedding;
    const tokensUsed = response.usage?.total_tokens ?? 0;

    this.logger.debug(`Generated ${embedding.length}-dim embedding using ${tokensUsed} tokens`);

    return {
      embedding,
      model: this.model,
      tokensUsed,
    };
  }

  async generateBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (!this.client) {
      throw new Error('OpenAI provider not available: no API key configured');
    }

    if (texts.length === 0) {
      return [];
    }

    const validTexts = texts.filter((t) => t && t.trim().length > 0);
    if (validTexts.length === 0) {
      throw new Error('No valid texts to generate embeddings for');
    }

    this.logger.debug(`Generating batch embeddings for ${validTexts.length} texts`);

    const response = await this.client.embeddings.create({
      model: this.model,
      input: validTexts,
      dimensions: this.model === 'text-embedding-ada-002' ? undefined : this.dimensions,
    });

    const tokensUsed = response.usage?.total_tokens ?? 0;
    const tokensPerText = Math.ceil(tokensUsed / validTexts.length);

    this.logger.debug(`Generated ${validTexts.length} embeddings using ${tokensUsed} tokens total`);

    return response.data.map((item) => ({
      embedding: item.embedding,
      model: this.model,
      tokensUsed: tokensPerText,
    }));
  }

  async healthCheck(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      await this.generate('test');
      return true;
    } catch {
      return false;
    }
  }

  getConfig(): { model: string; dimensions: number } {
    return {
      model: this.model,
      dimensions: this.dimensions,
    };
  }
}
