/**
 * Tests for adapter factory
 */

import { describe, it, expect, vi } from 'vitest';
import {
  AdapterConfigurationError,
  CloudflareAdaptersNotImplementedError,
  validateHybridAdapterConfig,
  createLocalHybridConfig,
  createHybridConfig,
  createEdgeHybridConfig,
  isAdapterModeSupported,
  getDefaultAdapterMode,
  createAdapters,
  AdapterFactories,
  CreateAdaptersOptions,
} from './factory';
import { HybridAdapterConfig, ITaskStore, IMailBus, IMemoryStore } from './interfaces';

// Mock factories for testing
const createMockFactories = (): AdapterFactories => ({
  createTaskStore: vi.fn().mockReturnValue({} as ITaskStore),
  createMailBus: vi.fn().mockReturnValue({} as IMailBus),
  createMemoryStore: vi.fn().mockReturnValue({} as IMemoryStore),
});

const createMockOptions = (): CreateAdaptersOptions => ({
  workDir: '/test/work',
  agentId: 'test-agent',
});

describe('AdapterConfigurationError', () => {
  it('should create error with correct name and message', () => {
    const error = new AdapterConfigurationError('Test error');
    expect(error.name).toBe('AdapterConfigurationError');
    expect(error.message).toBe('Test error');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('CloudflareAdaptersNotImplementedError', () => {
  it('should create error without adapter type', () => {
    const error = new CloudflareAdaptersNotImplementedError();
    expect(error.name).toBe('CloudflareAdaptersNotImplementedError');
    expect(error.message).toContain('Cloudflare HTTP client adapters');
    expect(error.message).toContain('Phase 5');
  });

  it('should create error with adapter type', () => {
    const error = new CloudflareAdaptersNotImplementedError('task store');
    expect(error.message).toContain('for task store');
  });
});

describe('validateHybridAdapterConfig', () => {
  it('should accept valid local mode config', () => {
    const config: HybridAdapterConfig = { mode: 'local' };
    expect(() => validateHybridAdapterConfig(config)).not.toThrow();
  });

  it('should reject invalid mode', () => {
    const config = { mode: 'invalid' } as unknown as HybridAdapterConfig;
    expect(() => validateHybridAdapterConfig(config)).toThrow(AdapterConfigurationError);
    expect(() => validateHybridAdapterConfig(config)).toThrow(/Invalid adapter mode/);
  });

  it('should require cloudflare config for edge mode', () => {
    const config: HybridAdapterConfig = { mode: 'edge' };
    expect(() => validateHybridAdapterConfig(config)).toThrow(AdapterConfigurationError);
    expect(() => validateHybridAdapterConfig(config)).toThrow(/Edge mode requires/);
  });

  it('should accept edge mode with cloudflare config', () => {
    const config: HybridAdapterConfig = {
      mode: 'edge',
      cloudflare: {
        workerUrl: 'https://worker.example.com',
        apiToken: 'test-token',
        accountId: 'test-account',
      },
    };
    expect(() => validateHybridAdapterConfig(config)).not.toThrow();
  });

  it('should accept hybrid mode without cloudflare adapters', () => {
    const config: HybridAdapterConfig = {
      mode: 'hybrid',
      adapters: {
        tasks: 'local',
        mail: 'local',
        memory: 'local',
      },
    };
    expect(() => validateHybridAdapterConfig(config)).not.toThrow();
  });

  it('should require cloudflare config for hybrid mode with cloudflare adapters', () => {
    const config: HybridAdapterConfig = {
      mode: 'hybrid',
      adapters: {
        tasks: 'cloudflare',
        mail: 'local',
        memory: 'local',
      },
    };
    expect(() => validateHybridAdapterConfig(config)).toThrow(AdapterConfigurationError);
    expect(() => validateHybridAdapterConfig(config)).toThrow(/requires cloudflare.workerUrl/);
  });

  it('should accept hybrid mode with cloudflare adapters and config', () => {
    const config: HybridAdapterConfig = {
      mode: 'hybrid',
      cloudflare: {
        workerUrl: 'https://worker.example.com',
        apiToken: 'test-token',
        accountId: 'test-account',
      },
      adapters: {
        tasks: 'cloudflare',
        mail: 'local',
        memory: 'local',
      },
    };
    expect(() => validateHybridAdapterConfig(config)).not.toThrow();
  });
});

describe('createLocalHybridConfig', () => {
  it('should create local mode config', () => {
    const config = createLocalHybridConfig();
    expect(config.mode).toBe('local');
  });
});

describe('createHybridConfig', () => {
  it('should create hybrid mode config with all params', () => {
    const config = createHybridConfig(
      'https://worker.example.com',
      'test-token',
      { tasks: 'cloudflare', mail: 'local', memory: 'local' },
      'test-account'
    );
    expect(config.mode).toBe('hybrid');
    expect(config.cloudflare?.workerUrl).toBe('https://worker.example.com');
    expect(config.cloudflare?.apiToken).toBe('test-token');
    expect(config.cloudflare?.accountId).toBe('test-account');
    expect(config.adapters?.tasks).toBe('cloudflare');
  });

  it('should create hybrid mode config without accountId', () => {
    const config = createHybridConfig(
      'https://worker.example.com',
      'test-token',
      { tasks: 'local', mail: 'local', memory: 'local' }
    );
    expect(config.cloudflare?.accountId).toBe('');
  });
});

describe('createEdgeHybridConfig', () => {
  it('should create edge mode config', () => {
    const config = createEdgeHybridConfig(
      'https://worker.example.com',
      'test-token',
      'test-account'
    );
    expect(config.mode).toBe('edge');
    expect(config.cloudflare?.workerUrl).toBe('https://worker.example.com');
    expect(config.cloudflare?.apiToken).toBe('test-token');
    expect(config.cloudflare?.accountId).toBe('test-account');
  });
});

describe('isAdapterModeSupported', () => {
  it('should return true for local mode', () => {
    expect(isAdapterModeSupported('local')).toBe(true);
  });

  it('should return true for hybrid mode', () => {
    expect(isAdapterModeSupported('hybrid')).toBe(true);
  });

  it('should return false for edge mode', () => {
    expect(isAdapterModeSupported('edge')).toBe(false);
  });
});

describe('getDefaultAdapterMode', () => {
  it('should return local by default', () => {
    const originalEnv = process.env.JETPACK_ADAPTER_MODE;
    delete process.env.JETPACK_ADAPTER_MODE;
    expect(getDefaultAdapterMode()).toBe('local');
    process.env.JETPACK_ADAPTER_MODE = originalEnv;
  });

  it('should respect JETPACK_ADAPTER_MODE env var', () => {
    const originalEnv = process.env.JETPACK_ADAPTER_MODE;
    process.env.JETPACK_ADAPTER_MODE = 'hybrid';
    expect(getDefaultAdapterMode()).toBe('hybrid');
    process.env.JETPACK_ADAPTER_MODE = originalEnv;
  });
});

describe('createAdapters', () => {
  it('should create local adapters for local mode', () => {
    const config = createLocalHybridConfig();
    const options = createMockOptions();
    const factories = createMockFactories();

    const bundle = createAdapters(config, options, factories);

    expect(bundle.mode).toBe('local');
    expect(factories.createTaskStore).toHaveBeenCalledWith({
      beadsDir: '/test/work/.beads',
      autoCommit: true,
      gitEnabled: true,
    });
    expect(factories.createMailBus).toHaveBeenCalledWith({
      mailDir: '/test/work/.jetpack/mail',
      agentId: 'test-agent',
    });
    expect(factories.createMemoryStore).toHaveBeenCalledWith({
      cassDir: '/test/work/.cass',
      compactionThreshold: 0.3,
      maxEntries: 10000,
      autoGenerateEmbeddings: false,
    });
  });

  it('should use custom options for local adapters', () => {
    const config = createLocalHybridConfig();
    const options: CreateAdaptersOptions = {
      workDir: '/custom/work',
      agentId: 'custom-agent',
      beads: { autoCommit: false, gitEnabled: false },
      cass: { compactionThreshold: 0.5, maxEntries: 5000, autoGenerateEmbeddings: true },
    };
    const factories = createMockFactories();

    createAdapters(config, options, factories);

    expect(factories.createTaskStore).toHaveBeenCalledWith({
      beadsDir: '/custom/work/.beads',
      autoCommit: false,
      gitEnabled: false,
    });
    expect(factories.createMemoryStore).toHaveBeenCalledWith({
      cassDir: '/custom/work/.cass',
      compactionThreshold: 0.5,
      maxEntries: 5000,
      autoGenerateEmbeddings: true,
    });
  });

  it('should throw for cloudflare task adapter', () => {
    const config: HybridAdapterConfig = {
      mode: 'hybrid',
      cloudflare: {
        workerUrl: 'https://worker.example.com',
        apiToken: 'test-token',
        accountId: 'test-account',
      },
      adapters: {
        tasks: 'cloudflare',
        mail: 'local',
        memory: 'local',
      },
    };
    const options = createMockOptions();
    const factories = createMockFactories();

    expect(() => createAdapters(config, options, factories)).toThrow(
      CloudflareAdaptersNotImplementedError
    );
  });

  it('should throw for cloudflare mail adapter', () => {
    const config: HybridAdapterConfig = {
      mode: 'hybrid',
      cloudflare: {
        workerUrl: 'https://worker.example.com',
        apiToken: 'test-token',
        accountId: 'test-account',
      },
      adapters: {
        tasks: 'local',
        mail: 'cloudflare',
        memory: 'local',
      },
    };
    const options = createMockOptions();
    const factories = createMockFactories();

    expect(() => createAdapters(config, options, factories)).toThrow(
      CloudflareAdaptersNotImplementedError
    );
  });

  it('should throw for cloudflare memory adapter', () => {
    const config: HybridAdapterConfig = {
      mode: 'hybrid',
      cloudflare: {
        workerUrl: 'https://worker.example.com',
        apiToken: 'test-token',
        accountId: 'test-account',
      },
      adapters: {
        tasks: 'local',
        mail: 'local',
        memory: 'cloudflare',
      },
    };
    const options = createMockOptions();
    const factories = createMockFactories();

    expect(() => createAdapters(config, options, factories)).toThrow(
      CloudflareAdaptersNotImplementedError
    );
  });

  it('should throw for edge mode (all cloudflare)', () => {
    const config: HybridAdapterConfig = {
      mode: 'edge',
      cloudflare: {
        workerUrl: 'https://worker.example.com',
        apiToken: 'test-token',
        accountId: 'test-account',
      },
    };
    const options = createMockOptions();
    const factories = createMockFactories();

    expect(() => createAdapters(config, options, factories)).toThrow(
      CloudflareAdaptersNotImplementedError
    );
  });
});
