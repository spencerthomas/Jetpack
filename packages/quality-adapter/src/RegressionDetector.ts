import {
  Logger,
  QualitySnapshot,
  QualityMetrics,
  Regression,
  RegressionType,
  RegressionSeverity,
  RegressionThresholds,
  DEFAULT_REGRESSION_THRESHOLDS,
} from '@jetpack/shared';

export interface RegressionDetectorConfig {
  thresholds?: Partial<RegressionThresholds>;
}

/**
 * RegressionDetector compares quality snapshots to detect regressions.
 * It uses configurable thresholds to determine when changes constitute regressions.
 */
export class RegressionDetector {
  private logger: Logger;
  private thresholds: RegressionThresholds;

  constructor(config: RegressionDetectorConfig = {}) {
    this.logger = new Logger('RegressionDetector');
    this.thresholds = {
      ...DEFAULT_REGRESSION_THRESHOLDS,
      ...config.thresholds,
    };
  }

  /**
   * Compare current metrics against baseline and detect regressions
   */
  detectRegressions(
    baseline: QualitySnapshot,
    current: QualitySnapshot,
    taskId: string
  ): Regression[] {
    const regressions: Regression[] = [];
    const baseMetrics = baseline.metrics;
    const currMetrics = current.metrics;

    // Check lint errors
    const lintDelta = currMetrics.lintErrors - baseMetrics.lintErrors;
    if (lintDelta > this.thresholds.lintErrorsDelta) {
      regressions.push(this.createRegression(
        taskId,
        'lint_regression',
        this.getLintSeverity(lintDelta),
        baseline.id,
        baseMetrics.lintErrors,
        current.id,
        currMetrics.lintErrors,
        lintDelta,
        `Introduced ${lintDelta} new lint error${lintDelta !== 1 ? 's' : ''}`
      ));
    }

    // Check type errors
    const typeDelta = currMetrics.typeErrors - baseMetrics.typeErrors;
    if (typeDelta > this.thresholds.typeErrorsDelta) {
      regressions.push(this.createRegression(
        taskId,
        'type_regression',
        this.getTypeSeverity(typeDelta),
        baseline.id,
        baseMetrics.typeErrors,
        current.id,
        currMetrics.typeErrors,
        typeDelta,
        `Introduced ${typeDelta} new type error${typeDelta !== 1 ? 's' : ''}`
      ));
    }

    // Check test failures
    const testDelta = currMetrics.testsFailing - baseMetrics.testsFailing;
    if (testDelta > this.thresholds.testFailuresDelta) {
      regressions.push(this.createRegression(
        taskId,
        'test_regression',
        'critical', // Test failures are always critical
        baseline.id,
        baseMetrics.testsFailing,
        current.id,
        currMetrics.testsFailing,
        testDelta,
        `${testDelta} test${testDelta !== 1 ? 's' : ''} now failing that ${testDelta !== 1 ? 'were' : 'was'} passing`
      ));
    }

    // Check coverage decrease
    const coverageDelta = baseMetrics.testCoverage - currMetrics.testCoverage;
    if (coverageDelta > this.thresholds.coverageDecrease) {
      regressions.push(this.createRegression(
        taskId,
        'coverage_regression',
        this.getCoverageSeverity(coverageDelta),
        baseline.id,
        baseMetrics.testCoverage,
        current.id,
        currMetrics.testCoverage,
        -coverageDelta, // Negative because decrease
        `Test coverage decreased by ${coverageDelta.toFixed(1)}%`
      ));
    }

    // Check build failure
    if (baseMetrics.buildSuccess && !currMetrics.buildSuccess) {
      regressions.push(this.createRegression(
        taskId,
        'build_failure',
        'critical',
        baseline.id,
        1,
        current.id,
        0,
        -1,
        'Build now failing that was previously passing'
      ));
    }

    if (regressions.length > 0) {
      this.logger.warn(
        `Detected ${regressions.length} regression${regressions.length !== 1 ? 's' : ''} for task ${taskId}`
      );
    }

    return regressions;
  }

