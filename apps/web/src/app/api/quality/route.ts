import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import Database from 'better-sqlite3';

// Get working directory from environment variable
function getWorkDir(): string {
  return process.env.JETPACK_WORK_DIR || path.join(process.cwd(), '../..');
}

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
}

/**
 * GET /api/quality - Get quality metrics and snapshots
 */
export async function GET(request: Request) {
  try {
    const workDir = getWorkDir();
    const dbPath = path.join(workDir, '.quality', 'metrics.db');

    // Check if database exists
    try {
      await fs.access(dbPath);
    } catch {
      return NextResponse.json({
        success: true,
        hasData: false,
        baseline: null,
        recent: [],
        summary: null,
      });
    }

    // Open database
    const db = new Database(dbPath, { readonly: true });

    // Get URL params
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    // Get baseline snapshot
    const baselineRow = db.prepare(
      'SELECT * FROM snapshots WHERE is_baseline = 1 ORDER BY timestamp DESC LIMIT 1'
    ).get() as SnapshotRow | undefined;

    const baseline = baselineRow ? rowToSnapshot(baselineRow) : null;

    // Get recent snapshots
    const recentRows = db.prepare(
      'SELECT * FROM snapshots ORDER BY timestamp DESC LIMIT ?'
    ).all(limit) as SnapshotRow[];

    const recent = recentRows.map(rowToSnapshot);

    // Calculate summary statistics
    const statsRow = db.prepare(`
      SELECT
        COUNT(*) as total_snapshots,
        SUM(CASE WHEN is_baseline = 1 THEN 1 ELSE 0 END) as baseline_count,
        AVG(lint_errors) as avg_lint_errors,
        AVG(type_errors) as avg_type_errors,
        AVG(test_coverage) as avg_coverage,
        SUM(CASE WHEN build_success = 1 THEN 1 ELSE 0 END) as successful_builds,
        SUM(tests_failing) as total_test_failures
      FROM snapshots
    `).get() as {
      total_snapshots: number;
      baseline_count: number;
      avg_lint_errors: number;
      avg_type_errors: number;
      avg_coverage: number;
      successful_builds: number;
      total_test_failures: number;
    };

    const summary = {
      totalSnapshots: statsRow.total_snapshots,
      avgLintErrors: Math.round(statsRow.avg_lint_errors * 10) / 10,
      avgTypeErrors: Math.round(statsRow.avg_type_errors * 10) / 10,
      avgCoverage: Math.round(statsRow.avg_coverage * 10) / 10,
      buildSuccessRate: statsRow.total_snapshots > 0
        ? Math.round((statsRow.successful_builds / statsRow.total_snapshots) * 100)
        : 0,
      totalTestFailures: statsRow.total_test_failures,
    };

    db.close();

    return NextResponse.json({
      success: true,
      hasData: true,
      baseline,
      recent,
      summary,
    });
  } catch (error) {
    console.error('Error getting quality metrics:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get quality metrics' },
      { status: 500 }
    );
  }
}

function rowToSnapshot(row: SnapshotRow) {
  return {
    id: row.id,
    taskId: row.task_id,
    timestamp: row.timestamp,
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
