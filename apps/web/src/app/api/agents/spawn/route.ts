import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import { generateAgentId } from '@jetpack/shared';

const JETPACK_DIR = path.join(process.cwd(), '../..', '.jetpack');

// Harness types supported
export type HarnessType = 'claude-code' | 'codex' | 'gemini-cli';

// Agent spawn configuration
interface AgentSpawnConfig {
  name: string;
  harnessType: HarnessType;
  skills: string[];
  systemPrompt?: string;
  tools?: string[];
  autoStart?: boolean;
}

// Pending spawn request stored on disk
interface PendingSpawn extends AgentSpawnConfig {
  id: string;
  requestedAt: string;
  status: 'pending' | 'spawning' | 'active' | 'failed';
  error?: string;
}

// Agent config file path
const SPAWN_QUEUE_PATH = path.join(JETPACK_DIR, 'spawn-queue.json');

/**
 * POST /api/agents/spawn - Request agent spawn
 *
 * The web UI writes spawn requests to a file that the CLI orchestrator picks up.
 * This allows the web UI to request agent spawns without direct access to the orchestrator.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Partial<AgentSpawnConfig>;

    // Validate required fields
    if (!body.name || !body.name.trim()) {
      return NextResponse.json(
        { error: 'Agent name is required' },
        { status: 400 }
      );
    }

    if (!body.harnessType) {
      return NextResponse.json(
        { error: 'Harness type is required' },
        { status: 400 }
      );
    }

    // Validate harness type
    const validHarnesses: HarnessType[] = ['claude-code', 'codex', 'gemini-cli'];
    if (!validHarnesses.includes(body.harnessType)) {
      return NextResponse.json(
        { error: `Invalid harness type. Must be one of: ${validHarnesses.join(', ')}` },
        { status: 400 }
      );
    }

    // Create spawn request
    const spawnRequest: PendingSpawn = {
      id: generateAgentId(body.name.trim()),
      name: body.name.trim(),
      harnessType: body.harnessType,
      skills: body.skills || [],
      systemPrompt: body.systemPrompt,
      tools: body.tools || [],
      autoStart: body.autoStart ?? true,
      requestedAt: new Date().toISOString(),
      status: 'pending',
    };

    // Ensure .jetpack directory exists
    await fs.mkdir(JETPACK_DIR, { recursive: true });

    // Load existing queue
    let queue: PendingSpawn[] = [];
    try {
      const content = await fs.readFile(SPAWN_QUEUE_PATH, 'utf-8');
      queue = JSON.parse(content);
    } catch {
      // File doesn't exist yet
    }

    // Add to queue
    queue.push(spawnRequest);

    // Write queue back
    await fs.writeFile(SPAWN_QUEUE_PATH, JSON.stringify(queue, null, 2));

    return NextResponse.json({
      success: true,
      agentId: spawnRequest.id,
      message: 'Agent spawn requested. It will start when the orchestrator processes the queue.',
    });
  } catch (error) {
    console.error('Error spawning agent:', error);
    return NextResponse.json(
      { error: 'Failed to spawn agent' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agents/spawn - Get pending spawn requests
 */
export async function GET() {
  try {
    let queue: PendingSpawn[] = [];
    try {
      const content = await fs.readFile(SPAWN_QUEUE_PATH, 'utf-8');
      queue = JSON.parse(content);
    } catch {
      // File doesn't exist yet
    }

    return NextResponse.json({
      pending: queue.filter(s => s.status === 'pending'),
      spawning: queue.filter(s => s.status === 'spawning'),
      active: queue.filter(s => s.status === 'active'),
      failed: queue.filter(s => s.status === 'failed'),
      total: queue.length,
    });
  } catch (error) {
    console.error('Error getting spawn queue:', error);
    return NextResponse.json(
      { error: 'Failed to get spawn queue' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/agents/spawn - Clear completed/failed spawn requests
 */
export async function DELETE() {
  try {
    let queue: PendingSpawn[] = [];
    try {
      const content = await fs.readFile(SPAWN_QUEUE_PATH, 'utf-8');
      queue = JSON.parse(content);
    } catch {
      // File doesn't exist
      return NextResponse.json({ cleared: 0 });
    }

    // Keep only pending/spawning requests
    const before = queue.length;
    queue = queue.filter(s => s.status === 'pending' || s.status === 'spawning');
    const cleared = before - queue.length;

    await fs.writeFile(SPAWN_QUEUE_PATH, JSON.stringify(queue, null, 2));

    return NextResponse.json({
      success: true,
      cleared,
    });
  } catch (error) {
    console.error('Error clearing spawn queue:', error);
    return NextResponse.json(
      { error: 'Failed to clear spawn queue' },
      { status: 500 }
    );
  }
}
