import { NextResponse } from 'next/server';
import { JetpackOrchestrator } from '@jetpack-agent/orchestrator';
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

// POST - Backfill embeddings for memories without them
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const batchSize = body.batchSize || 10;

    const jetpack = await getOrchestrator();
    const cass = jetpack.getCASSAdapter();

    // Check if embedding generator is available
    if (!cass.hasEmbeddingGenerator()) {
      return NextResponse.json(
        { error: 'Embedding generator not available. Configure API key in settings.' },
        { status: 400 }
      );
    }

    // Run backfill
    const updated = await cass.backfillEmbeddings(batchSize);

    // Get updated stats
    const embeddingStats = await cass.getEmbeddingStats();

    return NextResponse.json({
      success: true,
      updated,
      embeddingStats: {
        withEmbedding: embeddingStats.withEmbedding,
        withoutEmbedding: embeddingStats.withoutEmbedding,
        total: embeddingStats.total,
        percentage: embeddingStats.total > 0
          ? Math.round((embeddingStats.withEmbedding / embeddingStats.total) * 100)
          : 0,
      },
    });
  } catch (error) {
    console.error('Failed to backfill embeddings:', error);
    return NextResponse.json(
      { error: 'Failed to backfill embeddings' },
      { status: 500 }
    );
  }
}
