import OpenAI from 'openai';
import { Logger } from '@jetpack/shared';

export type EmbeddingModel =
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'
  | 'text-embedding-ada-002';

export interface EmbeddingConfig {
  /** OpenAI API key (defaults to OPENAI_API_KEY env var) */
  apiKey?: string;
  /** Model to use for embeddings (default: text-embedding-3-small) */
  model?: EmbeddingModel;
  /** Dimensions for the embedding (model-dependent) */
  dimensions?: number;
  /** Maximum retries for failed requests */
  maxRetries?: number;
  /** Timeout in milliseconds */
  timeout?: number;
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokensUsed: number;
}

const DEFAULT_MODEL: EmbeddingModel = 'text-embedding-3-small';
const DEFAULT_DIMENSIONS = 1536;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 30000;

export class EmbeddingGenerator {
  private client: OpenAI;
  private logger: Logger;
  private model: EmbeddingModel;
  private dimensions: number;

  constructor(config: EmbeddingConfig = {}) {
    const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'OpenAI API key required. Set OPENAI_API_KEY environment variable or pass apiKey in config.'
      );
    }

    this.client = new OpenAI({
      apiKey,
      maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
    });

    this.model = config.model ?? DEFAULT_MODEL;
    this.dimensions = config.dimensions ?? DEFAULT_DIMENSIONS;
    this.logger = new Logger('EmbeddingGenerator');
  }

  /**
   * Generate embeddings for a single text
   */
  async generate(text: string): Promise<EmbeddingResult> {
    if (!text || text.trim().length === 0) {
      throw new Error('Cannot generate embedding for empty text');
    }

    this.logger.debug(`Generating embedding for text (${text.length} chars)`);

    try {
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
    } catch (error) {
      this.logger.error('Failed to generate embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * More efficient than calling generate() multiple times
   */
  async generateBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) {
      return [];
    }

    // Filter out empty texts and track indices
    const validTexts = texts.filter(t => t && t.trim().length > 0);
    if (validTexts.length === 0) {
      throw new Error('No valid texts to generate embeddings for');
    }

    this.logger.debug(`Generating batch embeddings for ${validTexts.length} texts`);

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: validTexts,
        dimensions: this.model === 'text-embedding-ada-002' ? undefined : this.dimensions,
      });

      const tokensUsed = response.usage?.total_tokens ?? 0;
      const tokensPerText = Math.ceil(tokensUsed / validTexts.length);

      this.logger.debug(
        `Generated ${validTexts.length} embeddings using ${tokensUsed} tokens total`
      );

      return response.data.map(item => ({
        embedding: item.embedding,
        model: this.model,
        tokensUsed: tokensPerText,
      }));
    } catch (error) {
      this.logger.error('Failed to generate batch embeddings:', error);
      throw error;
    }
  }

  /**
   * Check if the embedding service is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.generate('test');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current model configuration
   */
  getConfig(): { model: EmbeddingModel; dimensions: number } {
    return {
      model: this.model,
      dimensions: this.dimensions,
    };
  }
}

/**
 * Create an embedding generator if API key is available, otherwise return null
 */
export function createEmbeddingGenerator(
  config: EmbeddingConfig = {}
): EmbeddingGenerator | null {
  const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  try {
    return new EmbeddingGenerator(config);
  } catch {
    return null;
  }
}
