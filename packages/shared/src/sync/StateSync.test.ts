/**
 * Tests for StateSync - Bidirectional State Synchronization
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StateSync, ISyncableAdapter, createStateSync } from './StateSync';
import { ChangeLogEntry, SyncableEntityType, FullSyncResult } from './types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('StateSync', () => {
  let stateSync: StateSync;
  let testDir: string;

  const defaultConfig = {
    edgeUrl: 'https://api.jetpack.workers.dev/sync',
    clientId: 'test-client',
    syncDir: '',
    pollingIntervalMs: 1000,
    timeoutMs: 5000,
    maxRetries: 2,
    autoSync: false,
    batchSize: 10,
  };

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = path.join(
      os.tmpdir(),
      `statesync-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    fs.mkdirSync(testDir, { recursive: true });

    // Reset mocks
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(async () => {
    if (stateSync) {
      await stateSync.close();
    }

    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should create StateSync instance with default config', () => {
      stateSync = new StateSync({
        ...defaultConfig,
        syncDir: testDir,
      });

      expect(stateSync).toBeInstanceOf(StateSync);
      expect(stateSync.lastSyncAt).toBeNull();
      expect(stateSync.syncing).toBe(false);
    });

    it('should initialize and create sync directory', async () => {
      const syncDir = path.join(testDir, 'nested', 'sync');
      stateSync = new StateSync({
        ...defaultConfig,
        syncDir,
      });

      await stateSync.initialize();

      expect(fs.existsSync(syncDir)).toBe(true);
    });

    it('should load persisted state on initialize', async () => {
      // First, create and persist state
      const syncDir = path.join(testDir, 'sync');
      fs.mkdirSync(syncDir, { recursive: true });

      const stateFilePath = path.join(syncDir, 'sync-state.json');
      const persistedState = {
        lastSyncAt: '2024-01-15T10:00:00.000Z',
        status: 'idle',
        lastError: null,
        pendingChanges: 5,
        entitySyncTimes: {
          task: '2024-01-15T10:00:00.000Z',
          memory: null,
          message: null,
          plan: null,
        },
      };
      fs.writeFileSync(stateFilePath, JSON.stringify(persistedState), 'utf-8');

      stateSync = new StateSync({
        ...defaultConfig,
        syncDir,
      });

      await stateSync.initialize();

      const state = stateSync.getState();
      expect(state.lastSyncAt).toEqual(new Date('2024-01-15T10:00:00.000Z'));
      expect(state.pendingChanges).toBe(5);
      expect(state.entitySyncTimes.task).toEqual(new Date('2024-01-15T10:00:00.000Z'));
    });

    it('should throw error if sync() called before initialize()', async () => {
      stateSync = new StateSync({
        ...defaultConfig,
        syncDir: testDir,
      });

      await expect(stateSync.sync()).rejects.toThrow('StateSync not initialized');
    });
  });

  describe('registerAdapter', () => {
    it('should register adapter for entity type', async () => {
      stateSync = new StateSync({
        ...defaultConfig,
        syncDir: testDir,
      });

      await stateSync.initialize();

      const mockAdapter: ISyncableAdapter = {
        getChangesSince: vi.fn().mockResolvedValue([]),
        applyChanges: vi.fn().mockResolvedValue({ applied: 0, conflicts: 0 }),
      };

      stateSync.registerAdapter('task', mockAdapter);

      // Adapter should be used during sync
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            accepted: [],
            rejected: [],
            serverTimestamp: new Date().toISOString(),
          }),
      });

      await stateSync.pushToEdge();
      expect(mockAdapter.getChangesSince).toHaveBeenCalled();
    });
  });

  describe('pushToEdge', () => {
    beforeEach(async () => {
      stateSync = new StateSync({
        ...defaultConfig,
        syncDir: testDir,
      });
      await stateSync.initialize();
    });

    it('should return early if no changes to push', async () => {
      const result = await stateSync.pushToEdge([]);

      expect(result).toEqual({ pushed: 0, accepted: 0, rejected: 0 });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should push changes to edge successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            accepted: ['change-1', 'change-2'],
            rejected: [],
            serverTimestamp: new Date().toISOString(),
          }),
      });

      const changes: ChangeLogEntry[] = [
        {
          id: 'change-1',
          entityType: 'task',
          entityId: 'task-123',
          operation: 'create',
          syncVersion: 1,
          timestamp: Date.now(),
          payload: { title: 'Test task' },
        },
        {
          id: 'change-2',
          entityType: 'task',
          entityId: 'task-456',
          operation: 'update',
          syncVersion: 2,
          timestamp: Date.now(),
          payload: { status: 'completed' },
        },
      ];

      const result = await stateSync.pushToEdge(changes);

      expect(result).toEqual({ pushed: 2, accepted: 2, rejected: 0 });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/push'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Client-Id': 'test-client',
          }),
        })
      );
    });

    it('should handle rejected changes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            accepted: ['change-1'],
            rejected: [
              {
                id: 'change-2',
                reason: 'Version conflict',
                conflict: {
                  id: 'change-2-server',
                  entityType: 'task',
                  entityId: 'task-456',
                  operation: 'update',
                  syncVersion: 3,
                  timestamp: Date.now(),
                },
              },
            ],
            serverTimestamp: new Date().toISOString(),
          }),
      });

      const changes: ChangeLogEntry[] = [
        {
          id: 'change-1',
          entityType: 'task',
          entityId: 'task-123',
          operation: 'create',
          syncVersion: 1,
          timestamp: Date.now(),
        },
        {
          id: 'change-2',
          entityType: 'task',
          entityId: 'task-456',
          operation: 'update',
          syncVersion: 2,
          timestamp: Date.now(),
        },
      ];

      const conflictHandler = vi.fn();
      stateSync.on('sync:conflict', conflictHandler);

      const result = await stateSync.pushToEdge(changes);

      expect(result).toEqual({ pushed: 2, accepted: 1, rejected: 1 });
      expect(conflictHandler).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            local: 'change-2',
            remote: expect.objectContaining({ id: 'change-2-server' }),
          }),
        ])
      );
    });

    it('should batch large change sets', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            accepted: [],
            rejected: [],
            serverTimestamp: new Date().toISOString(),
          }),
      });

      // Create 25 changes (batch size is 10)
      const changes: ChangeLogEntry[] = Array.from({ length: 25 }, (_, i) => ({
        id: `change-${i}`,
        entityType: 'task' as const,
        entityId: `task-${i}`,
        operation: 'create' as const,
        syncVersion: i,
        timestamp: Date.now(),
      }));

      await stateSync.pushToEdge(changes);

      // Should make 3 batch requests (10 + 10 + 5)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should queue changes when network fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const changes: ChangeLogEntry[] = [
        {
          id: 'change-1',
          entityType: 'task',
          entityId: 'task-123',
          operation: 'create',
          syncVersion: 1,
          timestamp: Date.now(),
        },
      ];

      const result = await stateSync.pushToEdge(changes);

      expect(result).toEqual({ pushed: 1, accepted: 0, rejected: 1 });

      // Changes should be queued for offline retry
      const pendingCount = await stateSync.getPendingChangesCount();
      expect(pendingCount).toBeGreaterThan(0);
    });

    it('should emit push:complete event', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            accepted: ['change-1'],
            rejected: [],
            serverTimestamp: new Date().toISOString(),
          }),
      });

      const pushCompleteHandler = vi.fn();
      stateSync.on('push:complete', pushCompleteHandler);

      const changes: ChangeLogEntry[] = [
        {
          id: 'change-1',
          entityType: 'task',
          entityId: 'task-123',
          operation: 'create',
          syncVersion: 1,
          timestamp: Date.now(),
        },
      ];

      await stateSync.pushToEdge(changes);

      expect(pushCompleteHandler).toHaveBeenCalledWith({
        pushed: 1,
        accepted: 1,
        rejected: 0,
      });
    });
  });

  describe('pullFromEdge', () => {
    beforeEach(async () => {
      stateSync = new StateSync({
        ...defaultConfig,
        syncDir: testDir,
      });
      await stateSync.initialize();
    });

    it('should pull changes from edge', async () => {
      const serverChanges: ChangeLogEntry[] = [
        {
          id: 'server-change-1',
          entityType: 'task',
          entityId: 'task-789',
          operation: 'create',
          syncVersion: 10,
          timestamp: Date.now(),
          payload: { title: 'Remote task' },
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            changes: serverChanges,
            hasMore: false,
            serverTimestamp: new Date().toISOString(),
            latestVersion: 10,
          }),
      });

      const mockAdapter: ISyncableAdapter = {
        getChangesSince: vi.fn().mockResolvedValue([]),
        applyChanges: vi.fn().mockResolvedValue({ applied: 1, conflicts: 0 }),
      };

      stateSync.registerAdapter('task', mockAdapter);

      const result = await stateSync.pullFromEdge();

      expect(result).toEqual({ pulled: 1, applied: 1, conflicts: 0 });
      // Verify applyChanges was called with the changes (timestamp may be converted to Date)
      expect(mockAdapter.applyChanges).toHaveBeenCalledTimes(1);
      const calledWith = (mockAdapter.applyChanges as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(calledWith).toHaveLength(1);
      expect(calledWith[0]).toMatchObject({
        id: 'server-change-1',
        entityType: 'task',
        entityId: 'task-789',
        operation: 'create',
        syncVersion: 10,
        payload: { title: 'Remote task' },
      });
    });

    it('should handle paginated results', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              changes: [{ id: 'change-1', entityType: 'task', entityId: 'task-1', operation: 'create', syncVersion: 1, timestamp: Date.now() }],
              hasMore: true,
              serverTimestamp: new Date().toISOString(),
              latestVersion: 2,
              nextCursor: 'cursor-1',
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              changes: [{ id: 'change-2', entityType: 'task', entityId: 'task-2', operation: 'create', syncVersion: 2, timestamp: Date.now() }],
              hasMore: false,
              serverTimestamp: new Date().toISOString(),
              latestVersion: 2,
            }),
        });

      const mockAdapter: ISyncableAdapter = {
        getChangesSince: vi.fn().mockResolvedValue([]),
        applyChanges: vi.fn().mockResolvedValue({ applied: 1, conflicts: 0 }),
      };

      stateSync.registerAdapter('task', mockAdapter);

      const result = await stateSync.pullFromEdge();

      expect(result).toEqual({ pulled: 2, applied: 2, conflicts: 0 });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockAdapter.applyChanges).toHaveBeenCalledTimes(2);
    });

    it('should skip unregistered entity types', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            changes: [
              { id: 'change-1', entityType: 'unknown', entityId: 'item-1', operation: 'create', syncVersion: 1, timestamp: Date.now() },
            ],
            hasMore: false,
            serverTimestamp: new Date().toISOString(),
            latestVersion: 1,
          }),
      });

      const result = await stateSync.pullFromEdge();

      expect(result).toEqual({ pulled: 1, applied: 0, conflicts: 0 });
    });

    it('should emit pull:complete event', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            changes: [],
            hasMore: false,
            serverTimestamp: new Date().toISOString(),
            latestVersion: 0,
          }),
      });

      const pullCompleteHandler = vi.fn();
      stateSync.on('pull:complete', pullCompleteHandler);

      await stateSync.pullFromEdge();

      expect(pullCompleteHandler).toHaveBeenCalledWith({
        pulled: 0,
        applied: 0,
        conflicts: 0,
      });
    });
  });

  describe('sync', () => {
    beforeEach(async () => {
      stateSync = new StateSync({
        ...defaultConfig,
        syncDir: testDir,
      });
      await stateSync.initialize();
    });

    it('should perform full bidirectional sync', async () => {
      // When no adapters are registered and no explicit changes,
      // pushToEdge returns early without calling fetch.
      // Only pullFromEdge makes a request.
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            changes: [],
            hasMore: false,
            serverTimestamp: new Date().toISOString(),
            latestVersion: 0,
          }),
      });

      const result = await stateSync.sync();

      expect(result).toMatchObject({
        pushResult: { pushed: 0, accepted: 0, rejected: 0 },
        pullResult: { pulled: 0, applied: 0, conflicts: 0 },
      });
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.newSyncTimestamp).toBeInstanceOf(Date);
    });

    it('should emit sync events', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            accepted: [],
            rejected: [],
            changes: [],
            hasMore: false,
            serverTimestamp: new Date().toISOString(),
            latestVersion: 0,
          }),
      });

      const startHandler = vi.fn();
      const completeHandler = vi.fn();

      stateSync.on('sync:start', startHandler);
      stateSync.on('sync:complete', completeHandler);

      await stateSync.sync();

      expect(startHandler).toHaveBeenCalled();
      expect(completeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          pushResult: expect.any(Object),
          pullResult: expect.any(Object),
        })
      );
    });

    it('should prevent concurrent syncs', async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () =>
                    Promise.resolve({
                      success: true,
                      accepted: [],
                      rejected: [],
                      changes: [],
                      hasMore: false,
                      serverTimestamp: new Date().toISOString(),
                    }),
                }),
              100
            )
          )
      );

      // Start first sync
      const sync1 = stateSync.sync();

      // Try to start second sync while first is in progress
      await expect(stateSync.sync()).rejects.toThrow('Sync already in progress');

      await sync1;
    });

    it('should update lastSyncAt after successful sync', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            accepted: [],
            rejected: [],
            changes: [],
            hasMore: false,
            serverTimestamp: new Date().toISOString(),
          }),
      });

      expect(stateSync.lastSyncAt).toBeNull();

      await stateSync.sync();

      expect(stateSync.lastSyncAt).toBeInstanceOf(Date);
    });

    it('should persist state after sync', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            accepted: [],
            rejected: [],
            changes: [],
            hasMore: false,
            serverTimestamp: new Date().toISOString(),
          }),
      });

      await stateSync.sync();

      const stateFilePath = path.join(testDir, 'sync-state.json');
      expect(fs.existsSync(stateFilePath)).toBe(true);

      const persistedState = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
      expect(persistedState.lastSyncAt).toBeDefined();
      expect(persistedState.status).toBe('idle');
    });

    it('should handle sync errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'));

      const errorHandler = vi.fn();
      stateSync.on('sync:error', errorHandler);

      await expect(stateSync.sync()).rejects.toThrow('Network failure');

      expect(errorHandler).toHaveBeenCalled();
      expect(stateSync.getState().status).toBe('error');
      expect(stateSync.getState().lastError).toBe('Network failure');
    });
  });

  describe('auto-sync', () => {
    beforeEach(async () => {
      vi.useFakeTimers();

      stateSync = new StateSync({
        ...defaultConfig,
        syncDir: testDir,
        pollingIntervalMs: 1000,
      });
      await stateSync.initialize();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should start auto-sync with polling', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            accepted: [],
            rejected: [],
            changes: [],
            hasMore: false,
            serverTimestamp: new Date().toISOString(),
          }),
      });

      stateSync.startAutoSync();

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch.mock.calls.length).toBeGreaterThan(1);

      stateSync.stopAutoSync();
    });

    it('should stop auto-sync', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            accepted: [],
            rejected: [],
            changes: [],
            hasMore: false,
            serverTimestamp: new Date().toISOString(),
          }),
      });

      stateSync.startAutoSync();
      stateSync.stopAutoSync();

      const callsBefore = mockFetch.mock.calls.length;
      await vi.advanceTimersByTimeAsync(2000);

      expect(mockFetch.mock.calls.length).toBe(callsBefore);
    });

    it('should skip auto-sync if already syncing', async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () =>
                    Promise.resolve({
                      success: true,
                      accepted: [],
                      rejected: [],
                      changes: [],
                      hasMore: false,
                      serverTimestamp: new Date().toISOString(),
                    }),
                }),
              500
            )
          )
      );

      stateSync.startAutoSync();

      // Trigger first sync
      await vi.advanceTimersByTimeAsync(1000);

      // While first sync is in progress, trigger another interval
      await vi.advanceTimersByTimeAsync(500);

      // Only one sync should be in progress
      expect(mockFetch.mock.calls.length).toBe(1);

      stateSync.stopAutoSync();
    });
  });

  describe('retry logic', () => {
    beforeEach(async () => {
      stateSync = new StateSync({
        ...defaultConfig,
        syncDir: testDir,
        maxRetries: 3,
        timeoutMs: 100,
      });
      await stateSync.initialize();
    });

    it('should retry on failure with exponential backoff', async () => {
      vi.useFakeTimers();

      mockFetch
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              accepted: ['change-1'],
              rejected: [],
              serverTimestamp: new Date().toISOString(),
            }),
        });

      const changes: ChangeLogEntry[] = [
        {
          id: 'change-1',
          entityType: 'task',
          entityId: 'task-123',
          operation: 'create',
          syncVersion: 1,
          timestamp: Date.now(),
        },
      ];

      const pushPromise = stateSync.pushToEdge(changes);

      // First retry after 1s
      await vi.advanceTimersByTimeAsync(1000);
      // Second retry after 2s
      await vi.advanceTimersByTimeAsync(2000);

      const result = await pushPromise;

      expect(result).toEqual({ pushed: 1, accepted: 1, rejected: 0 });
      expect(mockFetch).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it('should fail after max retries', async () => {
      mockFetch.mockRejectedValue(new Error('Persistent failure'));

      const changes: ChangeLogEntry[] = [
        {
          id: 'change-1',
          entityType: 'task',
          entityId: 'task-123',
          operation: 'create',
          syncVersion: 1,
          timestamp: Date.now(),
        },
      ];

      // Changes should be queued for offline after retries exhausted
      const result = await stateSync.pushToEdge(changes);

      expect(result).toEqual({ pushed: 1, accepted: 0, rejected: 1 });
    });
  });

  describe('offline/online events', () => {
    beforeEach(async () => {
      stateSync = new StateSync({
        ...defaultConfig,
        syncDir: testDir,
      });
      await stateSync.initialize();
    });

    it('should emit offline event when network fails', async () => {
      // This tests that the OfflineQueue's offline event is forwarded
      const offlineHandler = vi.fn();
      stateSync.on('sync:offline', offlineHandler);

      // Trigger offline state through the queue
      // This would happen when the queue detects network failure
      stateSync['offlineQueue'].emit('offline');

      expect(offlineHandler).toHaveBeenCalled();
      expect(stateSync.getState().status).toBe('offline');
    });

    it('should emit online event when connection restored', async () => {
      const onlineHandler = vi.fn();
      stateSync.on('sync:online', onlineHandler);

      // Set offline first
      stateSync['offlineQueue'].emit('offline');
      expect(stateSync.getState().status).toBe('offline');

      // Restore connection
      stateSync['offlineQueue'].emit('online');

      expect(onlineHandler).toHaveBeenCalled();
      expect(stateSync.getState().status).toBe('idle');
    });
  });

  describe('createStateSync factory', () => {
    it('should create StateSync instance', () => {
      const sync = createStateSync({
        ...defaultConfig,
        syncDir: testDir,
      });

      expect(sync).toBeInstanceOf(StateSync);
    });
  });

  describe('getState', () => {
    beforeEach(async () => {
      stateSync = new StateSync({
        ...defaultConfig,
        syncDir: testDir,
      });
      await stateSync.initialize();
    });

    it('should return copy of state', () => {
      const state1 = stateSync.getState();
      const state2 = stateSync.getState();

      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2); // Should be different objects
    });

    it('should include all state fields', () => {
      const state = stateSync.getState();

      expect(state).toHaveProperty('lastSyncAt');
      expect(state).toHaveProperty('status');
      expect(state).toHaveProperty('lastError');
      expect(state).toHaveProperty('pendingChanges');
      expect(state).toHaveProperty('entitySyncTimes');
    });
  });
});
