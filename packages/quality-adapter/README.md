# @jetpack-agent/quality-adapter

Quality metrics tracking and regression detection for Jetpack multi-agent systems. Provides baseline management, quality gates, and self-improvement through failure analysis.

## Installation

```bash
npm install @jetpack-agent/quality-adapter
```

## Quick Start

```typescript
import {
  QualityMetricsAdapter,
  RegressionDetector,
  SelfImprovementService,
} from '@jetpack-agent/quality-adapter';

// Initialize quality tracking
const qualityAdapter = new QualityMetricsAdapter({
  workDir: process.cwd(),
});
await qualityAdapter.initialize();

// Create and save a quality snapshot
const snapshot = await qualityAdapter.saveSnapshot({
  id: qualityAdapter.generateSnapshotId(),
  timestamp: new Date(),
  isBaseline: true,
  metrics: {
    lintErrors: 0,
    lintWarnings: 5,
    typeErrors: 0,
    testsPassing: 42,
    testsFailing: 0,
    testCoverage: 85.5,
    buildSuccess: true,
  },
  tags: ['release-1.0'],
});

// Check quality gates
const gateResults = qualityAdapter.checkQualityGates(snapshot.metrics);
const allPassing = qualityAdapter.allBlockingGatesPass(snapshot.metrics);
```

## Features

- SQLite-based quality snapshot storage
- Baseline management for comparison
- Configurable quality gates
- Regression detection with severity levels
- Self-improvement service for learning from failures
- Memory integration for pattern recognition

## API

### `QualityMetricsAdapter`

Manages quality snapshots in a SQLite database.

```typescript
const adapter = new QualityMetricsAdapter(config);
await adapter.initialize();
```

#### Configuration

```typescript
interface QualityMetricsAdapterConfig {
  /** Working directory for the project */
  workDir: string;

  /** Custom database path (default: .quality/metrics.db) */
  dbPath?: string;

  /** Custom quality gates */
  gates?: QualityGate[];
}
```

#### Methods

| Method | Description |
|--------|-------------|
| `initialize()` | Initialize database and create tables |
| `close()` | Close database connection |
| `saveSnapshot(snapshot)` | Store a new quality snapshot |
| `getSnapshot(id)` | Get snapshot by ID |
| `getBaseline()` | Get the current baseline snapshot |
| `setBaseline(snapshotId)` | Set a snapshot as the new baseline |
| `getTaskSnapshots(taskId)` | Get all snapshots for a task |
| `getRecentSnapshots(limit)` | Get recent snapshots |
| `checkQualityGates(metrics)` | Check metrics against all quality gates |
| `allBlockingGatesPass(metrics)` | Check if all blocking gates pass |
| `generateSnapshotId()` | Generate a unique snapshot ID |

### `RegressionDetector`

Compares quality snapshots to detect regressions.

```typescript
const detector = new RegressionDetector({
  thresholds: {
    lintErrorsDelta: 0,
    typeErrorsDelta: 0,
    testFailuresDelta: 0,
    coverageDecrease: 5,
  },
});

const regressions = detector.detectRegressions(baseline, current, taskId);
```

#### Regression Types

- `lint_regression` - New lint errors introduced
- `type_regression` - New type errors introduced
- `test_regression` - Tests now failing that were passing
- `coverage_regression` - Test coverage decreased
- `build_failure` - Build now failing

#### Severity Levels

- `critical` - Test failures, build failures
- `high` - Many lint/type errors, large coverage drops
- `medium` - Moderate issues
- `low` - Minor issues

#### Methods

| Method | Description |
|--------|-------------|
| `detectRegressions(baseline, current, taskId)` | Compare snapshots and find regressions |
| `hasCriticalRegressions(regressions)` | Check for any critical regressions |
| `hasBlockingRegressions(regressions)` | Check for critical or high severity |
| `summarizeRegressions(regressions)` | Get summary grouped by severity/type |
| `compareMetrics(baseline, current)` | Get delta between two metrics |
| `setThresholds(thresholds)` | Update detection thresholds |

### `SelfImprovementService`

Analyzes failures and builds quality context for agents to learn from mistakes.

```typescript
const service = new SelfImprovementService({
  qualityAdapter,
  regressionDetector,
  memoryStore: cassAdapter, // Optional CASS integration
});

// Analyze a failure and store learnings
const analysis = await service.analyzeFailure(
  taskId,
  baseline,
  current,
  { title: 'Add login form', description: 'Create login UI' }
);

// Build context for a new task
const context = await service.buildQualityContext(
  'Add signup form',
  'Create signup UI with validation'
);

// Format context for agent prompt
const promptAddition = service.formatContextForPrompt(context);
```

#### Methods

| Method | Description |
|--------|-------------|
| `analyzeFailure(taskId, baseline, current, taskContext)` | Analyze failure and optionally store in memory |
| `buildQualityContext(title, description)` | Build quality context for a new task |
| `formatContextForPrompt(context)` | Format context as prompt instructions |
| `recordSuccessfulFix(taskId, regressionType, howFixed)` | Record a successful fix for learning |

## Quality Gates

Default quality gates:

```typescript
const DEFAULT_QUALITY_GATES = [
  {
    id: 'build-success',
    name: 'Build Must Pass',
    metric: 'build_success',
    operator: 'eq',
    threshold: 1,
    blocking: true,
  },
  {
    id: 'no-type-errors',
    name: 'No Type Errors',
    metric: 'type_errors',
    operator: 'eq',
    threshold: 0,
    blocking: true,
  },
  {
    id: 'test-pass-rate',
    name: 'Test Pass Rate >= 100%',
    metric: 'test_pass_rate',
    operator: 'gte',
    threshold: 100,
    blocking: true,
  },
  // ...
];
```

## Dependencies

- **better-sqlite3** - SQLite database
- **zod** - Schema validation
- **@jetpack-agent/shared** - Shared types and utilities

## License

MIT
