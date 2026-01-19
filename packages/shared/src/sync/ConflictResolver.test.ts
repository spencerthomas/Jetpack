import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConflictResolver,
  createConflictResolver,
  SyncableRecord,
  ConflictResolution,
  ConflictStrategy,
} from './ConflictResolver';
import { LogLevel } from '../utils/logger';

interface TestRecord extends SyncableRecord {
  id: string;
  title: string;
  status: string;
  priority?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  updatedAt?: Date | string;
  deletedAt?: Date | string | null;
}

describe('ConflictResolver', () => {
  let resolver: ConflictResolver<TestRecord>;

  beforeEach(() => {
    resolver = new ConflictResolver<TestRecord>('TestRecord', LogLevel.ERROR);
  });

  describe('Last-Write-Wins Strategy', () => {
    it('should prefer local when local is newer', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Local Title',
        status: 'active',
        updatedAt: new Date('2024-01-02T12:00:00Z'),
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote Title',
        status: 'inactive',
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      const result = resolver.resolve(local, remote);

      expect(result.winner).toBe('local');
      expect(result.resolved.title).toBe('Local Title');
      expect(result.resolved.status).toBe('active');
      expect(result.hadConflict).toBe(true);
      expect(result.strategy).toBe('last-write-wins');
    });

    it('should prefer remote when remote is newer', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Local Title',
        status: 'active',
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote Title',
        status: 'inactive',
        updatedAt: new Date('2024-01-02T12:00:00Z'),
      };

      const result = resolver.resolve(local, remote);

      expect(result.winner).toBe('remote');
      expect(result.resolved.title).toBe('Remote Title');
      expect(result.resolved.status).toBe('inactive');
      expect(result.hadConflict).toBe(true);
    });

    it('should detect field conflicts correctly', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Same Title',
        status: 'active',
        priority: 1,
        updatedAt: new Date('2024-01-02T12:00:00Z'),
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Same Title',
        status: 'inactive',
        priority: 2,
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      const result = resolver.resolve(local, remote);

      expect(result.hadConflict).toBe(true);
      expect(result.fieldConflicts).toHaveLength(2);

      const statusConflict = result.fieldConflicts.find(c => c.field === 'status');
      expect(statusConflict).toBeDefined();
      expect(statusConflict?.localValue).toBe('active');
      expect(statusConflict?.remoteValue).toBe('inactive');

      const priorityConflict = result.fieldConflicts.find(c => c.field === 'priority');
      expect(priorityConflict).toBeDefined();
      expect(priorityConflict?.localValue).toBe(1);
      expect(priorityConflict?.remoteValue).toBe(2);
    });

    it('should report no conflict when records are identical', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Same Title',
        status: 'active',
        updatedAt: new Date('2024-01-02T12:00:00Z'),
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Same Title',
        status: 'active',
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      const result = resolver.resolve(local, remote);

      expect(result.hadConflict).toBe(false);
      expect(result.fieldConflicts).toHaveLength(0);
    });
  });

  describe('First-Write-Wins Strategy', () => {
    it('should prefer older record', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Local Title',
        status: 'active',
        updatedAt: new Date('2024-01-02T12:00:00Z'),
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote Title',
        status: 'inactive',
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      const result = resolver.resolve(local, remote, 'first-write-wins');

      expect(result.winner).toBe('remote');
      expect(result.resolved.title).toBe('Remote Title');
      expect(result.strategy).toBe('first-write-wins');
    });
  });

  describe('Prefer-Local Strategy', () => {
    it('should always prefer local regardless of timestamps', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Local Title',
        status: 'active',
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote Title',
        status: 'inactive',
        updatedAt: new Date('2024-01-02T12:00:00Z'),
      };

      const result = resolver.resolve(local, remote, 'prefer-local');

      expect(result.winner).toBe('local');
      expect(result.resolved.title).toBe('Local Title');
      expect(result.strategy).toBe('prefer-local');
    });
  });

  describe('Prefer-Remote Strategy', () => {
    it('should always prefer remote regardless of timestamps', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Local Title',
        status: 'active',
        updatedAt: new Date('2024-01-02T12:00:00Z'),
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote Title',
        status: 'inactive',
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      const result = resolver.resolve(local, remote, 'prefer-remote');

      expect(result.winner).toBe('remote');
      expect(result.resolved.title).toBe('Remote Title');
      expect(result.strategy).toBe('prefer-remote');
    });
  });

  describe('Missing Timestamps Edge Cases', () => {
    it('should prefer local when both timestamps are missing', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Local Title',
        status: 'active',
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote Title',
        status: 'inactive',
      };

      const result = resolver.resolve(local, remote);

      expect(result.winner).toBe('local');
      expect(result.resolved.title).toBe('Local Title');
      expect(result.timestamps.local).toBeNull();
      expect(result.timestamps.remote).toBeNull();
      expect(result.timestamps.difference).toBeNull();
    });

    it('should prefer remote when only local timestamp is missing', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Local Title',
        status: 'active',
        // No updatedAt
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote Title',
        status: 'inactive',
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      const result = resolver.resolve(local, remote);

      expect(result.winner).toBe('remote');
      expect(result.resolved.title).toBe('Remote Title');
    });

    it('should prefer local when only remote timestamp is missing', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Local Title',
        status: 'active',
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote Title',
        status: 'inactive',
        // No updatedAt
      };

      const result = resolver.resolve(local, remote);

      expect(result.winner).toBe('local');
      expect(result.resolved.title).toBe('Local Title');
    });
  });

  describe('Equal Timestamps Edge Case', () => {
    it('should prefer local when timestamps are exactly equal', () => {
      const timestamp = new Date('2024-01-01T12:00:00Z');

      const local: TestRecord = {
        id: 'test-1',
        title: 'Local Title',
        status: 'active',
        updatedAt: timestamp,
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote Title',
        status: 'inactive',
        updatedAt: timestamp,
      };

      const result = resolver.resolve(local, remote);

      expect(result.winner).toBe('local');
      expect(result.resolved.title).toBe('Local Title');
      expect(result.timestamps.difference).toBe(0);
    });
  });

  describe('Deleted Records Edge Cases', () => {
    it('should prefer deleted record when deletion is newer than remote update', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Local Title',
        status: 'active',
        updatedAt: new Date('2024-01-01T12:00:00Z'),
        deletedAt: new Date('2024-01-03T12:00:00Z'),
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote Title',
        status: 'inactive',
        updatedAt: new Date('2024-01-02T12:00:00Z'),
        deletedAt: null,
      };

      const result = resolver.resolve(local, remote);

      expect(result.winner).toBe('local');
      expect(result.resolved.deletedAt).not.toBeNull();
    });

    it('should resurrect record when update is after deletion', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Local Title',
        status: 'active',
        updatedAt: new Date('2024-01-01T12:00:00Z'),
        deletedAt: new Date('2024-01-02T12:00:00Z'),
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote Title',
        status: 'inactive',
        updatedAt: new Date('2024-01-03T12:00:00Z'),
        deletedAt: null,
      };

      const result = resolver.resolve(local, remote);

      expect(result.winner).toBe('remote');
      expect(result.resolved.deletedAt).toBeNull();
      expect(result.resolved.title).toBe('Remote Title');
    });

    it('should prefer more recent deletion when both are deleted', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Local Title',
        status: 'active',
        updatedAt: new Date('2024-01-01T12:00:00Z'),
        deletedAt: new Date('2024-01-03T12:00:00Z'),
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote Title',
        status: 'inactive',
        updatedAt: new Date('2024-01-02T12:00:00Z'),
        deletedAt: new Date('2024-01-02T12:00:00Z'),
      };

      const result = resolver.resolve(local, remote);

      expect(result.winner).toBe('local');
      // Local deletion is newer
    });

    it('should prefer local when both deleted with missing timestamps', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Local Title',
        status: 'active',
        deletedAt: 'not-a-date', // Invalid timestamp
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote Title',
        status: 'inactive',
        deletedAt: 'also-not-a-date', // Invalid timestamp
      };

      const result = resolver.resolve(local, remote);

      expect(result.winner).toBe('local');
    });
  });

  describe('Timestamp String Handling', () => {
    it('should parse ISO string timestamps correctly', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Local Title',
        status: 'active',
        updatedAt: '2024-01-02T12:00:00Z',
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote Title',
        status: 'inactive',
        updatedAt: '2024-01-01T12:00:00Z',
      };

      const result = resolver.resolve(local, remote);

      expect(result.winner).toBe('local');
      expect(result.timestamps.local?.toISOString()).toBe('2024-01-02T12:00:00.000Z');
    });

    it('should handle invalid date strings gracefully', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Local Title',
        status: 'active',
        updatedAt: 'not-a-valid-date',
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote Title',
        status: 'inactive',
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      const result = resolver.resolve(local, remote);

      expect(result.winner).toBe('remote');
      expect(result.timestamps.local).toBeNull();
    });
  });

  describe('Deep Equality for Arrays and Objects', () => {
    it('should detect array differences', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Title',
        status: 'active',
        tags: ['a', 'b', 'c'],
        updatedAt: new Date('2024-01-02T12:00:00Z'),
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Title',
        status: 'active',
        tags: ['a', 'b'],
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      const result = resolver.resolve(local, remote);

      expect(result.hadConflict).toBe(true);
      const tagsConflict = result.fieldConflicts.find(c => c.field === 'tags');
      expect(tagsConflict).toBeDefined();
    });

    it('should detect nested object differences', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Title',
        status: 'active',
        metadata: { nested: { value: 1 } },
        updatedAt: new Date('2024-01-02T12:00:00Z'),
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Title',
        status: 'active',
        metadata: { nested: { value: 2 } },
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      const result = resolver.resolve(local, remote);

      expect(result.hadConflict).toBe(true);
      const metadataConflict = result.fieldConflicts.find(c => c.field === 'metadata');
      expect(metadataConflict).toBeDefined();
    });

    it('should report no conflict for identical arrays and objects', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Title',
        status: 'active',
        tags: ['a', 'b', 'c'],
        metadata: { key: 'value' },
        updatedAt: new Date('2024-01-02T12:00:00Z'),
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Title',
        status: 'active',
        tags: ['a', 'b', 'c'],
        metadata: { key: 'value' },
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      const result = resolver.resolve(local, remote);

      expect(result.hadConflict).toBe(false);
    });
  });

  describe('Batch Resolution', () => {
    it('should resolve multiple record pairs', () => {
      const pairs = [
        {
          local: {
            id: 'test-1',
            title: 'Local 1',
            status: 'active',
            updatedAt: new Date('2024-01-02T12:00:00Z'),
          } as TestRecord,
          remote: {
            id: 'test-1',
            title: 'Remote 1',
            status: 'inactive',
            updatedAt: new Date('2024-01-01T12:00:00Z'),
          } as TestRecord,
        },
        {
          local: {
            id: 'test-2',
            title: 'Local 2',
            status: 'active',
            updatedAt: new Date('2024-01-01T12:00:00Z'),
          } as TestRecord,
          remote: {
            id: 'test-2',
            title: 'Remote 2',
            status: 'inactive',
            updatedAt: new Date('2024-01-02T12:00:00Z'),
          } as TestRecord,
        },
      ];

      const results = resolver.resolveBatch(pairs);

      expect(results).toHaveLength(2);
      expect(results[0].winner).toBe('local');
      expect(results[1].winner).toBe('remote');
    });
  });

  describe('Conflict Logging', () => {
    it('should log conflicts for debugging', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Local Title',
        status: 'active',
        updatedAt: new Date('2024-01-02T12:00:00Z'),
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote Title',
        status: 'inactive',
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      resolver.resolve(local, remote);

      const log = resolver.getConflictLog();
      expect(log).toHaveLength(1);
      expect(log[0].recordId).toBe('test-1');
      expect(log[0].recordType).toBe('TestRecord');
      expect(log[0].winner).toBe('local');
    });

    it('should track conflicts for specific records', () => {
      const records = [
        { id: 'test-1', title: 'A', status: 'active', updatedAt: new Date() },
        { id: 'test-2', title: 'B', status: 'active', updatedAt: new Date() },
      ];

      // Resolve with conflicts
      resolver.resolve(
        { ...records[0], title: 'Local A' } as TestRecord,
        { ...records[0], title: 'Remote A', updatedAt: new Date(Date.now() - 1000) } as TestRecord
      );
      resolver.resolve(
        { ...records[1], title: 'Local B' } as TestRecord,
        { ...records[1], title: 'Remote B', updatedAt: new Date(Date.now() - 1000) } as TestRecord
      );

      const test1Conflicts = resolver.getConflictsForRecord('test-1');
      expect(test1Conflicts).toHaveLength(1);

      const test2Conflicts = resolver.getConflictsForRecord('test-2');
      expect(test2Conflicts).toHaveLength(1);
    });

    it('should provide conflict statistics', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Local Title',
        status: 'active',
        updatedAt: new Date('2024-01-02T12:00:00Z'),
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote Title',
        status: 'inactive',
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      resolver.resolve(local, remote);
      resolver.resolve(
        { ...remote, id: 'test-2', updatedAt: new Date('2024-01-03T12:00:00Z') } as TestRecord,
        { ...local, id: 'test-2' } as TestRecord
      );

      const stats = resolver.getConflictStats();
      expect(stats.total).toBe(2);
      expect(stats.byWinner['local']).toBe(2);
      expect(stats.byStrategy['last-write-wins']).toBe(2);
    });

    it('should clear conflict log', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Local Title',
        status: 'active',
        updatedAt: new Date('2024-01-02T12:00:00Z'),
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote Title',
        status: 'inactive',
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      resolver.resolve(local, remote);
      expect(resolver.getConflictLog()).toHaveLength(1);

      resolver.clearConflictLog();
      expect(resolver.getConflictLog()).toHaveLength(0);
    });
  });

  describe('Factory Function', () => {
    it('should create typed resolver', () => {
      const typedResolver = createConflictResolver<TestRecord>('Task');

      const local: TestRecord = {
        id: 'test-1',
        title: 'Local',
        status: 'active',
        updatedAt: new Date('2024-01-02T12:00:00Z'),
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote',
        status: 'inactive',
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      const result = typedResolver.resolve(local, remote);
      expect(result.winner).toBe('local');
    });
  });

  describe('Timestamps Reporting', () => {
    it('should report timestamp difference in milliseconds', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Local Title',
        status: 'active',
        updatedAt: new Date('2024-01-02T12:00:00Z'),
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote Title',
        status: 'inactive',
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      const result = resolver.resolve(local, remote);

      // 24 hours in milliseconds
      expect(result.timestamps.difference).toBe(24 * 60 * 60 * 1000);
    });

    it('should report negative difference when remote is newer', () => {
      const local: TestRecord = {
        id: 'test-1',
        title: 'Local Title',
        status: 'active',
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      const remote: TestRecord = {
        id: 'test-1',
        title: 'Remote Title',
        status: 'inactive',
        updatedAt: new Date('2024-01-02T12:00:00Z'),
      };

      const result = resolver.resolve(local, remote);

      // -24 hours in milliseconds
      expect(result.timestamps.difference).toBe(-24 * 60 * 60 * 1000);
    });
  });
});
