import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

interface PlannedTask {
  id: string;
  title: string;
  description: string;
  requiredSkills: string[];
  estimatedMinutes: number;
  dependsOn: string[];
}

interface Plan {
  id: string;
  name: string;
  description?: string;
  userRequest: string;
  status: 'draft' | 'approved' | 'executing' | 'completed' | 'failed';
  plannedTasks: PlannedTask[];
  createdAt: string;
  updatedAt: string;
  estimatedDuration?: number;
  executionHistory: unknown[];
  tags: string[];
  isTemplate: boolean;
}

const plansDir = path.join(process.cwd(), '../..', '.jetpack', 'plans');

async function getPlan(planId: string): Promise<Plan | null> {
  try {
    const filePath = path.join(plansDir, `${planId}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as Plan;
  } catch (error) {
    return null;
  }
}

async function savePlan(plan: Plan): Promise<void> {
  plan.updatedAt = new Date().toISOString();
  const filePath = path.join(plansDir, `${plan.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(plan, null, 2));
}

// GET /api/plans/[id] - Get a single plan
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const plan = await getPlan(id);

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    return NextResponse.json({ plan });
  } catch (error) {
    console.error('Failed to get plan:', error);
    return NextResponse.json({ error: 'Failed to get plan' }, { status: 500 });
  }
}

// PATCH /api/plans/[id] - Update a plan
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const plan = await getPlan(id);

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, plannedTasks, status, tags, isTemplate } = body;

    if (name !== undefined) plan.name = name;
    if (description !== undefined) plan.description = description;
    if (plannedTasks !== undefined) {
      plan.plannedTasks = plannedTasks;
      plan.estimatedDuration = plannedTasks.reduce(
        (sum: number, t: PlannedTask) => sum + t.estimatedMinutes,
        0
      );
    }
    if (status !== undefined) plan.status = status;
    if (tags !== undefined) plan.tags = tags;
    if (isTemplate !== undefined) plan.isTemplate = isTemplate;

    await savePlan(plan);

    return NextResponse.json({ plan });
  } catch (error) {
    console.error('Failed to update plan:', error);
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
  }
}

// DELETE /api/plans/[id] - Delete a plan
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const filePath = path.join(plansDir, `${id}.json`);

    try {
      await fs.unlink(filePath);
      return NextResponse.json({ success: true });
    } catch (error) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('Failed to delete plan:', error);
    return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 });
  }
}
