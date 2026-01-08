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
    const agentControllers = jetpack.getAgents();

    const agents = agentControllers.map(controller => {
      const agent = controller.getAgent();
      return {
        ...agent,
        createdAt: agent.createdAt.toISOString(),
        lastActive: agent.lastActive.toISOString(),
      };
    });

    return NextResponse.json({ agents });
  } catch (error) {
    console.error('Failed to fetch agents:', error);
    return NextResponse.json({ agents: [], error: 'Failed to fetch agents' }, { status: 500 });
  }
}
