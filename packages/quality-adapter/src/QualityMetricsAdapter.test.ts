import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { QualityMetricsAdapter, QualityMetricsAdapterConfig } from './QualityMetricsAdapter';
import { QualitySnapshot, QualityMetrics, QualityGate } from '@jetpack/shared';

const TEST_QUALITY_DIR = '/tmp/jetpack-test-quality';

// Helper to create a snapshot
const createSnapshot = (overrides: Partial<QualitySnapshot> = {}): QualitySnapshot => ({
  id: `qs-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
  timestamp: new Date(),
  isBaseline: false,
  metrics: {
    lintErrors: 0,
    lintWarnings: 0,
    typeErrors: 0,
    testsPassing: 100,
    testsFailing: 0,
    testCoverage: 85,
    buildSuccess: true,
  },
  tags: [],
  ...overrides,
});

// Helper to create metrics
const createMetrics = (overrides: Partial<QualityMetrics> = {}): QualityMetrics => ({
  lintErrors: 0,
  lintWarnings: 0,
  typeErrors: 0,
  testsPassing: 100,
  testsFailing: 0,
  testCoverage: 85,
  buildSuccess: true,
  ...overrides,
});

describe('QualityMetricsAdapter', () => {
  let adapter: QualityMetricsAdapter;
  const defaultConfig: QualityMetricsAdapterConfig = {
    workDir: TEST_QUALITY_DIR,
  };

  beforeEach(async () => {
    // Clean up test directory
    if (fs.existsSync(TEST_QUALITY_DIR)) {
      fs.rmSync(TEST_QUALITY_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_QUALITY_DIR, { recursive: true });

    adapter = new QualityMetricsAdapter(defaultConfig);
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.close();
    // Clean up
    if (fs.existsSync(TEST_QUALITY_DIR)) {
      fs.rmSync(TEST_QUALITY_DIR, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should create database file on initialize', () => {
      const dbPath = path.join(TEST_QUALITY_DIR, '.quality', 'metrics.db');
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('should accept custom db path', async () => {
      const customPath = path.join(TEST_QUALITY_DIR, 'custom.db');
      const customAdapter = new QualityMetricsAdapter({
        workDir: TEST_QUALITY_DIR,
        dbPath: customPath,
      });
      await customAdapter.initialize();

      expect(fs.existsSync(customPath)).toBe(true);
      await customAdapter.close();
    });
  });

  describe('saveSnapshot', () => {
    it('should save and return snapshot', async () => {
      const snapshot = createSnapshot({ id: 'qs-save-test' });
      const saved = await adapter.saveSnapshot(snapshot);

      expect(saved.id).toBe('qs-save-test');
      expect(saved.metrics.lintErrors).toBe(0);
    });

    it('should save snapshot with taskId', async () => {
      const snapshot = createSnapshot({
        id: 'qs-with-task',
        taskId: 'bd-task-123',
      });
      const saved = await adapter.saveSnapshot(snapshot);

      expect(saved.taskId).toBe('bd-task-123');
    });

    it('should save snapshot with tags', async () => {
      const snapshot = createSnapshot({
        id: 'qs-with-tags',
        tags: ['pre-deploy', 'release-1.0'],
      });
      const saved = await adapter.saveSnapshot(snapshot);

      expect(saved.tags).toContain('pre-deploy');
      expect(saved.tags).toContain('release-1.0');
    });
  });

  describe('getSnapshot', () => {
    it('should retrieve snapshot by ID', async () => {
      const snapshot = createSnapshot({ id: 'qs-get-test' });
      await adapter.saveSnapshot(snapshot);

      const retrieved = await adapter.getSnapshot('qs-get-test');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('qs-get-test');
    });

    it('should return null for non-existent ID', async () => {
      const result = await adapter.getSnapshot('qs-nonexistent');
      expect(result).toBeNull();
    });

    it('should convert timestamp to Date object', async () => {
      const snapshot = createSnapshot({ id: 'qs-date-test' });
      await adapter.saveSnapshot(snapshot);

      const retrieved = await adapter.getSnapshot('qs-date-test');
      expect(retrieved?.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('baseline management', () => {
    it('should get baseline snapshot', async () => {
      const snapshot = createSnapshot({
        id: 'qs-baseline',
        isBaseline: true,
      });
      await adapter.saveSnapshot(snapshot);

      const baseline = await adapter.getBaseline();
      expect(baseline).not.toBeNull();
      expect(baseline?.id).toBe('qs-baseline');
      expect(baseline?.isBaseline).toBe(true);
    });

    it('should return null when no baseline exists', async () => {
      const baseline = await adapter.getBaseline();
      expect(baseline).toBeNull();
    });

    it('should set new baseline and clear old one', async () => {
      const oldBaseline = createSnapshot({
        id: 'qs-old-baseline',
        isBaseline: true,
      });
      await adapter.saveSnapshot(oldBaseline);

      const newSnapshot = createSnapshot({
        id: 'qs-new-baseline',
        isBaseline: false,
      });
      await adapter.saveSnapshot(newSnapshot);

      await adapter.setBaseline('qs-new-baseline');

      const baseline = await adapter.getBaseline();
      expect(baseline?.id).toBe('qs-new-baseline');

      const oldCheck = await adapter.getSnapshot('qs-old-baseline');
      expect(oldCheck?.isBaseline).toBe(false);
    });

    it('should throw error when setting non-existent snapshot as baseline', async () => {
      await expect(adapter.setBaseline('qs-nonexistent')).rejects.toThrow();
    });
  });

  describe('getTaskSnapshots', () => {
    beforeEach(async () => {
      await adapter.saveSnapshot(createSnapshot({
        id: 'qs-task1-a',
        taskId: 'bd-task1',
        timestamp: new Date('2024-01-01'),
      }));
      await adapter.saveSnapshot(createSnapshot({
        id: 'qs-task1-b',
        taskId: 'bd-task1',
        timestamp: new Date('2024-01-02'),
      }));
      await adapter.saveSnapshot(createSnapshot({
        id: 'qs-task2-a',
        taskId: 'bd-task2',
      }));
    });

    it('should return snapshots for specific task', async () => {
      const snapshots = await adapter.getTaskSnapshots('bd-task1');
      expect(snapshots).toHaveLength(2);
    });

    it('should order by timestamp ascending', async () => {
      const snapshots = await adapter.getTaskSnapshots('bd-task1');
      expect(snapshots[0].id).toBe('qs-task1-a');
      expect(snapshots[1].id).toBe('qs-task1-b');
    });

    it('should return empty array for non-existent task', async () => {
      const snapshots = await adapter.getTaskSnapshots('bd-nonexistent');
      expect(snapshots).toHaveLength(0);
    });
  });

  describe('getRecentSnapshots', () => {
    beforeEach(async () => {
      for (let i = 0; i < 15; i++) {
        await adapter.saveSnapshot(createSnapshot({
          id: `qs-recent-${i}`,
          timestamp: new Date(Date.now() - i * 1000),
        }));
      }
    });

    it('should return most recent snapshots first', async () => {
      const recent = await adapter.getRecentSnapshots(5);
      expect(recent).toHaveLength(5);
      expect(recent[0].id).toBe('qs-recent-0');
    });

    it('should respect limit parameter', async () => {
      const recent = await adapter.getRecentSnapshots(3);
      expect(recent).toHaveLength(3);
    });

    it('should use default limit of 10', async () => {
      const recent = await adapter.getRecentSnapshots();
      expect(recent).toHaveLength(10);
    });
  });

  describe('quality gates', () => {
    describe('checkQualityGates', () => {
      it('should pass all gates for perfect metrics', () => {
        const metrics = createMetrics({
          testsPassing: 100,
          testsFailing: 0,
          lintErrors: 0,
          buildSuccess: true,
        });

        const results = adapter.checkQualityGates(metrics);
        const blocking = results.filter(r => r.blocking);
        expect(blocking.every(r => r.passed)).toBe(true);
      });

      it('should fail test pass rate gate', () => {
        const metrics = createMetrics({
          testsPassing: 80,
          testsFailing: 20,
        });

        const results = adapter.checkQualityGates(metrics);
        const testGate = results.find(r => r.gateId === 'gate-tests-pass');
        expect(testGate?.passed).toBe(false);
      });

      it('should fail lint errors gate', () => {
        const metrics = createMetrics({
          lintErrors: 5,
        });

        const results = adapter.checkQualityGates(metrics);
        const lintGate = results.find(r => r.gateId === 'gate-no-lint-errors');
        expect(lintGate?.passed).toBe(false);
      });

      it('should fail build success gate', () => {
        const metrics = createMetrics({
          buildSuccess: false,
        });

        const results = adapter.checkQualityGates(metrics);
        const buildGate = results.find(r => r.gateId === 'gate-build-success');
        expect(buildGate?.passed).toBe(false);
      });

      it('should calculate test pass rate correctly', () => {
        const metrics = createMetrics({
          testsPassing: 90,
          testsFailing: 10,
        });

        const results = adapter.checkQualityGates(metrics);
        const testGate = results.find(r => r.gateId === 'gate-tests-pass');
        expect(testGate?.actualValue).toBe(90); // 90%
      });
    });

    describe('allBlockingGatesPass', () => {
      it('should return true when all blocking gates pass', () => {
        const metrics = createMetrics();
        expect(adapter.allBlockingGatesPass(metrics)).toBe(true);
      });

      it('should return false when any blocking gate fails', () => {
        const metrics = createMetrics({ buildSuccess: false });
        expect(adapter.allBlockingGatesPass(metrics)).toBe(false);
      });
    });

    describe('gate configuration', () => {
      it('should return configured gates', () => {
        const gates = adapter.getGates();
        expect(gates.length).toBeGreaterThan(0);
      });

      it('should allow setting custom gates', () => {
        const customGates: QualityGate[] = [
          {
            id: 'custom-gate',
            name: 'Custom Gate',
            metric: 'test_coverage',
            operator: 'gte',
            threshold: 90,
            blocking: true,
            enabled: true,
          },
        ];

        adapter.setGates(customGates);
        const gates = adapter.getGates();

        expect(gates).toHaveLength(1);
        expect(gates[0].id).toBe('custom-gate');
      });
    });
  });

  describe('generateSnapshotId', () => {
    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(adapter.generateSnapshotId());
      }
      expect(ids.size).toBe(100);
    });

    it('should start with qs- prefix', () => {
      const id = adapter.generateSnapshotId();
      expect(id).toMatch(/^qs-/);
    });
  });
});
