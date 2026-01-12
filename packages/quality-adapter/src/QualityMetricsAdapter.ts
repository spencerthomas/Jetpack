import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import {
  Logger,
  QualitySnapshot,
  QualitySnapshotSchema,
  QualityMetrics,
  QualityGate,
  GateCheckResult,
  DEFAULT_QUALITY_GATES,
} from '@jetpack/shared';

export interface QualityMetricsAdapterConfig {
  workDir: string;
  dbPath?: string;
  gates?: QualityGate[];
}

/**
 * QualityMetricsAdapter manages quality snapshots in a SQLite database.
 * It provides:
 * - Snapshot storage and retrieval
 * - Baseline management
 * - Quality gate evaluation
 */
export class QualityMetricsAdapter {
  private logger: Logger;
  private db: Database.Database | null = null;
  private dbPath: string;
  private gates: QualityGate[];

  constructor(config: QualityMetricsAdapterConfig) {
    this.logger = new Logger('QualityMetricsAdapter');
    this.dbPath = config.dbPath || path.join(config.workDir, '.quality', 'metrics.db');
    this.gates = config.gates || DEFAULT_QUALITY_GATES;
  }

  /**
   * Initialize the adapter and create database tables
   */
  async initialize(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');

    // Create snapshots table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        timestamp TEXT NOT NULL,
        is_baseline INTEGER NOT NULL DEFAULT 0,
        lint_errors INTEGER NOT NULL,
        lint_warnings INTEGER NOT NULL,
        type_errors INTEGER NOT NULL,
        tests_passing INTEGER NOT NULL,
        tests_failing INTEGER NOT NULL,
        test_coverage REAL NOT NULL,
        build_success INTEGER NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_snapshots_baseline ON snapshots(is_baseline)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_snapshots_task_id ON snapshots(task_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON snapshots(timestamp)`);

    this.logger.info(`Initialized quality database at ${this.dbPath}`);
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Store a new quality snapshot
   */
  async saveSnapshot(snapshot: QualitySnapshot): Promise<QualitySnapshot> {
    if (!this.db) throw new Error('Database not initialized');

    const validated = QualitySnapshotSchema.parse(snapshot);

    const stmt = this.db.prepare(`
      INSERT INTO snapshots (
        id, task_id, timestamp, is_baseline,
        lint_errors, lint_warnings, type_errors,
        tests_passing, tests_failing, test_coverage,
        build_success, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      validated.id,
      validated.taskId || null,
      validated.timestamp.toISOString(),
      validated.isBaseline ? 1 : 0,
      validated.metrics.lintErrors,
      validated.metrics.lintWarnings,
      validated.metrics.typeErrors,
      validated.metrics.testsPassing,
      validated.metrics.testsFailing,
      validated.metrics.testCoverage,
      validated.metrics.buildSuccess ? 1 : 0,
      JSON.stringify(validated.tags)
    );

    this.logger.debug(`Saved snapshot ${validated.id}`);
    return validated;
  }

  /**
   * Get a snapshot by ID
   */
  async getSnapshot(id: string): Promise<QualitySnapshot | null> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.prepare('SELECT * FROM snapshots WHERE id = ?').get(id) as SnapshotRow | undefined;
    return row ? this.rowToSnapshot(row) : null;
  }

  /**
   * Get the current baseline snapshot
   */
  async getBaseline(): Promise<QualitySnapshot | null> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.prepare(
      'SELECT * FROM snapshots WHERE is_baseline = 1 ORDER BY timestamp DESC LIMIT 1'
    ).get() as SnapshotRow | undefined;