  /**
   * Quick check if any critical regressions exist
   */
  hasCriticalRegressions(regressions: Regression[]): boolean {
    return regressions.some(r => r.severity === 'critical');
  }

  /**
   * Quick check if any blocking regressions exist (critical or high)
   */
  hasBlockingRegressions(regressions: Regression[]): boolean {
    return regressions.some(r => r.severity === 'critical' || r.severity === 'high');
  }

  /**
   * Get a summary of regressions grouped by severity
   */
  summarizeRegressions(regressions: Regression[]): RegressionSummary {
    const summary: RegressionSummary = {
      total: regressions.length,
      bySeverity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
      byType: {
        lint_regression: 0,
        type_regression: 0,
        test_regression: 0,
        coverage_regression: 0,
        build_failure: 0,
      },
      blocking: false,
      descriptions: [],
    };

    for (const r of regressions) {
      summary.bySeverity[r.severity]++;
      summary.byType[r.type]++;
      if (r.description) {
        summary.descriptions.push(r.description);
      }
    }

    summary.blocking = this.hasBlockingRegressions(regressions);

    return summary;
  }

  /**
   * Compare two metrics objects and return delta
   */
  compareMetrics(baseline: QualityMetrics, current: QualityMetrics): MetricsDelta {
    return {
      lintErrors: current.lintErrors - baseline.lintErrors,
      lintWarnings: current.lintWarnings - baseline.lintWarnings,
      typeErrors: current.typeErrors - baseline.typeErrors,
      testsPassing: current.testsPassing - baseline.testsPassing,
      testsFailing: current.testsFailing - baseline.testsFailing,
      testCoverage: current.testCoverage - baseline.testCoverage,
      buildSuccess: baseline.buildSuccess === current.buildSuccess ? 'unchanged'
        : current.buildSuccess ? 'improved' : 'regressed',
    };
  }

  /**
   * Update thresholds
   */
  setThresholds(thresholds: Partial<RegressionThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Get current thresholds
   */
  getThresholds(): RegressionThresholds {
    return { ...this.thresholds };
  }

  // Private helpers

  private createRegression(
    taskId: string,
    type: RegressionType,
    severity: RegressionSeverity,
    baselineSnapshotId: string,
    baselineValue: number,
    currentSnapshotId: string,
    currentValue: number,
    delta: number,
    description: string
  ): Regression {
    return {
      id: `reg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      taskId,
      type,
      severity,
      baseline: {
        snapshotId: baselineSnapshotId,
        value: baselineValue,
      },
      current: {
        snapshotId: currentSnapshotId,
        value: currentValue,
      },
      delta,
      description,
      detectedAt: new Date(),
      resolved: false,
    };
  }

  private getLintSeverity(delta: number): RegressionSeverity {
    if (delta >= 10) return 'high';
    if (delta >= 5) return 'medium';
    return 'low';
  }

  private getTypeSeverity(delta: number): RegressionSeverity {
    if (delta >= 5) return 'high';
    if (delta >= 2) return 'medium';
    return 'medium'; // Type errors are always at least medium
  }

  private getCoverageSeverity(decrease: number): RegressionSeverity {
    if (decrease >= 20) return 'high';
    if (decrease >= 10) return 'medium';
    return 'low';
  }
}

export interface RegressionSummary {
  total: number;
  bySeverity: Record<RegressionSeverity, number>;
  byType: Record<RegressionType, number>;
  blocking: boolean;
  descriptions: string[];
}

export interface MetricsDelta {
  lintErrors: number;
  lintWarnings: number;
  typeErrors: number;
  testsPassing: number;
  testsFailing: number;
  testCoverage: number;
  buildSuccess: 'unchanged' | 'improved' | 'regressed';
}
