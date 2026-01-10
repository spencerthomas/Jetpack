import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

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

interface Plan {
  id: string;
  name: string;
  description?: string;
  userRequest: string;
  status: 'draft' | 'approved' | 'executing' | 'completed' | 'failed';
  plannedTasks: unknown[];
  createdAt: string;
  updatedAt: string;
  estimatedDuration?: number;
  executionHistory: ExecutionRecord[];
  tags: string[];
  isTemplate: boolean;
}

const plansDir = path.join(process.cwd(), '../..', '.jetpack', 'plans');

async function getPlan(planId: string): Promise<Plan | null> {
  try {
    const filePath = path.join(plansDir, `${planId}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as Plan;
  } catch {
    return null;
  }
}

async function savePlan(plan: Plan): Promise<void> {
  plan.updatedAt = new Date().toISOString();
  const filePath = path.join(plansDir, `${plan.id}.json`);
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

    // Find the running execution and mark it complete
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
