/**
 * BUG-7 FIX: Graceful shutdown handler
 *
 * Provides consistent signal handling across Jetpack components.
 * Handles SIGINT (Ctrl+C) and SIGTERM (kill) signals gracefully.
 *
 * Exit codes:
 * - 0: Normal exit (handled gracefully)
 * - 1: Error during shutdown
 * - 128 + signal: Default Node.js behavior (e.g., 143 for SIGTERM)
 *
 * This utility ensures we always exit with code 0 for handled signals,
 * preventing false failure reports when processes are terminated gracefully.
 */

import { EventEmitter } from 'events';

/** Shutdown callback type */
export type ShutdownCallback = () => Promise<void> | void;

/** Shutdown state */
export interface ShutdownState {
  isShuttingDown: boolean;
  signal: string | null;
  startTime: Date | null;
}

/**
 * GracefulShutdownHandler manages the lifecycle of graceful shutdowns.
 *
 * It ensures that:
 * 1. Cleanup callbacks are called before exit
 * 2. Exit code is 0 for graceful shutdowns (not 143/SIGTERM)
 * 3. Only one shutdown sequence runs at a time
 * 4. A maximum timeout prevents hung shutdowns
 */
export class GracefulShutdownHandler extends EventEmitter {
  private callbacks: ShutdownCallback[] = [];
  private state: ShutdownState = {
    isShuttingDown: false,
    signal: null,
    startTime: null,
  };
  private maxShutdownTimeMs: number;
  private shutdownTimeout: NodeJS.Timeout | null = null;
  private signalHandlersRegistered = false;

  /**
   * Create a new graceful shutdown handler
   * @param maxShutdownTimeMs Maximum time to wait for cleanup (default: 30s)
   */
  constructor(maxShutdownTimeMs: number = 30000) {
    super();
    this.maxShutdownTimeMs = maxShutdownTimeMs;
  }

  /**
   * Register the handler for process signals (SIGINT, SIGTERM)
   * Should be called once at process startup.
   */
  register(): void {
    if (this.signalHandlersRegistered) {
      return;
    }

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => this.handleSignal('SIGINT'));

    // Handle SIGTERM (kill command, Docker stop, etc.)
    process.on('SIGTERM', () => this.handleSignal('SIGTERM'));

    // Handle uncaught exceptions during shutdown
    process.on('uncaughtException', (error) => {
      if (this.state.isShuttingDown) {
        console.error('Uncaught exception during shutdown:', error);
        this.forceExit(1);
      } else {
        throw error; // Let the default handler deal with it
      }
    });

    this.signalHandlersRegistered = true;
  }

  /**
   * Unregister signal handlers (useful for testing)
   */
  unregister(): void {
    if (!this.signalHandlersRegistered) {
      return;
    }

    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');

    this.signalHandlersRegistered = false;
  }

  /**
   * Add a cleanup callback to run before shutdown.
   * Callbacks are executed in the order they were added.
   */
  onShutdown(callback: ShutdownCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Remove a previously registered callback
   */
  offShutdown(callback: ShutdownCallback): void {
    const index = this.callbacks.indexOf(callback);
    if (index !== -1) {
      this.callbacks.splice(index, 1);
    }
  }

  /**
   * Clear all shutdown callbacks
   */
  clearCallbacks(): void {
    this.callbacks = [];
  }

  /**
   * Get current shutdown state
   */
  getState(): ShutdownState {
    return { ...this.state };
  }

  /**
   * Check if shutdown is in progress
   */
  isShuttingDown(): boolean {
    return this.state.isShuttingDown;
  }

  /**
   * Handle a signal and initiate graceful shutdown
   */
  private async handleSignal(signal: string): Promise<void> {
    // Prevent multiple simultaneous shutdowns
    if (this.state.isShuttingDown) {
      console.log(`\nReceived ${signal} again. Forcing immediate exit...`);
      this.forceExit(0);
      return;
    }

    this.state = {
      isShuttingDown: true,
      signal,
      startTime: new Date(),
    };

    this.emit('shutdown', signal);

    // Set up safety timeout
    this.shutdownTimeout = setTimeout(() => {
      console.error(`Shutdown timeout (${this.maxShutdownTimeMs}ms) exceeded. Forcing exit...`);
      this.forceExit(1);
    }, this.maxShutdownTimeMs);

    try {
      // Execute all cleanup callbacks
      for (const callback of this.callbacks) {
        try {
          await callback();
        } catch (error) {
          console.error('Error in shutdown callback:', error);
          // Continue with other callbacks
        }
      }

      // Clear the timeout and exit gracefully
      if (this.shutdownTimeout) {
        clearTimeout(this.shutdownTimeout);
        this.shutdownTimeout = null;
      }

      this.emit('complete', signal);

      // Exit with code 0 (success) instead of 128 + signal
      // This prevents BUG-7 where SIGTERM (143) was logged as failure
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      this.forceExit(1);
    }
  }

  /**
   * Force immediate exit
   */
  private forceExit(code: number): void {
    if (this.shutdownTimeout) {
      clearTimeout(this.shutdownTimeout);
      this.shutdownTimeout = null;
    }
    process.exit(code);
  }

  /**
   * Trigger shutdown programmatically (for testing or manual shutdown)
   */
  async shutdown(signal: string = 'SHUTDOWN'): Promise<void> {
    await this.handleSignal(signal);
  }
}

/**
 * Create a simple shutdown handler for common use cases.
 * This is a convenience function that creates a handler, registers it,
 * and returns a function to add cleanup callbacks.
 *
 * @example
 * ```typescript
 * const addShutdownHandler = createShutdownHandler();
 *
 * addShutdownHandler(async () => {
 *   await saveState();
 *   await closeConnections();
 * });
 * ```
 */
export function createShutdownHandler(
  maxShutdownTimeMs: number = 30000
): {
  handler: GracefulShutdownHandler;
  onShutdown: (callback: ShutdownCallback) => void;
} {
  const handler = new GracefulShutdownHandler(maxShutdownTimeMs);
  handler.register();

  return {
    handler,
    onShutdown: (callback: ShutdownCallback) => handler.onShutdown(callback),
  };
}

/** Singleton instance for global use */
let globalHandler: GracefulShutdownHandler | null = null;

/**
 * Get or create the global shutdown handler.
 * Use this when you need a shared handler across the application.
 */
export function getGlobalShutdownHandler(): GracefulShutdownHandler {
  if (!globalHandler) {
    globalHandler = new GracefulShutdownHandler();
    globalHandler.register();
  }
  return globalHandler;
}
