import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Plan } from '@jetpack-agent/shared';

// Extended Plan type with execution tracking (not in shared types yet)
interface ExecutionRecord {
  id: string;
  planId: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed';
  taskResults: Record<string, {
    status: 'pending' | 'completed' | 'failed';
    assignedAgent?: string;
    completedAt?: string;
    error?: string;
  }>;
  actualDuration?: number;
}

interface PlanWithExecution extends Plan {
  executionHistory?: ExecutionRecord[];
}

// Get working directory from environment variable
function getWorkDir(): string {
  return process.env.JETPACK_WORK_DIR || path.join(process.cwd(), '../..');
}

function getPlansDir(): string {
  return path.join(getWorkDir(), '.jetpack', 'plans');
}

async function getPlan(planId: string): Promise<PlanWithExecution | null> {
  try {
    const filePath = path.join(getPlansDir(), `${planId}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as PlanWithExecution;
  } catch {
    return null;
  }
}

async function savePlan(plan: PlanWithExecution): Promise<void> {
  plan.updatedAt = new Date().toISOString();
  const filePath = path.join(getPlansDir(), `${plan.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(plan, null, 2));
}

// POST /api/plans/[id]/complete - Mark plan execution as complete
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const plan = await getPlan(id);

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    if (plan.status !== 'executing') {
      return NextResponse.json(
        { error: 'Plan is not executing' },
        { status: 400 }
      );
    }

    // Find the running execution and mark it complete (if execution history exists)
    if (plan.executionHistory) {
      const runningExec = plan.executionHistory.find(e => e.status === 'running');
      if (runningExec) {
        runningExec.status = 'completed';
        runningExec.completedAt = new Date().toISOString();
        runningExec.actualDuration = Math.round(
          (new Date(runningExec.completedAt).getTime() - new Date(runningExec.startedAt).getTime()) / 1000
        );

        // Mark all task results as completed
        for (const taskId of Object.keys(runningExec.taskResults)) {
          runningExec.taskResults[taskId].status = 'completed';
          runningExec.taskResults[taskId].completedAt = runningExec.completedAt;
        }
      }
    }

    plan.status = 'completed';
    await savePlan(plan);

    return NextResponse.json({
      success: true,
      plan,
    });
  } catch (error) {
    console.error('Failed to complete plan:', error);
    return NextResponse.json({ error: 'Failed to complete plan' }, { status: 500 });
  }
}
