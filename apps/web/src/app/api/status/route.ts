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
