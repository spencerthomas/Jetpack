/**
 * BUG-7 FIX: Tests for graceful shutdown handling
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GracefulShutdownHandler, ShutdownCallback } from './gracefulShutdown';

// Mock process.exit to prevent actual exit during tests
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);

describe('GracefulShutdownHandler', () => {
  let handler: GracefulShutdownHandler;

  beforeEach(() => {
    handler = new GracefulShutdownHandler(5000); // 5s max shutdown time
    vi.clearAllMocks();
  });

  afterEach(() => {
    handler.unregister();
    handler.clearCallbacks();
  });

  describe('constructor', () => {
    it('should create handler with default timeout', () => {
      const defaultHandler = new GracefulShutdownHandler();
      expect(defaultHandler).toBeDefined();
      expect(defaultHandler.isShuttingDown()).toBe(false);
    });

    it('should create handler with custom timeout', () => {
      const customHandler = new GracefulShutdownHandler(10000);
      expect(customHandler).toBeDefined();
    });
  });

  describe('register/unregister', () => {
    it('should register signal handlers without throwing', () => {
      expect(() => handler.register()).not.toThrow();
    });

    it('should handle multiple register calls gracefully', () => {
      handler.register();
      expect(() => handler.register()).not.toThrow();
    });

    it('should unregister signal handlers without throwing', () => {
      handler.register();
      expect(() => handler.unregister()).not.toThrow();
    });

    it('should handle multiple unregister calls gracefully', () => {
      handler.unregister();
      expect(() => handler.unregister()).not.toThrow();
    });
  });

  describe('onShutdown/offShutdown', () => {
    it('should add shutdown callback', () => {
      const callback = vi.fn();
      handler.onShutdown(callback);
      expect(handler.getState().isShuttingDown).toBe(false);
    });

    it('should remove shutdown callback', () => {
      const callback = vi.fn();
      handler.onShutdown(callback);
      handler.offShutdown(callback);
      // Callback should not be called on shutdown
    });

    it('should handle removing non-existent callback', () => {
      const callback = vi.fn();
      expect(() => handler.offShutdown(callback)).not.toThrow();
    });

    it('should clear all callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      handler.onShutdown(callback1);
      handler.onShutdown(callback2);
      handler.clearCallbacks();
      // No callbacks should remain
    });
  });

  describe('getState', () => {
    it('should return initial state', () => {
      const state = handler.getState();
      expect(state.isShuttingDown).toBe(false);
      expect(state.signal).toBeNull();
      expect(state.startTime).toBeNull();
    });

    it('should return a copy of state (immutable)', () => {
      const state1 = handler.getState();
      const state2 = handler.getState();
      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  describe('isShuttingDown', () => {
    it('should return false initially', () => {
      expect(handler.isShuttingDown()).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('should execute callbacks in order', async () => {
      const order: number[] = [];

      handler.onShutdown(async () => {
        order.push(1);
      });
      handler.onShutdown(async () => {
        order.push(2);
      });
      handler.onShutdown(async () => {
        order.push(3);
      });

      await handler.shutdown('TEST');

      expect(order).toEqual([1, 2, 3]);
    });

    it('should call process.exit with code 0', async () => {
      await handler.shutdown('TEST');
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('should handle callback errors gracefully', async () => {
      handler.onShutdown(async () => {
        throw new Error('Callback error');
      });
      handler.onShutdown(async () => {
        // This should still run
      });

      // Should not throw, should continue to other callbacks
      await handler.shutdown('TEST');
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('should emit shutdown event', async () => {
      const shutdownHandler = vi.fn();
      handler.on('shutdown', shutdownHandler);

      await handler.shutdown('TEST');

      expect(shutdownHandler).toHaveBeenCalledWith('TEST');
    });

    it('should emit complete event', async () => {
      const completeHandler = vi.fn();
      handler.on('complete', completeHandler);

      await handler.shutdown('TEST');

      expect(completeHandler).toHaveBeenCalledWith('TEST');
    });

    it('should prevent multiple simultaneous shutdowns', async () => {
      let callCount = 0;
      handler.onShutdown(async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Start first shutdown
      const promise1 = handler.shutdown('TEST1');

      // Try to start second shutdown - should force exit
      const promise2 = handler.shutdown('TEST2');

      await Promise.all([promise1, promise2]);

      // First callback should have run, second shutdown should have forced exit
      expect(callCount).toBe(1);
    });
  });

  describe('async callbacks', () => {
    it('should wait for async callbacks to complete', async () => {
      let completed = false;

      handler.onShutdown(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        completed = true;
      });

      await handler.shutdown('TEST');

      expect(completed).toBe(true);
    });

    it('should handle sync callbacks', async () => {
      let called = false;

      handler.onShutdown(() => {
        called = true;
      });

      await handler.shutdown('TEST');

      expect(called).toBe(true);
    });
  });
});

describe('Exit code behavior (BUG-7)', () => {
  it('should exit with code 0 for SIGTERM (not 143)', async () => {
    const handler = new GracefulShutdownHandler();
    mockExit.mockClear();

    await handler.shutdown('SIGTERM');

    // BUG-7 FIX: Should exit with 0, not 128 + 15 = 143
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('should exit with code 0 for SIGINT (not 130)', async () => {
    const handler = new GracefulShutdownHandler();
    mockExit.mockClear();

    await handler.shutdown('SIGINT');

    // Should exit with 0, not 128 + 2 = 130
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});
