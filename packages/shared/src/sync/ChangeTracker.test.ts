/**
 * Tests for ChangeTracker
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ChangeTracker } from './ChangeTracker';
import { SyncableEntityType, ChangeOperation } from './types';

describe('ChangeTracker', () => {
  let tracker: ChangeTracker;
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = path.join(
      os.tmpdir(),
      `change-tracker-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    fs.mkdirSync(testDir, { recursive: true });

    tracker = new ChangeTracker({
      syncDir: testDir,
      maxEntries: 100,
    });

    await tracker.initialize();
  });

  afterEach(() => {
    tracker.close();

    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should initialize and create database', async () => {
      const dbPath = path.join(testDir, 'changelog.db');
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('should create sync directory if it does not exist', async () => {
      const newDir = path.join(testDir, 'nested', 'sync');
      const newTracker = new ChangeTracker({ syncDir: newDir });
      await newTracker.initialize();

      expect(fs.existsSync(newDir)).toBe(true);
      newTracker.close();
    });

    it('should start with sync version 0', async () => {
      const version = tracker.getCurrentSyncVersion();
      expect(version).toBe(0);
    });

    it('should persist data across reopens', async () => {
      tracker.recordChange('task', 'bd-123', 'create', { title: 'Test' });
      tracker.close();

      const newTracker = new ChangeTracker({ syncDir: testDir });
      await newTracker.initialize();

      const changes = newTracker.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].entityId).toBe('bd-123');

      newTracker.close();
    });
  });

  describe('recordChange', () => {
    it('should record a create change', () => {
      const version = tracker.recordChange('task', 'bd-123', 'create', {
        title: 'Test Task',
        status: 'pending',
      });

      expect(version).toBe(1);

      const changes = tracker.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].entityType).toBe('task');
      expect(changes[0].entityId).toBe('bd-123');
      expect(changes[0].operation).toBe('create');
      expect(changes[0].syncVersion).toBe(1);
      expect(changes[0].payload).toEqual({ title: 'Test Task', status: 'pending' });
    });

    it('should record an update change', () => {
      const version = tracker.recordChange('memory', 'mem-456', 'update', {
        content: 'Updated content',
      });

      expect(version).toBe(1);

      const changes = tracker.getChanges();
      expect(changes[0].operation).toBe('update');
    });

    it('should record a delete change without payload', () => {
      const version = tracker.recordChange('message', 'msg-789', 'delete');

      expect(version).toBe(1);

      const changes = tracker.getChanges();
      expect(changes[0].operation).toBe('delete');
      expect(changes[0].payload).toBeUndefined();
    });

    it('should increment sync version for each change', () => {
      const v1 = tracker.recordChange('task', 'bd-1', 'create');
      const v2 = tracker.recordChange('task', 'bd-2', 'create');
      const v3 = tracker.recordChange('task', 'bd-3', 'create');

      expect(v1).toBe(1);
      expect(v2).toBe(2);
      expect(v3).toBe(3);
      expect(tracker.getCurrentSyncVersion()).toBe(3);
    });

    it('should record timestamp for each change', () => {
      const beforeTime = Date.now();
      tracker.recordChange('task', 'bd-123', 'create');
      const afterTime = Date.now();

      const changes = tracker.getChanges();
      expect(changes[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(changes[0].timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should support all entity types', () => {
      const entityTypes: SyncableEntityType[] = ['task', 'memory', 'message', 'plan'];

      for (const entityType of entityTypes) {
        tracker.recordChange(entityType, `${entityType}-1`, 'create');
      }

      const changes = tracker.getChanges();
      expect(changes).toHaveLength(4);

      const recordedTypes = changes.map((c) => c.entityType);
      expect(recordedTypes).toEqual(entityTypes);
    });

    it('should support all operation types', () => {
      const operations: ChangeOperation[] = ['create', 'update', 'delete'];

      for (const op of operations) {
        tracker.recordChange('task', `task-${op}`, op);
      }

      const changes = tracker.getChanges();
      const recordedOps = changes.map((c) => c.operation);
      expect(recordedOps).toEqual(operations);
    });
  });

  describe('getChanges', () => {
    beforeEach(() => {
      // Set up test data
      tracker.recordChange('task', 'bd-1', 'create', { title: 'Task 1' });
      tracker.recordChange('memory', 'mem-1', 'create', { content: 'Memory 1' });
      tracker.recordChange('task', 'bd-2', 'create', { title: 'Task 2' });
      tracker.recordChange('task', 'bd-1', 'update', { status: 'completed' });
      tracker.recordChange('message', 'msg-1', 'create');
    });

    it('should return all changes in version order', () => {
      const changes = tracker.getChanges();
      expect(changes).toHaveLength(5);

      for (let i = 1; i < changes.length; i++) {
        expect(changes[i].syncVersion).toBeGreaterThan(changes[i - 1].syncVersion);
      }
    });

    it('should filter by sinceVersion', () => {
      const changes = tracker.getChanges({ sinceVersion: 2 });
      expect(changes).toHaveLength(3);
      expect(changes[0].syncVersion).toBe(3);
    });

    it('should filter by entity types', () => {
      const changes = tracker.getChanges({ entityTypes: ['task'] });
      expect(changes).toHaveLength(3);
      expect(changes.every((c) => c.entityType === 'task')).toBe(true);
    });

    it('should filter by multiple entity types', () => {
      const changes = tracker.getChanges({ entityTypes: ['task', 'memory'] });
      expect(changes).toHaveLength(4);
    });

    it('should respect limit', () => {
      const changes = tracker.getChanges({ limit: 2 });
      expect(changes).toHaveLength(2);
      expect(changes[0].syncVersion).toBe(1);
      expect(changes[1].syncVersion).toBe(2);
    });

    it('should combine sinceVersion and entityTypes filters', () => {
      const changes = tracker.getChanges({
        sinceVersion: 1,
        entityTypes: ['task'],
      });
      expect(changes).toHaveLength(2);
      expect(changes.every((c) => c.entityType === 'task' && c.syncVersion > 1)).toBe(true);
    });
  });

  describe('getLatestChanges', () => {
    it('should return deduplicated changes per entity', () => {
      tracker.recordChange('task', 'bd-1', 'create', { v: 1 });
      tracker.recordChange('task', 'bd-1', 'update', { v: 2 });
      tracker.recordChange('task', 'bd-1', 'update', { v: 3 });
      tracker.recordChange('task', 'bd-2', 'create', { v: 1 });

      const latest = tracker.getLatestChanges();

      expect(latest.size).toBe(2);
      expect(latest.get('task:bd-1')?.payload).toEqual({ v: 3 });
      expect(latest.get('task:bd-2')?.payload).toEqual({ v: 1 });
    });

    it('should respect sinceVersion filter', () => {
      tracker.recordChange('task', 'bd-1', 'create');
      tracker.recordChange('task', 'bd-1', 'update');
      tracker.recordChange('task', 'bd-2', 'create');

      const latest = tracker.getLatestChanges(2);

      expect(latest.size).toBe(1);
      expect(latest.has('task:bd-2')).toBe(true);
    });

    it('should respect entityTypes filter', () => {
      tracker.recordChange('task', 'bd-1', 'create');
      tracker.recordChange('memory', 'mem-1', 'create');
      tracker.recordChange('task', 'bd-1', 'update');

      const latest = tracker.getLatestChanges(0, ['task']);

      expect(latest.size).toBe(1);
      expect(latest.has('task:bd-1')).toBe(true);
    });
  });

  describe('getSyncMetadata', () => {
    it('should return default metadata initially', () => {
      const metadata = tracker.getSyncMetadata();

      expect(metadata.lastSyncVersion).toBe(0);
      expect(metadata.lastSyncTimestamp).toBe(0);
      expect(metadata.deviceId).toBeDefined();
    });

    it('should use configured device ID', async () => {
      tracker.close();

      const customTracker = new ChangeTracker({
        syncDir: testDir,
        deviceId: 'custom-device-123',
      });
      await customTracker.initialize();

      const metadata = customTracker.getSyncMetadata();
      expect(metadata.deviceId).toBe('custom-device-123');

      customTracker.close();
    });
  });

  describe('updateSyncMetadata', () => {
    it('should update last sync version and timestamp', () => {
      const beforeTime = Date.now();
      tracker.updateSyncMetadata(10);
      const afterTime = Date.now();

      const metadata = tracker.getSyncMetadata();

      expect(metadata.lastSyncVersion).toBe(10);
      expect(metadata.lastSyncTimestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(metadata.lastSyncTimestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('compact', () => {
    it('should remove old entries while keeping latest per entity', () => {
      // Create multiple changes for same entity
      tracker.recordChange('task', 'bd-1', 'create');
      tracker.recordChange('task', 'bd-1', 'update');
      tracker.recordChange('task', 'bd-1', 'update');
      tracker.recordChange('task', 'bd-2', 'create');

      // Mark version 3 as synced
      tracker.updateSyncMetadata(3);

      const removed = tracker.compact();

      // Should remove old versions of bd-1 but keep the latest
      expect(removed).toBe(2);

      const changes = tracker.getChanges();
      expect(changes).toHaveLength(2);
    });

    it('should not compact if lastSyncVersion is 0', () => {
      tracker.recordChange('task', 'bd-1', 'create');
      tracker.recordChange('task', 'bd-1', 'update');

      const removed = tracker.compact();

      expect(removed).toBe(0);
    });

    it('should accept explicit beforeVersion', () => {
      tracker.recordChange('task', 'bd-1', 'create');
      tracker.recordChange('task', 'bd-1', 'update');
      tracker.recordChange('task', 'bd-1', 'update');

      const removed = tracker.compact(2);

      // Compact removes entries <= version 2, but keeps latest per entity
      // All 3 entries are for bd-1, latest is version 3
      // So versions 1 and 2 can be removed
      expect(removed).toBe(2);
    });
  });

  describe('adaptiveCompact', () => {
    it('should not compact when under maxEntries', async () => {
      tracker.close();

      const smallTracker = new ChangeTracker({
        syncDir: testDir,
        maxEntries: 10,
      });
      await smallTracker.initialize();

      for (let i = 0; i < 5; i++) {
        smallTracker.recordChange('task', `bd-${i}`, 'create');
      }

      const removed = smallTracker.adaptiveCompact();
      expect(removed).toBe(0);

      smallTracker.close();
    });

    it('should compact when over maxEntries', async () => {
      tracker.close();

      const smallTracker = new ChangeTracker({
        syncDir: testDir,
        maxEntries: 5,
      });
      await smallTracker.initialize();

      // Create 10 changes for 2 entities (5 each)
      for (let i = 0; i < 5; i++) {
        smallTracker.recordChange('task', 'bd-1', 'update');
      }
      for (let i = 0; i < 5; i++) {
        smallTracker.recordChange('task', 'bd-2', 'update');
      }

      const removed = smallTracker.adaptiveCompact();

      // Should remove all but the most recent entry per entity
      expect(removed).toBe(8);

      const changes = smallTracker.getChanges();
      expect(changes).toHaveLength(2);

      smallTracker.close();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      tracker.recordChange('task', 'bd-1', 'create');
      tracker.recordChange('task', 'bd-2', 'update');
      tracker.recordChange('memory', 'mem-1', 'create');
      tracker.recordChange('task', 'bd-1', 'delete');

      const stats = tracker.getStats();

      expect(stats.totalEntries).toBe(4);
      expect(stats.byEntityType.task).toBe(3);
      expect(stats.byEntityType.memory).toBe(1);
      expect(stats.byOperation.create).toBe(2);
      expect(stats.byOperation.update).toBe(1);
      expect(stats.byOperation.delete).toBe(1);
      expect(stats.currentSyncVersion).toBe(4);
      expect(stats.oldestEntry).not.toBeNull();
      expect(stats.newestEntry).not.toBeNull();
    });

    it('should return empty stats when no changes', () => {
      const stats = tracker.getStats();

      expect(stats.totalEntries).toBe(0);
      expect(stats.byEntityType).toEqual({});
      expect(stats.byOperation).toEqual({});
      expect(stats.currentSyncVersion).toBe(0);
      expect(stats.oldestEntry).toBeNull();
      expect(stats.newestEntry).toBeNull();
    });
  });

  describe('hasUnsyncedChanges', () => {
    it('should return false when no changes', () => {
      expect(tracker.hasUnsyncedChanges()).toBe(false);
    });

    it('should return true when there are unsynced changes', () => {
      tracker.recordChange('task', 'bd-1', 'create');
      expect(tracker.hasUnsyncedChanges()).toBe(true);
    });

    it('should return false after syncing all changes', () => {
      tracker.recordChange('task', 'bd-1', 'create');
      tracker.recordChange('task', 'bd-2', 'create');

      tracker.updateSyncMetadata(2);

      expect(tracker.hasUnsyncedChanges()).toBe(false);
    });

    it('should respect sinceVersion parameter', () => {
      tracker.recordChange('task', 'bd-1', 'create');
      tracker.recordChange('task', 'bd-2', 'create');

      expect(tracker.hasUnsyncedChanges(1)).toBe(true);
      expect(tracker.hasUnsyncedChanges(2)).toBe(false);
    });
  });

  describe('getDeletedEntityIds', () => {
    it('should return deleted entity IDs since version', () => {
      tracker.recordChange('task', 'bd-1', 'create');
      tracker.recordChange('task', 'bd-2', 'create');
      tracker.recordChange('task', 'bd-1', 'delete');
      tracker.recordChange('memory', 'mem-1', 'delete');

      const deleted = tracker.getDeletedEntityIds(0);

      expect(deleted).toHaveLength(2);
      expect(deleted).toContain('bd-1');
      expect(deleted).toContain('mem-1');
    });

    it('should filter by entity type', () => {
      tracker.recordChange('task', 'bd-1', 'delete');
      tracker.recordChange('memory', 'mem-1', 'delete');

      const deleted = tracker.getDeletedEntityIds(0, 'task');

      expect(deleted).toHaveLength(1);
      expect(deleted).toContain('bd-1');
    });

    it('should respect sinceVersion', () => {
      tracker.recordChange('task', 'bd-1', 'delete'); // version 1
      tracker.recordChange('task', 'bd-2', 'delete'); // version 2

      const deleted = tracker.getDeletedEntityIds(1);

      expect(deleted).toHaveLength(1);
      expect(deleted).toContain('bd-2');
    });
  });

  describe('clear', () => {
    it('should remove all changes and reset sync version', () => {
      tracker.recordChange('task', 'bd-1', 'create');
      tracker.recordChange('task', 'bd-2', 'create');

      expect(tracker.getCurrentSyncVersion()).toBe(2);

      tracker.clear();

      expect(tracker.getChanges()).toHaveLength(0);
      expect(tracker.getCurrentSyncVersion()).toBe(0);
    });
  });

  describe('concurrent access', () => {
    it('should handle multiple rapid changes', () => {
      const promises: number[] = [];

      for (let i = 0; i < 100; i++) {
        const version = tracker.recordChange('task', `bd-${i}`, 'create');
        promises.push(version);
      }

      // All versions should be unique and sequential
      const uniqueVersions = new Set(promises);
      expect(uniqueVersions.size).toBe(100);
      expect(Math.max(...promises)).toBe(100);
    });
  });
});
