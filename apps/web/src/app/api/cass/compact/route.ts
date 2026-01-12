import { NextResponse } from 'next/server';
import { JetpackOrchestrator } from '@jetpack/orchestrator';
import path from 'path';

let orchestrator: JetpackOrchestrator | null = null;

async function getOrchestrator() {
  if (!orchestrator) {
    orchestrator = new JetpackOrchestrator({
      workDir: path.join(process.cwd(), '../..'),
      autoStart: false,
    });
    await orchestrator.initialize();
  }
  return orchestrator;
}

// POST - Compact CASS memory store
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const jetpack = await getOrchestrator();
    const cass = jetpack.getCASSAdapter();

    // Get current config for threshold
    const config = cass.getConfig();
    const threshold = body.threshold ?? config.compactionThreshold;

    // Get stats before compaction
    const statsBefore = await cass.getStats();

    // Run compaction
    const removed = await cass.compact(threshold);

    // Get stats after compaction
    const statsAfter = await cass.getStats();

    return NextResponse.json({
      success: true,
      removed,
      threshold,
      before: statsBefore.total,
      after: statsAfter.total,
      stats: {
        total: statsAfter.total,
        byType: statsAfter.byType,
        avgImportance: Math.round(statsAfter.avgImportance * 100) / 100,
      },
    });
  } catch (error) {
    console.error('Failed to compact CASS:', error);
    return NextResponse.json(
      { error: 'Failed to compact memory store' },
      { status: 500 }
    );
  }
}
