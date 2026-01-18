import { NextResponse } from 'next/server';
import { JetpackOrchestrator } from '@jetpack-agent/orchestrator';
import path from 'path';

// Get working directory from environment variable or default to repo root
function getWorkDir(): string {
  return process.env.JETPACK_WORK_DIR || path.join(process.cwd(), '../..');
}

let orchestrator: JetpackOrchestrator | null = null;
let currentWorkDir: string | null = null;

async function getOrchestrator() {
  const workDir = getWorkDir();
  // Reinitialize if workDir changed
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const jetpack = await getOrchestrator();
    const beads = jetpack.getBeadsAdapter();

    const task = await beads.updateTask(id, body);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({
      task: {
        ...task,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
        completedAt: task.completedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to update task:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const jetpack = await getOrchestrator();
    const beads = jetpack.getBeadsAdapter();

    const deleted = await beads.deleteTask(id);

    if (!deleted) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete task:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
