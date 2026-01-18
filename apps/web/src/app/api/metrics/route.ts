import { NextRequest, NextResponse } from 'next/server';
import { JetpackOrchestrator, JetpackMetrics, MetricFormat } from '@jetpack-agent/orchestrator';
import path from 'path';

let orchestrator: JetpackOrchestrator | null = null;
let currentWorkDir: string | null = null;

function getWorkDir(): string {
  return process.env.JETPACK_WORK_DIR || path.join(process.cwd(), '../..');
}

async function getOrchestrator() {
  const workDir = getWorkDir();
  if (!orchestrator || currentWorkDir !== workDir) {
    orchestrator = new JetpackOrchestrator({
      workDir,
      autoStart: false,
    });
    await orchestrator.initialize();
    currentWorkDir = workDir;
  }
  return orchestrator;
}

/**
 * GET /api/metrics
 *
 * Returns Jetpack observability metrics in Prometheus or OpenTelemetry format.
 *
 * Query parameters:
 * - format: 'prometheus' (default) or 'opentelemetry'
 *
 * Prometheus format:
 * - Content-Type: text/plain; version=0.0.4; charset=utf-8
 *
 * OpenTelemetry format:
 * - Content-Type: application/json
 *
 * Available metrics:
 * - jetpack_uptime_seconds (gauge): Time since metrics were initialized
 * - jetpack_tasks_total (counter): Total number of tasks by status
 * - jetpack_tasks_in_progress (gauge): Number of currently in-progress tasks
 * - jetpack_task_duration_seconds (histogram): Task execution duration
 * - jetpack_agent_count (gauge): Number of agents by status
 * - jetpack_memory_entries_total (counter): Total number of memory entries
 */
export async function GET(request: NextRequest) {
  try {
    // Get format from query parameter
    const { searchParams } = new URL(request.url);
    const formatParam = searchParams.get('format') || 'prometheus';
    const format: MetricFormat = formatParam === 'opentelemetry' ? 'opentelemetry' : 'prometheus';

    // Get orchestrator and collect current metrics
    const jetpack = await getOrchestrator();
    const metrics = JetpackMetrics.getInstance();

    // Collect fresh metrics from orchestrator
    await metrics.collectFromOrchestrator(jetpack);

    // Export in requested format
    const output = metrics.export(format);

    // Set appropriate content type based on format
    const contentType = format === 'opentelemetry'
      ? 'application/json; charset=utf-8'
      : 'text/plain; version=0.0.4; charset=utf-8';

    return new NextResponse(output, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Prometheus convention: no caching
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Failed to fetch metrics:', error);

    // Return error in Prometheus-compatible format
    return new NextResponse(
      '# HELP jetpack_scrape_error Error during metrics scrape\n' +
      '# TYPE jetpack_scrape_error gauge\n' +
      `jetpack_scrape_error{message="${String(error).replace(/"/g, '\\"')}"} 1\n`,
      {
        status: 500,
        headers: {
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        },
      }
    );
  }
}
