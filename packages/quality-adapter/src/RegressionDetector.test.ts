import { describe, it, expect, beforeEach } from 'vitest';
import { RegressionDetector, RegressionDetectorConfig } from './RegressionDetector';
import { QualitySnapshot, QualityMetrics } from '@jetpack-agent/shared';

// Helper to create a snapshot
const createSnapshot = (
  id: string,
  metrics: Partial<QualityMetrics> = {}
): QualitySnapshot => ({
  id,
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
    ...metrics,
  },
  tags: [],
});

describe('RegressionDetector', () => {
  let detector: RegressionDetector;

  beforeEach(() => {
    detector = new RegressionDetector();
  });

  describe('detectRegressions', () => {
    describe('lint regressions', () => {
      it('should detect lint error increase', () => {
        const baseline = createSnapshot('baseline', { lintErrors: 0 });
        const current = createSnapshot('current', { lintErrors: 5 });

        const regressions = detector.detectRegressions(baseline, current, 'task-1');

        expect(regressions).toHaveLength(1);
        expect(regressions[0].type).toBe('lint_regression');
        expect(regressions[0].delta).toBe(5);
      });

      it('should not detect lint regression when errors decrease', () => {
        const baseline = createSnapshot('baseline', { lintErrors: 10 });
        const current = createSnapshot('current', { lintErrors: 5 });

        const regressions = detector.detectRegressions(baseline, current, 'task-1');

        expect(regressions.filter(r => r.type === 'lint_regression')).toHaveLength(0);
      });

      it('should classify high lint severity for 10+ errors', () => {
        const baseline = createSnapshot('baseline', { lintErrors: 0 });
        const current = createSnapshot('current', { lintErrors: 15 });

        const regressions = detector.detectRegressions(baseline, current, 'task-1');

        expect(regressions[0].severity).toBe('high');
      });

      it('should classify medium lint severity for 5-9 errors', () => {
        const baseline = createSnapshot('baseline', { lintErrors: 0 });
        const current = createSnapshot('current', { lintErrors: 7 });

        const regressions = detector.detectRegressions(baseline, current, 'task-1');

        expect(regressions[0].severity).toBe('medium');
      });

      it('should classify low lint severity for 1-4 errors', () => {
        const baseline = createSnapshot('baseline', { lintErrors: 0 });
        const current = createSnapshot('current', { lintErrors: 2 });

        const regressions = detector.detectRegressions(baseline, current, 'task-1');

        expect(regressions[0].severity).toBe('low');
      });
    });

    describe('type regressions', () => {
      it('should detect type error increase', () => {
        const baseline = createSnapshot('baseline', { typeErrors: 0 });
        const current = createSnapshot('current', { typeErrors: 3 });

        const regressions = detector.detectRegressions(baseline, current, 'task-1');

        expect(regressions.some(r => r.type === 'type_regression')).toBe(true);
      });

      it('should classify high type severity for 5+ errors', () => {
        const baseline = createSnapshot('baseline', { typeErrors: 0 });
        const current = createSnapshot('current', { typeErrors: 8 });

        const regressions = detector.detectRegressions(baseline, current, 'task-1');
        const typeReg = regressions.find(r => r.type === 'type_regression');

        expect(typeReg?.severity).toBe('high');
      });
    });

    describe('test regressions', () => {
      it('should detect new test failures', () => {
        const baseline = createSnapshot('baseline', { testsFailing: 0 });
        const current = createSnapshot('current', { testsFailing: 2 });

        const regressions = detector.detectRegressions(baseline, current, 'task-1');
        const testReg = regressions.find(r => r.type === 'test_regression');

        expect(testReg).toBeDefined();
        expect(testReg?.severity).toBe('critical');
      });

      it('should not detect when tests improve', () => {
        const baseline = createSnapshot('baseline', { testsFailing: 5 });
        const current = createSnapshot('current', { testsFailing: 2 });

        const regressions = detector.detectRegressions(baseline, current, 'task-1');

        expect(regressions.filter(r => r.type === 'test_regression')).toHaveLength(0);
      });
    });

    describe('coverage regressions', () => {
      it('should detect significant coverage decrease', () => {
        const baseline = createSnapshot('baseline', { testCoverage: 85 });
        const current = createSnapshot('current', { testCoverage: 75 });

        const regressions = detector.detectRegressions(baseline, current, 'task-1');
        const coverageReg = regressions.find(r => r.type === 'coverage_regression');

        expect(coverageReg).toBeDefined();
        expect(coverageReg?.delta).toBe(-10);
      });

      it('should not detect small coverage changes (within threshold)', () => {
        const baseline = createSnapshot('baseline', { testCoverage: 85 });
        const current = createSnapshot('current', { testCoverage: 83 });

        // Default threshold is 5%
        const regressions = detector.detectRegressions(baseline, current, 'task-1');

        expect(regressions.filter(r => r.type === 'coverage_regression')).toHaveLength(0);
      });

      it('should classify high coverage severity for 20%+ decrease', () => {
        const baseline = createSnapshot('baseline', { testCoverage: 90 });
        const current = createSnapshot('current', { testCoverage: 65 });

        const regressions = detector.detectRegressions(baseline, current, 'task-1');
        const coverageReg = regressions.find(r => r.type === 'coverage_regression');

        expect(coverageReg?.severity).toBe('high');
      });
    });

    describe('build failure', () => {
      it('should detect build failure', () => {
        const baseline = createSnapshot('baseline', { buildSuccess: true });
        const current = createSnapshot('current', { buildSuccess: false });

        const regressions = detector.detectRegressions(baseline, current, 'task-1');
        const buildReg = regressions.find(r => r.type === 'build_failure');

        expect(buildReg).toBeDefined();
        expect(buildReg?.severity).toBe('critical');
      });

      it('should not detect when build already failing', () => {
        const baseline = createSnapshot('baseline', { buildSuccess: false });
        const current = createSnapshot('current', { buildSuccess: false });

        const regressions = detector.detectRegressions(baseline, current, 'task-1');

        expect(regressions.filter(r => r.type === 'build_failure')).toHaveLength(0);
      });

      it('should not detect when build improves', () => {
        const baseline = createSnapshot('baseline', { buildSuccess: false });
        const current = createSnapshot('current', { buildSuccess: true });

        const regressions = detector.detectRegressions(baseline, current, 'task-1');

        expect(regressions.filter(r => r.type === 'build_failure')).toHaveLength(0);
      });
    });

    describe('multiple regressions', () => {
      it('should detect multiple regression types', () => {
        const baseline = createSnapshot('baseline', {
          lintErrors: 0,
          typeErrors: 0,
          testsFailing: 0,
        });
        const current = createSnapshot('current', {
          lintErrors: 5,
          typeErrors: 3,
          testsFailing: 2,
        });

        const regressions = detector.detectRegressions(baseline, current, 'task-1');

        expect(regressions.length).toBe(3);
        expect(regressions.map(r => r.type)).toContain('lint_regression');
        expect(regressions.map(r => r.type)).toContain('type_regression');
        expect(regressions.map(r => r.type)).toContain('test_regression');
      });
    });
  });

  describe('hasCriticalRegressions', () => {
    it('should return true when critical regressions exist', () => {
      const baseline = createSnapshot('baseline', { testsFailing: 0 });
      const current = createSnapshot('current', { testsFailing: 1 });

      const regressions = detector.detectRegressions(baseline, current, 'task-1');

      expect(detector.hasCriticalRegressions(regressions)).toBe(true);
    });

    it('should return false when no critical regressions', () => {
      const baseline = createSnapshot('baseline', { lintErrors: 0 });
      const current = createSnapshot('current', { lintErrors: 2 });

      const regressions = detector.detectRegressions(baseline, current, 'task-1');

      expect(detector.hasCriticalRegressions(regressions)).toBe(false);
    });

    it('should return false for empty regressions', () => {
      expect(detector.hasCriticalRegressions([])).toBe(false);
    });
  });

  describe('hasBlockingRegressions', () => {
    it('should return true for critical regressions', () => {
      const baseline = createSnapshot('baseline', { testsFailing: 0 });
      const current = createSnapshot('current', { testsFailing: 1 });

      const regressions = detector.detectRegressions(baseline, current, 'task-1');

      expect(detector.hasBlockingRegressions(regressions)).toBe(true);
    });

    it('should return true for high severity regressions', () => {
      const baseline = createSnapshot('baseline', { lintErrors: 0 });
      const current = createSnapshot('current', { lintErrors: 15 });

      const regressions = detector.detectRegressions(baseline, current, 'task-1');

      expect(detector.hasBlockingRegressions(regressions)).toBe(true);
    });

    it('should return false for only low/medium regressions', () => {
      const baseline = createSnapshot('baseline', { lintErrors: 0 });
      const current = createSnapshot('current', { lintErrors: 2 });

      const regressions = detector.detectRegressions(baseline, current, 'task-1');

      expect(detector.hasBlockingRegressions(regressions)).toBe(false);
    });
  });

  describe('summarizeRegressions', () => {
    it('should count by severity', () => {
      const baseline = createSnapshot('baseline', {
        lintErrors: 0,
        testsFailing: 0,
      });
      const current = createSnapshot('current', {
        lintErrors: 2, // low
        testsFailing: 1, // critical
      });

      const regressions = detector.detectRegressions(baseline, current, 'task-1');
      const summary = detector.summarizeRegressions(regressions);

      expect(summary.bySeverity.low).toBe(1);
      expect(summary.bySeverity.critical).toBe(1);
    });

    it('should count by type', () => {
      const baseline = createSnapshot('baseline', {
        lintErrors: 0,
        typeErrors: 0,
      });
      const current = createSnapshot('current', {
        lintErrors: 5,
        typeErrors: 3,
      });

      const regressions = detector.detectRegressions(baseline, current, 'task-1');
      const summary = detector.summarizeRegressions(regressions);

      expect(summary.byType.lint_regression).toBe(1);
      expect(summary.byType.type_regression).toBe(1);
    });

    it('should set blocking flag correctly', () => {
      const baseline = createSnapshot('baseline', { testsFailing: 0 });
      const current = createSnapshot('current', { testsFailing: 1 });

      const regressions = detector.detectRegressions(baseline, current, 'task-1');
      const summary = detector.summarizeRegressions(regressions);

      expect(summary.blocking).toBe(true);
    });

    it('should collect descriptions', () => {
      const baseline = createSnapshot('baseline', { lintErrors: 0 });
      const current = createSnapshot('current', { lintErrors: 3 });

      const regressions = detector.detectRegressions(baseline, current, 'task-1');
      const summary = detector.summarizeRegressions(regressions);

      expect(summary.descriptions.length).toBeGreaterThan(0);
      expect(summary.descriptions[0]).toContain('lint');
    });
  });

  describe('compareMetrics', () => {
    it('should calculate numeric deltas', () => {
      const baseline: QualityMetrics = {
        lintErrors: 5,
        lintWarnings: 10,
        typeErrors: 2,
        testsPassing: 100,
        testsFailing: 0,
        testCoverage: 85,
        buildSuccess: true,
      };
      const current: QualityMetrics = {
        lintErrors: 3,
        lintWarnings: 15,
        typeErrors: 5,
        testsPassing: 95,
        testsFailing: 5,
        testCoverage: 80,
        buildSuccess: true,
      };

      const delta = detector.compareMetrics(baseline, current);

      expect(delta.lintErrors).toBe(-2);
      expect(delta.lintWarnings).toBe(5);
      expect(delta.typeErrors).toBe(3);
      expect(delta.testsPassing).toBe(-5);
      expect(delta.testsFailing).toBe(5);
      expect(delta.testCoverage).toBe(-5);
    });

    it('should detect build success unchanged', () => {
      const baseline: QualityMetrics = {
        lintErrors: 0,
        lintWarnings: 0,
        typeErrors: 0,
        testsPassing: 100,
        testsFailing: 0,
        testCoverage: 85,
        buildSuccess: true,
      };

      const delta = detector.compareMetrics(baseline, baseline);

      expect(delta.buildSuccess).toBe('unchanged');
    });

    it('should detect build improved', () => {
      const baseline: QualityMetrics = {
        lintErrors: 0,
        lintWarnings: 0,
        typeErrors: 0,
        testsPassing: 100,
        testsFailing: 0,
        testCoverage: 85,
        buildSuccess: false,
      };
      const current = { ...baseline, buildSuccess: true };

      const delta = detector.compareMetrics(baseline, current);

      expect(delta.buildSuccess).toBe('improved');
    });

    it('should detect build regressed', () => {
      const baseline: QualityMetrics = {
        lintErrors: 0,
        lintWarnings: 0,
        typeErrors: 0,
        testsPassing: 100,
        testsFailing: 0,
        testCoverage: 85,
        buildSuccess: true,
      };
      const current = { ...baseline, buildSuccess: false };

      const delta = detector.compareMetrics(baseline, current);

      expect(delta.buildSuccess).toBe('regressed');
    });
  });

  describe('threshold configuration', () => {
    it('should use custom thresholds', () => {
      const customDetector = new RegressionDetector({
        thresholds: {
          lintErrorsDelta: 10, // More lenient
        },
      });

      const baseline = createSnapshot('baseline', { lintErrors: 0 });
      const current = createSnapshot('current', { lintErrors: 8 });

      const regressions = customDetector.detectRegressions(baseline, current, 'task-1');

      expect(regressions.filter(r => r.type === 'lint_regression')).toHaveLength(0);
    });

    it('should allow updating thresholds', () => {
      detector.setThresholds({ coverageDecrease: 20 });

      const baseline = createSnapshot('baseline', { testCoverage: 85 });
      const current = createSnapshot('current', { testCoverage: 70 });

      const regressions = detector.detectRegressions(baseline, current, 'task-1');

      expect(regressions.filter(r => r.type === 'coverage_regression')).toHaveLength(0);
    });

    it('should return current thresholds', () => {
      const thresholds = detector.getThresholds();

      expect(thresholds).toHaveProperty('lintErrorsDelta');
      expect(thresholds).toHaveProperty('typeErrorsDelta');
      expect(thresholds).toHaveProperty('testFailuresDelta');
      expect(thresholds).toHaveProperty('coverageDecrease');
    });
  });
});
