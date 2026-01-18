import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAIProvider } from './OpenAIProvider';
import { OllamaProvider } from './OllamaProvider';
import { NoneProvider } from './NoneProvider';
import {
  createProvider,
  createProviderWithFallback,
  getProviderType,
  getProviderInfo,
} from './factory';

// Mock the openai module
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      embeddings: {
        create: vi.fn().mockResolvedValue({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          usage: { total_tokens: 10 },
        }),
      },
    })),
  };
});

describe('OpenAIProvider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment
    delete process.env.EMBEDDING_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.EMBEDDING_PROVIDER;
    delete process.env.EMBEDDING_MODEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('initialization', () => {
    it('should be unavailable without API key', () => {
      const provider = new OpenAIProvider();
      expect(provider.isAvailable).toBe(false);
      expect(provider.type).toBe('openai');
    });

    it('should be available with EMBEDDING_API_KEY', () => {
      process.env.EMBEDDING_API_KEY = 'test-key';
      const provider = new OpenAIProvider();
      expect(provider.isAvailable).toBe(true);
    });

    it('should be available with OPENAI_API_KEY', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const provider = new OpenAIProvider();
      expect(provider.isAvailable).toBe(true);
    });

    it('should prefer EMBEDDING_API_KEY over OPENAI_API_KEY', () => {
      process.env.EMBEDDING_API_KEY = 'embedding-key';
      process.env.OPENAI_API_KEY = 'openai-key';
      const provider = new OpenAIProvider();
      expect(provider.isAvailable).toBe(true);
    });

    it('should accept API key via config', () => {
      const provider = new OpenAIProvider({ apiKey: 'config-key' });
      expect(provider.isAvailable).toBe(true);
    });
  });

  describe('generate', () => {
    it('should throw error when not available', async () => {
      const provider = new OpenAIProvider();
      await expect(provider.generate('test')).rejects.toThrow('not available');
    });

    it('should throw error for empty text', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const provider = new OpenAIProvider();
      await expect(provider.generate('')).rejects.toThrow('empty text');
      await expect(provider.generate('   ')).rejects.toThrow('empty text');
    });

    it('should generate embedding when available', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const provider = new OpenAIProvider();
      const result = await provider.generate('test input');

      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.tokensUsed).toBe(10);
      expect(result.model).toBe('text-embedding-3-small');
    });
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const provider = new OpenAIProvider();
      const config = provider.getConfig();

      expect(config.model).toBe('text-embedding-3-small');
      expect(config.dimensions).toBe(1536);
    });

    it('should return custom model', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const provider = new OpenAIProvider({ model: 'text-embedding-3-large' });
      const config = provider.getConfig();

      expect(config.model).toBe('text-embedding-3-large');
    });
  });
});

describe('OllamaProvider', () => {
  const originalEnv = { ...process.env };
  const mockFetch = vi.fn();

  beforeEach(() => {
    // Reset environment
    delete process.env.OLLAMA_HOST;
    delete process.env.OLLAMA_EMBEDDING_MODEL;
    delete process.env.EMBEDDING_MODEL;

    // Mock global fetch
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('initialization', () => {
    it('should always be available (local service)', () => {
      const provider = new OllamaProvider();
      expect(provider.isAvailable).toBe(true);
      expect(provider.type).toBe('ollama');
    });

    it('should use default host and model', () => {
      const provider = new OllamaProvider();
      const config = provider.getConfig();
      expect(config.model).toBe('nomic-embed-text');
    });

    it('should use OLLAMA_HOST from environment', () => {
      process.env.OLLAMA_HOST = 'http://custom-host:11434';
      const provider = new OllamaProvider();
      expect(provider.isAvailable).toBe(true);
    });

    it('should use custom model from config', () => {
      const provider = new OllamaProvider({ model: 'custom-model' });
      const config = provider.getConfig();
      expect(config.model).toBe('custom-model');
    });
  });

  describe('generate', () => {
    it('should throw error for empty text', async () => {
      const provider = new OllamaProvider();
      await expect(provider.generate('')).rejects.toThrow('empty text');
    });

    it('should generate embedding successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: [0.4, 0.5, 0.6] }),
      });

      const provider = new OllamaProvider();
      const result = await provider.generate('test input');

      expect(result.embedding).toEqual([0.4, 0.5, 0.6]);
      expect(result.model).toBe('nomic-embed-text');
      expect(result.tokensUsed).toBe(0); // Ollama doesn't report tokens
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      });

      const provider = new OllamaProvider({ maxRetries: 1 });
      await expect(provider.generate('test')).rejects.toThrow('Ollama API error');
    });
  });

  describe('healthCheck', () => {
    it('should return true when service is available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'nomic-embed-text' }] }),
      });

      const provider = new OllamaProvider();
      const healthy = await provider.healthCheck();
      expect(healthy).toBe(true);
    });

    it('should return false when service is unavailable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const provider = new OllamaProvider();
      const healthy = await provider.healthCheck();
      expect(healthy).toBe(false);
    });
  });
});

