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
    const beads = jetpack.getBeadsAdapter();
    const tasks = await beads.listTasks();

    // Convert Date objects to ISO strings for JSON serialization
    const serializedTasks = tasks.map(task => ({
      ...task,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      completedAt: task.completedAt?.toISOString(),
    }));

    return NextResponse.json({ tasks: serializedTasks });
  } catch (error) {
    console.error('Failed to fetch tasks:', error);
    return NextResponse.json({ tasks: [], error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const jetpack = await getOrchestrator();

    const task = await jetpack.createTask({
      title: body.title,
      description: body.description,
      priority: body.priority || 'medium',
      requiredSkills: body.requiredSkills || [],
      estimatedMinutes: body.estimatedMinutes,
    });

    return NextResponse.json({
      task: {
        ...task,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
        completedAt: task.completedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to create task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
