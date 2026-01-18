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

// GET - Fetch CASS statistics
export async function GET() {
  try {
    const jetpack = await getOrchestrator();
    const cass = jetpack.getCASSAdapter();

    // Get both stat types
    const [stats, embeddingStats] = await Promise.all([
      cass.getStats(),
      cass.getEmbeddingStats(),
    ]);

    // Get current config
    const config = cass.getConfig();

    return NextResponse.json({
      stats: {
        total: stats.total,
        byType: stats.byType,
        avgImportance: Math.round(stats.avgImportance * 100) / 100,
        totalAccesses: stats.totalAccesses,
      },
      embeddings: {
        withEmbedding: embeddingStats.withEmbedding,
        withoutEmbedding: embeddingStats.withoutEmbedding,
        total: embeddingStats.total,
        percentage: embeddingStats.total > 0
          ? Math.round((embeddingStats.withEmbedding / embeddingStats.total) * 100)
          : 0,
      },
      config: {
        maxEntries: config.maxEntries,
        compactionThreshold: config.compactionThreshold,
        autoGenerateEmbeddings: config.autoGenerateEmbeddings,
        hasEmbeddingGenerator: config.hasEmbeddingGenerator,
        embeddingModel: config.embeddingModel,
      },
      fillPercentage: config.maxEntries > 0
        ? Math.round((stats.total / config.maxEntries) * 100)
        : 0,
    });
  } catch (error) {
    console.error('Failed to fetch CASS stats:', error);
    return NextResponse.json({ error: 'Failed to fetch CASS stats' }, { status: 500 });
  }
}
