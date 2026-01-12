import { NextResponse } from 'next/server';
import { JetpackOrchestrator } from '@jetpack/orchestrator';
import { MemoryType } from '@jetpack/shared';
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

// GET - Fetch memories with optional filtering
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const type = searchParams.get('type') as MemoryType | null;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const search = searchParams.get('search');

    const jetpack = await getOrchestrator();
    const cass = jetpack.getCASSAdapter();

    let memories;

    if (search) {
      // Text search
      memories = await cass.search(search, limit);
    } else if (type) {
      // Filter by type
      memories = await cass.getByType(type, limit);
    } else {
      // Get recent memories
      memories = await cass.getRecentMemories(limit);
    }

    // Transform for API response
    const formattedMemories = memories.map(memory => ({
      id: memory.id,
      type: memory.type,
      content: memory.content,
      importance: memory.importance,
      accessCount: memory.accessCount,
      createdAt: memory.createdAt.toISOString(),
      lastAccessed: memory.lastAccessed.toISOString(),
      hasEmbedding: !!memory.embedding,
      metadata: memory.metadata,
    }));

    return NextResponse.json({
      memories: formattedMemories,
      count: formattedMemories.length,
      limit,
      type: type || 'all',
    });
  } catch (error) {
    console.error('Failed to fetch memories:', error);
    return NextResponse.json({ error: 'Failed to fetch memories' }, { status: 500 });
  }
}
