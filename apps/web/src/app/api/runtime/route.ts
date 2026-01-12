import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

// Get working directory from environment variable
function getWorkDir(): string {
  return process.env.JETPACK_WORK_DIR || path.join(process.cwd(), '../..');
}

/**
 * GET /api/runtime - Get runtime status and statistics
 */
export async function GET() {
  try {
    const workDir = getWorkDir();
    const runtimeStateFile = path.join(workDir, '.jetpack', 'runtime-state.json');

    // Try to read runtime state file
    let runtimeState = null;
    try {
      const content = await fs.readFile(runtimeStateFile, 'utf-8');
      runtimeState = JSON.parse(content);
    } catch {
      // No runtime state file - system not started or fresh
    }

    // Calculate derived stats if state exists
    let stats = null;
    if (runtimeState) {
      const startedAt = new Date(runtimeState.startedAt);
      const now = new Date();
      const elapsedMs = now.getTime() - startedAt.getTime();
      const totalTasks = runtimeState.tasksCompleted + runtimeState.tasksFailed;

      stats = {
        cycleCount: runtimeState.cycleCount,
        tasksCompleted: runtimeState.tasksCompleted,
        tasksFailed: runtimeState.tasksFailed,
        totalTasks,
        successRate: totalTasks > 0
          ? ((runtimeState.tasksCompleted / totalTasks) * 100).toFixed(1)
          : '0.0',
        startedAt: runtimeState.startedAt,
        lastWorkAt: runtimeState.lastWorkAt,
        elapsedMs,
        elapsedFormatted: formatDuration(elapsedMs),
        endState: runtimeState.endState,
        isRunning: runtimeState.endState === null,
      };
    }

    return NextResponse.json({
      success: true,
      runtime: stats,
      workDir,
    });
  } catch (error) {
    console.error('Error getting runtime status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get runtime status' },
      { status: 500 }
    );
  }
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
