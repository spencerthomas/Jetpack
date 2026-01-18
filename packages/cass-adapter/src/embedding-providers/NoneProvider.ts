/**
 * None Embedding Provider
 *
 * A no-op provider used when no embedding provider is configured.
 * Provides graceful degradation - operations fail with clear messages.
 */

import { Logger } from '@jetpack-agent/shared';
import type { IEmbeddingProvider, EmbeddingResult } from './types';

export class NoneProvider implements IEmbeddingProvider {
  readonly type = 'none' as const;
  readonly isAvailable = false;

  private logger: Logger;

  constructor() {
    this.logger = new Logger('NoneProvider');
    this.logger.debug('No embedding provider configured - semantic search will fall back to text search');
  }

  async generate(_text: string): Promise<EmbeddingResult> {
    throw new Error(
      'No embedding provider configured. Set EMBEDDING_PROVIDER to "openai" or "ollama" ' +
        'and configure the appropriate API key or host.'
    );
  }

  async generateBatch(_texts: string[]): Promise<EmbeddingResult[]> {
    throw new Error(
      'No embedding provider configured. Set EMBEDDING_PROVIDER to "openai" or "ollama" ' +
        'and configure the appropriate API key or host.'
    );
  }

  async healthCheck(): Promise<boolean> {
    return false;
  }

  getConfig(): { model: string } {
    return {
      model: 'none',
    };
  }
}