describe('NoneProvider', () => {
  it('should not be available', () => {
    const provider = new NoneProvider();
    expect(provider.isAvailable).toBe(false);
    expect(provider.type).toBe('none');
  });

  it('should throw on generate', async () => {
    const provider = new NoneProvider();
    await expect(provider.generate('test')).rejects.toThrow('No embedding provider configured');
  });

  it('should throw on generateBatch', async () => {
    const provider = new NoneProvider();
    await expect(provider.generateBatch(['test'])).rejects.toThrow(
      'No embedding provider configured'
    );
  });

  it('should fail health check', async () => {
    const provider = new NoneProvider();
    const healthy = await provider.healthCheck();
    expect(healthy).toBe(false);
  });

  it('should return none model in config', () => {
    const provider = new NoneProvider();
    expect(provider.getConfig().model).toBe('none');
  });
});

describe('Factory functions', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.EMBEDDING_PROVIDER;
    delete process.env.EMBEDDING_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.EMBEDDING_MODEL;
    delete process.env.OLLAMA_HOST;
    delete process.env.OLLAMA_EMBEDDING_MODEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('getProviderType', () => {
    it('should return none when no config', () => {
      expect(getProviderType()).toBe('none');
    });

    it('should return explicit provider type', () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      expect(getProviderType()).toBe('openai');

      process.env.EMBEDDING_PROVIDER = 'ollama';
      expect(getProviderType()).toBe('ollama');

      process.env.EMBEDDING_PROVIDER = 'none';
      expect(getProviderType()).toBe('none');
    });

    it('should auto-detect openai from API key', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      expect(getProviderType()).toBe('openai');
    });

    it('should auto-detect from EMBEDDING_API_KEY', () => {
      process.env.EMBEDDING_API_KEY = 'test-key';
      expect(getProviderType()).toBe('openai');
    });
  });

  describe('createProvider', () => {
    it('should create OpenAI provider from config', () => {
      const provider = createProvider({ provider: 'openai', apiKey: 'test-key' });
      expect(provider.type).toBe('openai');
      expect(provider.isAvailable).toBe(true);
    });

    it('should create Ollama provider from config', () => {
      const provider = createProvider({ provider: 'ollama' });
      expect(provider.type).toBe('ollama');
      expect(provider.isAvailable).toBe(true);
    });

    it('should create None provider from config', () => {
      const provider = createProvider({ provider: 'none' });
      expect(provider.type).toBe('none');
      expect(provider.isAvailable).toBe(false);
    });

    it('should auto-detect from environment', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const provider = createProvider();
      expect(provider.type).toBe('openai');
    });
  });

  describe('createProviderWithFallback', () => {
    it('should return wasConfigured=false when no provider', () => {
      const result = createProviderWithFallback();
      expect(result.wasConfigured).toBe(false);
      expect(result.provider.type).toBe('none');
    });

    it('should return wasConfigured=true when provider available', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const result = createProviderWithFallback();
      expect(result.wasConfigured).toBe(true);
      expect(result.provider.type).toBe('openai');
    });

    it('should fall back gracefully on error', () => {
      const result = createProviderWithFallback({ provider: 'openai' });
      // No API key, so should fall back
      expect(result.provider).toBeDefined();
    });
  });

  describe('getProviderInfo', () => {
    it('should return unconfigured state by default', () => {
      const info = getProviderInfo();
      expect(info.type).toBe('none');
      expect(info.isConfigured).toBe(false);
    });

    it('should show configured state with API key', () => {
      process.env.OPENAI_API_KEY = 'secret-key';
      const info = getProviderInfo();
      expect(info.type).toBe('openai');
      expect(info.isConfigured).toBe(true);
      expect(info.environmentVariables.OPENAI_API_KEY).toBe('[set]');
    });

    it('should show Ollama as configured when explicitly set', () => {
      process.env.EMBEDDING_PROVIDER = 'ollama';
      const info = getProviderInfo();
      expect(info.type).toBe('ollama');
      expect(info.isConfigured).toBe(true);
    });
  });
});
