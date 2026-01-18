import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadEnvironmentConfig,
  mergeWithEnvironment,
  ENV_VARS,
  HybridModeSettingsSchema,
  JetpackSettingsSchema,
} from './settings';

describe('Environment Configuration', () => {
  // Store original env values to restore after tests
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save original values
    Object.values(ENV_VARS).forEach(key => {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    });
  });

  afterEach(() => {
    // Restore original values
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  });

  describe('loadEnvironmentConfig', () => {
    it('should return default local mode when no env vars set', () => {
      const config = loadEnvironmentConfig();
      expect(config.mode).toBe('local');
      expect(config.cloudflareApiUrl).toBeUndefined();
      expect(config.cloudflareApiToken).toBeUndefined();
    });

    it('should load JETPACK_MODE from environment', () => {
      process.env.JETPACK_MODE = 'hybrid';
      process.env.CLOUDFLARE_API_URL = 'https://worker.example.com';
      process.env.CLOUDFLARE_API_TOKEN = 'test-token';

      const config = loadEnvironmentConfig();
      expect(config.mode).toBe('hybrid');
    });

    it('should load Cloudflare credentials from environment', () => {
      process.env.CLOUDFLARE_API_URL = 'https://api.example.com';
      process.env.CLOUDFLARE_API_TOKEN = 'secret-token';

      const config = loadEnvironmentConfig();
      expect(config.cloudflareApiUrl).toBe('https://api.example.com');
      expect(config.cloudflareApiToken).toBe('secret-token');
    });

    it('should load JETPACK_WORK_DIR from environment', () => {
      process.env.JETPACK_WORK_DIR = '/custom/work/dir';

      const config = loadEnvironmentConfig();
      expect(config.workDir).toBe('/custom/work/dir');
    });

    it('should load LLM API keys from environment', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      process.env.OPENAI_API_KEY = 'sk-openai-test';
      process.env.OLLAMA_BASE_URL = 'http://localhost:11434';

      const config = loadEnvironmentConfig();
      expect(config.anthropicApiKey).toBe('sk-ant-test');
      expect(config.openaiApiKey).toBe('sk-openai-test');
      expect(config.ollamaBaseUrl).toBe('http://localhost:11434');
    });

    it('should throw error for invalid mode', () => {
      process.env.JETPACK_MODE = 'invalid';

      expect(() => loadEnvironmentConfig()).toThrow(
        'Invalid JETPACK_MODE: "invalid". Valid values: local, hybrid, edge'
      );
    });

    it('should throw error when hybrid mode missing CLOUDFLARE_API_URL', () => {
      process.env.JETPACK_MODE = 'hybrid';
      process.env.CLOUDFLARE_API_TOKEN = 'token';

      expect(() => loadEnvironmentConfig()).toThrow(
        'CLOUDFLARE_API_URL is required for hybrid mode'
      );
    });

    it('should throw error when hybrid mode missing CLOUDFLARE_API_TOKEN', () => {
      process.env.JETPACK_MODE = 'hybrid';
      process.env.CLOUDFLARE_API_URL = 'https://api.example.com';

      expect(() => loadEnvironmentConfig()).toThrow(
        'CLOUDFLARE_API_TOKEN is required for hybrid mode'
      );
    });

    it('should throw error when edge mode missing credentials', () => {
      process.env.JETPACK_MODE = 'edge';

      expect(() => loadEnvironmentConfig()).toThrow(
        'CLOUDFLARE_API_URL is required for edge mode'
      );
    });

    it('should accept valid hybrid mode with all credentials', () => {
      process.env.JETPACK_MODE = 'hybrid';
      process.env.CLOUDFLARE_API_URL = 'https://api.example.com';
      process.env.CLOUDFLARE_API_TOKEN = 'token';

      const config = loadEnvironmentConfig();
      expect(config.mode).toBe('hybrid');
      expect(config.cloudflareApiUrl).toBe('https://api.example.com');
      expect(config.cloudflareApiToken).toBe('token');
    });
  });

  describe('mergeWithEnvironment', () => {
    it('should apply workDir from environment when not in config', () => {
      const envConfig = {
        mode: 'local' as const,
        workDir: '/env/work/dir',
      };
      const explicitConfig = {};

      const merged = mergeWithEnvironment(explicitConfig, envConfig);
      expect(merged.workDir).toBe('/env/work/dir');
    });

    it('should NOT override workDir when already in config', () => {
      const envConfig = {
        mode: 'local' as const,
        workDir: '/env/work/dir',
      };
      const explicitConfig = { workDir: '/explicit/dir' };

      const merged = mergeWithEnvironment(explicitConfig, envConfig);
      expect(merged.workDir).toBe('/explicit/dir');
    });

    it('should apply hybrid mode from environment', () => {
      const envConfig = {
        mode: 'hybrid' as const,
        cloudflareApiUrl: 'https://api.example.com',
        cloudflareApiToken: 'token',
      };
      const explicitConfig = {};

      const merged = mergeWithEnvironment(explicitConfig, envConfig);
      expect(merged.hybrid?.mode).toBe('hybrid');
      expect(merged.hybrid?.cloudflareUrl).toBe('https://api.example.com');
      expect(merged.hybrid?.apiToken).toBe('token');
    });

    it('should NOT override hybrid settings when already in config', () => {
      const envConfig = {
        mode: 'hybrid' as const,
        cloudflareApiUrl: 'https://env-api.example.com',
        cloudflareApiToken: 'env-token',
      };
      const explicitConfig = {
        hybrid: {
          mode: 'edge' as const,
          cloudflareUrl: 'https://explicit-api.example.com',
          apiToken: 'explicit-token',
        },
      };

      const merged = mergeWithEnvironment(explicitConfig, envConfig);
      expect(merged.hybrid?.mode).toBe('edge');
      expect(merged.hybrid?.cloudflareUrl).toBe('https://explicit-api.example.com');
      expect(merged.hybrid?.apiToken).toBe('explicit-token');
    });

    it('should preserve existing config properties', () => {
      const envConfig = {
        mode: 'local' as const,
      };
      const explicitConfig = {
        agentCount: 5,
        quality: { enabled: true },
      };

      const merged = mergeWithEnvironment(explicitConfig, envConfig);
      expect(merged.agentCount).toBe(5);
      expect(merged.quality?.enabled).toBe(true);
    });
  });

  describe('ENV_VARS constant', () => {
    it('should have all expected environment variable names', () => {
      expect(ENV_VARS.MODE).toBe('JETPACK_MODE');
      expect(ENV_VARS.CLOUDFLARE_API_URL).toBe('CLOUDFLARE_API_URL');
      expect(ENV_VARS.CLOUDFLARE_API_TOKEN).toBe('CLOUDFLARE_API_TOKEN');
      expect(ENV_VARS.WORK_DIR).toBe('JETPACK_WORK_DIR');
      expect(ENV_VARS.ANTHROPIC_API_KEY).toBe('ANTHROPIC_API_KEY');
      expect(ENV_VARS.OPENAI_API_KEY).toBe('OPENAI_API_KEY');
      expect(ENV_VARS.OLLAMA_BASE_URL).toBe('OLLAMA_BASE_URL');
    });
  });

  describe('HybridModeSettingsSchema', () => {
    it('should default to local mode', () => {
      const parsed = HybridModeSettingsSchema.parse({});
      expect(parsed.mode).toBe('local');
    });

    it('should accept valid hybrid mode with url', () => {
      const parsed = HybridModeSettingsSchema.parse({
        mode: 'hybrid',
        cloudflareUrl: 'https://api.example.com',
        apiToken: 'token',
      });
      expect(parsed.mode).toBe('hybrid');
      expect(parsed.cloudflareUrl).toBe('https://api.example.com');
    });

    it('should have default sync interval', () => {
      const parsed = HybridModeSettingsSchema.parse({});
      expect(parsed.syncIntervalMs).toBe(5000);
    });

    it('should have default offline fallback enabled', () => {
      const parsed = HybridModeSettingsSchema.parse({});
      expect(parsed.offlineFallback).toBe(true);
    });
  });
});
