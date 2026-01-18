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

export async function GET() {
  try {
    const jetpack = await getOrchestrator();
    const status = await jetpack.getStatus();

    return NextResponse.json(status);
  } catch (error) {
    console.error('Failed to fetch status:', error);
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
  }
}
