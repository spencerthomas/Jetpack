/**
 * Adapter Factory Types and Helpers for Hybrid Cloudflare Architecture
 *
 * This module provides:
 * - Type definitions for adapter modes and configurations
 * - Validation functions for adapter configurations
 * - Factory function for creating adapters
 * - Helper functions for creating configurations
 *
 * @see docs/HYBRID_ARCHITECTURE.md
 */

import { HybridAdapterConfig, ITaskStore, IMailBus, IMemoryStore } from './interfaces';
import { HttpTaskStore, HttpMailBus, HttpMemoryStore, HttpAdapterConfig } from './http-adapters';

/**
 * Adapter mode - determines which backend adapters to use
 */
export type AdapterMode = 'local' | 'hybrid' | 'edge';

/**
 * Custom error for adapter configuration issues
 */
export class AdapterConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdapterConfigurationError';
  }
}

/**
 * Error thrown when Cloudflare adapters are requested but not implemented
 */
export class CloudflareAdaptersNotImplementedError extends Error {
  constructor(adapterType?: string) {
    const typeStr = adapterType ? ` for ${adapterType}` : '';
    super(`Cloudflare HTTP client adapters${typeStr} are not yet implemented. See docs/HYBRID_ARCHITECTURE.md Phase 5.`);
    this.name = 'CloudflareAdaptersNotImplementedError';
  }
}

/**
 * Configuration for local adapters
 */
export interface LocalAdapterConfig {
  /** Working directory for file-based storage */
  workDir: string;
  /** Agent ID for mail adapter (used for messaging identity) */
  agentId?: string;
  /** Optional: Beads-specific config */
  beads?: {
    autoCommit?: boolean;
    gitEnabled?: boolean;
  };
  /** Optional: CASS-specific config */
  cass?: {
    compactionThreshold?: number;
    maxEntries?: number;
    autoGenerateEmbeddings?: boolean;
  };
}

/**
 * Result of adapter factory creation
 */
export interface AdapterBundle {
  taskStore: ITaskStore;
  mailBus: IMailBus;
  memoryStore: IMemoryStore;
  /** Mode the adapters were created for */
  mode: AdapterMode;
}

/**
 * Options for createLocalAdapters (used by orchestrator)
 */
export interface CreateLocalAdaptersOptions {
  workDir: string;
  agentId?: string;
  beadsConfig?: {
    autoCommit?: boolean;
    gitEnabled?: boolean;
  };
  cassConfig?: {
    compactionThreshold?: number;
    maxEntries?: number;
  };
}

/**
 * Validate a HybridAdapterConfig
 * @throws {AdapterConfigurationError} if configuration is invalid
 */
export function validateHybridAdapterConfig(config: HybridAdapterConfig): void {
  const validModes = ['local', 'hybrid', 'edge'];
  if (!validModes.includes(config.mode)) {
    throw new AdapterConfigurationError(
      'Invalid adapter mode: ' + config.mode + '. Valid modes: local, hybrid, edge'
    );
  }

  // Edge mode requires cloudflare config
  if (config.mode === 'edge') {
    if (!config.cloudflare?.workerUrl || !config.cloudflare?.apiToken) {
      throw new AdapterConfigurationError(
        'Edge mode requires cloudflare.workerUrl and cloudflare.apiToken'
      );
    }
  }

  // Hybrid mode with cloudflare adapters requires cloudflare config
  if (config.mode === 'hybrid') {
    const usesCloudflareAdapter =
      config.adapters?.tasks === 'cloudflare' ||
      config.adapters?.mail === 'cloudflare' ||
      config.adapters?.memory === 'cloudflare';

    if (usesCloudflareAdapter) {
      if (!config.cloudflare?.workerUrl) {
        throw new AdapterConfigurationError(
          'Hybrid mode with Cloudflare adapters requires cloudflare.workerUrl'
        );
      }
      if (!config.cloudflare?.apiToken) {
        throw new AdapterConfigurationError(
          'Hybrid mode with Cloudflare adapters requires cloudflare.apiToken'
        );
      }
    }
  }
}

/**
 * Create a local-only HybridAdapterConfig
 */
export function createLocalHybridConfig(): HybridAdapterConfig {
  return { mode: 'local' };
}

/**
 * Create a hybrid mode HybridAdapterConfig
 */
export function createHybridConfig(
  workerUrl: string,
  apiToken: string,
  adapters: NonNullable<HybridAdapterConfig['adapters']>,
  accountId?: string
): HybridAdapterConfig {
  return {
    mode: 'hybrid',
    cloudflare: {
      workerUrl,
      apiToken,
      accountId: accountId ?? '',
    },
    adapters,
  };
}

/**
 * Create an edge mode HybridAdapterConfig
 */
export function createEdgeHybridConfig(
  workerUrl: string,
  apiToken: string,
  accountId: string
): HybridAdapterConfig {
  return {
    mode: 'edge',
    cloudflare: {
      workerUrl,
      apiToken,
      accountId,
    },
  };
}

/**
 * Check if adapters are available for a given mode
 */
