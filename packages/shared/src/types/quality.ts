import { z } from 'zod';

/**
 * Quality metrics captured at a point in time
 */
export const QualityMetricsSchema = z.object({
  lintErrors: z.number().int().min(0),
  lintWarnings: z.number().int().min(0),
  typeErrors: z.number().int().min(0),
  testsPassing: z.number().int().min(0),
  testsFailing: z.number().int().min(0),
  testCoverage: z.number().min(0).max(100),  // Percentage
  buildSuccess: z.boolean(),
});
export type QualityMetrics = z.infer<typeof QualityMetricsSchema>;

/**
 * A snapshot of quality metrics at a specific time
 */
export const QualitySnapshotSchema = z.object({
  id: z.string(),
  taskId: z.string().optional(),         // Associated task if any
  timestamp: z.date(),
  isBaseline: z.boolean().default(false), // True if this is a baseline snapshot
  metrics: QualityMetricsSchema,
  tags: z.array(z.string()).default([]),  // E.g., ['pre-task', 'post-task']
});
export type QualitySnapshot = z.infer<typeof QualitySnapshotSchema>;

/**
 * Severity levels for regressions
 */
export const RegressionSeveritySchema = z.enum([
  'low',      // Minor regression, doesn't block
  'medium',   // Significant regression, should be fixed
  'high',     // Serious regression, blocks completion
  'critical', // Test failures or build breakage
]);
export type RegressionSeverity = z.infer<typeof RegressionSeveritySchema>;

/**
 * Types of quality regressions
 */
export const RegressionTypeSchema = z.enum([
  'lint_regression',     // New lint errors introduced
  'test_regression',     // Tests that were passing now fail
  'coverage_regression', // Coverage decreased
  'build_failure',       // Build was working, now broken
  'type_regression',     // New type errors introduced
]);
export type RegressionType = z.infer<typeof RegressionTypeSchema>;

/**
 * A detected quality regression
 */
export const RegressionSchema = z.object({
  id: z.string(),
  taskId: z.string(),                    // Task that introduced regression
  severity: RegressionSeveritySchema,
  type: RegressionTypeSchema,
  baseline: z.object({
    snapshotId: z.string(),
    value: z.number(),
  }),
  current: z.object({
    snapshotId: z.string(),
    value: z.number(),
  }),
  delta: z.number(),                     // current.value - baseline.value
  description: z.string().optional(),
  detectedAt: z.date(),
  resolved: z.boolean().default(false),
  resolvedAt: z.date().optional(),
});
export type Regression = z.infer<typeof RegressionSchema>;

/**
 * Quality gate - a rule that must be satisfied before task completion
 */
export const QualityGateSchema = z.object({
  id: z.string(),
  name: z.string(),
  metric: z.enum([
    'test_pass_rate',
    'lint_errors',
    'lint_warnings',
    'type_errors',
    'test_coverage',
    'build_success',
  ]),
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']),
  threshold: z.number(),
  blocking: z.boolean().default(true),  // If true, blocks task completion
  enabled: z.boolean().default(true),
});
export type QualityGate = z.infer<typeof QualityGateSchema>;

/**
 * Result of checking quality gates
 */
export const GateCheckResultSchema = z.object({
  gateId: z.string(),
  gateName: z.string(),
  passed: z.boolean(),
  actualValue: z.number(),
  expectedThreshold: z.number(),
  blocking: z.boolean(),
  message: z.string(),
});
export type GateCheckResult = z.infer<typeof GateCheckResultSchema>;

/**
 * Default quality gates for standard operation
 */
export const DEFAULT_QUALITY_GATES: QualityGate[] = [
  {
    id: 'gate-tests-pass',
    name: 'All tests pass',
    metric: 'test_pass_rate',
    operator: 'eq',
    threshold: 100,
    blocking: true,
    enabled: true,
  },
  {
    id: 'gate-no-lint-errors',
    name: 'No lint errors',
    metric: 'lint_errors',
    operator: 'eq',
    threshold: 0,
    blocking: true,
    enabled: true,
  },
  {
    id: 'gate-build-success',
    name: 'Build succeeds',
    metric: 'build_success',
    operator: 'eq',
    threshold: 1, // 1 = true
    blocking: true,
    enabled: true,
  },
  {
    id: 'gate-type-errors',
    name: 'No type errors',
    metric: 'type_errors',
    operator: 'eq',
    threshold: 0,
    blocking: true,
    enabled: true,
  },
  {
    id: 'gate-coverage',
    name: 'Minimum test coverage',
    metric: 'test_coverage',
    operator: 'gte',
    threshold: 70,
    blocking: false,  // Warning only
    enabled: true,
  },
];

/**
 * Regression detection thresholds
 */
export interface RegressionThresholds {
  /** Number of new lint errors to trigger regression (0 = any) */
  lintErrorsDelta: number;
  /** Number of new type errors to trigger regression (0 = any) */
  typeErrorsDelta: number;
  /** Number of test failures to trigger regression (0 = any) */
  testFailuresDelta: number;
  /** Coverage decrease percentage to trigger regression */
  coverageDecrease: number;
}

export const DEFAULT_REGRESSION_THRESHOLDS: RegressionThresholds = {
  lintErrorsDelta: 0,     // Any new lint error triggers
  typeErrorsDelta: 0,     // Any new type error triggers
  testFailuresDelta: 0,   // Any test failure triggers
  coverageDecrease: 5,    // 5% decrease triggers
};