    return row ? this.rowToSnapshot(row) : null;
  }

  /**
   * Set a snapshot as the new baseline
   */
  async setBaseline(snapshotId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Clear existing baselines
    this.db.prepare('UPDATE snapshots SET is_baseline = 0 WHERE is_baseline = 1').run();

    // Set new baseline
    const result = this.db.prepare('UPDATE snapshots SET is_baseline = 1 WHERE id = ?').run(snapshotId);

    if (result.changes === 0) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }

    this.logger.info(`Set baseline to snapshot ${snapshotId}`);
  }

  /**
   * Get snapshots for a specific task
   */
  async getTaskSnapshots(taskId: string): Promise<QualitySnapshot[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db.prepare(
      'SELECT * FROM snapshots WHERE task_id = ? ORDER BY timestamp ASC'
    ).all(taskId) as SnapshotRow[];

    return rows.map(row => this.rowToSnapshot(row));
  }

  /**
   * Get recent snapshots
   */
  async getRecentSnapshots(limit: number = 10): Promise<QualitySnapshot[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db.prepare(
      'SELECT * FROM snapshots ORDER BY timestamp DESC LIMIT ?'
    ).all(limit) as SnapshotRow[];

    return rows.map(row => this.rowToSnapshot(row));
  }

  /**
   * Check if metrics pass all quality gates
   */
  checkQualityGates(metrics: QualityMetrics): GateCheckResult[] {
    const results: GateCheckResult[] = [];

    for (const gate of this.gates.filter(g => g.enabled)) {
      const actualValue = this.getMetricValue(metrics, gate.metric);
      const passed = this.evaluateGate(actualValue, gate.operator, gate.threshold);

      results.push({
        gateId: gate.id,
        gateName: gate.name,
        passed,
        actualValue,
        expectedThreshold: gate.threshold,
        blocking: gate.blocking,
        message: passed
          ? `${gate.name}: passed (${actualValue})`
          : `${gate.name}: failed (${actualValue} ${gate.operator} ${gate.threshold})`,
      });
    }

    return results;
  }

  /**
   * Check if all blocking gates pass
   */
  allBlockingGatesPass(metrics: QualityMetrics): boolean {
    const results = this.checkQualityGates(metrics);
    return results.filter(r => r.blocking).every(r => r.passed);
  }

  /**
   * Get configured quality gates
   */
  getGates(): QualityGate[] {
    return [...this.gates];
  }

  /**
   * Update quality gates configuration
   */
  setGates(gates: QualityGate[]): void {
    this.gates = gates;
  }

  /**
   * Generate a unique snapshot ID
   */
  generateSnapshotId(): string {
    return `qs-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  // Private helpers

  private getMetricValue(metrics: QualityMetrics, metric: QualityGate['metric']): number {
    switch (metric) {
      case 'test_pass_rate':
        const total = metrics.testsPassing + metrics.testsFailing;
        return total > 0 ? (metrics.testsPassing / total) * 100 : 100;
      case 'lint_errors':
        return metrics.lintErrors;
      case 'lint_warnings':
        return metrics.lintWarnings;
      case 'type_errors':
        return metrics.typeErrors;
      case 'test_coverage':
        return metrics.testCoverage;
      case 'build_success':
        return metrics.buildSuccess ? 1 : 0;
      default:
        return 0;
    }
  }

  private evaluateGate(value: number, operator: QualityGate['operator'], threshold: number): boolean {
    switch (operator) {
      case 'eq': return value === threshold;
      case 'neq': return value !== threshold;
      case 'gt': return value > threshold;
      case 'gte': return value >= threshold;
      case 'lt': return value < threshold;
      case 'lte': return value <= threshold;
      default: return false;
    }
  }

  private rowToSnapshot(row: SnapshotRow): QualitySnapshot {
    return {
      id: row.id,
      taskId: row.task_id || undefined,
      timestamp: new Date(row.timestamp),
      isBaseline: row.is_baseline === 1,
      metrics: {
        lintErrors: row.lint_errors,
        lintWarnings: row.lint_warnings,
        typeErrors: row.type_errors,
        testsPassing: row.tests_passing,
        testsFailing: row.tests_failing,
        testCoverage: row.test_coverage,
        buildSuccess: row.build_success === 1,
      },
      tags: JSON.parse(row.tags),
    };
  }
}

// Row type for SQLite results
interface SnapshotRow {
  id: string;
  task_id: string | null;
  timestamp: string;
  is_baseline: number;
  lint_errors: number;
  lint_warnings: number;
  type_errors: number;
  tests_passing: number;
  tests_failing: number;
  test_coverage: number;
  build_success: number;
  tags: string;
  created_at: string;
}