export function isAdapterModeSupported(mode: AdapterMode): boolean {
  switch (mode) {
    case 'local':
      return true;
    case 'hybrid':
      return true;
    case 'edge':
      return true; // Now supported via HTTP adapters
    default:
      return false;
  }
}

/**
 * Get the default adapter mode based on environment
 */
export function getDefaultAdapterMode(): AdapterMode {
  if (typeof globalThis !== 'undefined') {
    const hasCloudflareBindings =
      typeof (globalThis as Record<string, unknown>).caches !== 'undefined' &&
      typeof (globalThis as Record<string, unknown>).crypto !== 'undefined' &&
      typeof (globalThis as Record<string, unknown>).navigator === 'undefined';

    if (hasCloudflareBindings) {
      return 'edge';
    }
  }

  const envMode = process.env.JETPACK_ADAPTER_MODE;
  if (envMode === 'hybrid' || envMode === 'edge' || envMode === 'local') {
    return envMode;
  }

  return 'local';
}

// ============================================================================
// Adapter Factory Pattern
// ============================================================================

/**
 * Factory function type for creating adapters
 */
export interface AdapterFactories {
  createTaskStore: (config: { beadsDir: string; autoCommit: boolean; gitEnabled: boolean }) => ITaskStore;
  createMailBus: (config: { mailDir: string; agentId: string }) => IMailBus;
  createMemoryStore: (config: {
    cassDir: string;
    compactionThreshold: number;
    maxEntries: number;
    autoGenerateEmbeddings?: boolean;
  }) => IMemoryStore;
}

/**
 * Options for the createAdapters function
 */
export interface CreateAdaptersOptions {
  workDir: string;
  agentId: string;
  beads?: {
    autoCommit?: boolean;
    gitEnabled?: boolean;
  };
  cass?: {
    compactionThreshold?: number;
    maxEntries?: number;
    autoGenerateEmbeddings?: boolean;
  };
}

function getAdapterType(
  config: HybridAdapterConfig,
  component: 'tasks' | 'mail' | 'memory'
): 'local' | 'cloudflare' {
  if (config.mode === 'hybrid' && config.adapters?.[component]) {
    return config.adapters[component]!;
  }

  switch (config.mode) {
    case 'local':
      return 'local';
    case 'edge':
      return 'cloudflare';
    case 'hybrid':
      return 'local';
    default:
      return 'local';
  }
}

/**
 * Main factory function for creating adapters based on HybridAdapterConfig.
 */
export function createAdapters(
  config: HybridAdapterConfig,
  options: CreateAdaptersOptions,
  factories: AdapterFactories
): AdapterBundle {
  validateHybridAdapterConfig(config);

  const { workDir, agentId } = options;

  const taskAdapterType = getAdapterType(config, 'tasks');
  const mailAdapterType = getAdapterType(config, 'mail');
  const memoryAdapterType = getAdapterType(config, 'memory');

  // Build HTTP config if needed for cloudflare adapters
  const httpConfig: HttpAdapterConfig | null =
    config.cloudflare?.workerUrl && config.cloudflare?.apiToken
      ? {
          workerUrl: config.cloudflare.workerUrl,
          apiToken: config.cloudflare.apiToken,
        }
      : null;

  let taskStore: ITaskStore;
  if (taskAdapterType === 'cloudflare') {
    if (!httpConfig) {
      throw new AdapterConfigurationError(
        'Cloudflare task store requires workerUrl and apiToken in cloudflare config'
      );
    }
    taskStore = new HttpTaskStore(httpConfig);
  } else {
    taskStore = factories.createTaskStore({
      beadsDir: workDir + '/.beads',
      autoCommit: options.beads?.autoCommit ?? true,
      gitEnabled: options.beads?.gitEnabled ?? true,
    });
  }

  let mailBus: IMailBus;
  if (mailAdapterType === 'cloudflare') {
    if (!httpConfig) {
      throw new AdapterConfigurationError(
        'Cloudflare mail bus requires workerUrl and apiToken in cloudflare config'
      );
    }
    mailBus = new HttpMailBus({ ...httpConfig, agentId });
  } else {
    mailBus = factories.createMailBus({
      mailDir: workDir + '/.jetpack/mail',
      agentId,
    });
  }

  let memoryStore: IMemoryStore;
  if (memoryAdapterType === 'cloudflare') {
    if (!httpConfig) {
      throw new AdapterConfigurationError(
        'Cloudflare memory store requires workerUrl and apiToken in cloudflare config'
      );
    }
    memoryStore = new HttpMemoryStore(httpConfig);
  } else {
    memoryStore = factories.createMemoryStore({
      cassDir: workDir + '/.cass',
      compactionThreshold: options.cass?.compactionThreshold ?? 0.3,
      maxEntries: options.cass?.maxEntries ?? 10000,
      autoGenerateEmbeddings: options.cass?.autoGenerateEmbeddings ?? false,
    });
  }

  return {
    taskStore,
    mailBus,
    memoryStore,
    mode: config.mode,
  };
}
