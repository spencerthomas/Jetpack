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

function generatePlanId(): string {
  const chars = '0123456789abcdef';
  let id = 'plan-';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function generateTaskId(): string {
  const chars = '0123456789abcdef';
  let id = 'task-';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

async function ensurePlansDir() {
  await fs.mkdir(plansDir, { recursive: true });
}

// GET /api/plans - List all plans
export async function GET(request: Request) {
  try {
    await ensurePlansDir();

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const isTemplate = url.searchParams.get('isTemplate');

    const files = await fs.readdir(plansDir);
    const plans: Plan[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(plansDir, file);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const plan = JSON.parse(content) as Plan;

        // Apply filters
        if (status && plan.status !== status) continue;
        if (isTemplate === 'true' && !plan.isTemplate) continue;
        if (isTemplate === 'false' && plan.isTemplate) continue;

        plans.push(plan);
      } catch (err) {
        console.warn(`Failed to parse plan file: ${file}`);
      }
    }

    // Sort by updatedAt descending
    plans.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return NextResponse.json({ plans });
  } catch (error) {
    console.error('Failed to list plans:', error);
    return NextResponse.json({ plans: [], error: 'Failed to list plans' }, { status: 500 });
  }
}

// POST /api/plans - Create a new plan
export async function POST(request: Request) {
  try {
    await ensurePlansDir();

    const body = await request.json();
    const { name, description, userRequest, tasks, tags, isTemplate } = body;

    if (!name || !userRequest) {
      return NextResponse.json(
        { error: 'name and userRequest are required' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // Generate IDs for tasks if not provided
    const plannedTasks: PlannedTask[] = (tasks || []).map((t: Partial<PlannedTask>) => ({
      id: t.id || generateTaskId(),
      title: t.title || '',
      description: t.description || '',
      requiredSkills: t.requiredSkills || [],
      estimatedMinutes: t.estimatedMinutes || 15,
      dependsOn: t.dependsOn || [],
    }));

    const plan: Plan = {
      id: generatePlanId(),
      name,
      description,
      userRequest,
      status: 'draft',
      plannedTasks,
      createdAt: now,
      updatedAt: now,
      estimatedDuration: plannedTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0),
      executionHistory: [],
      tags: tags || [],
      isTemplate: isTemplate || false,
    };

    const filePath = path.join(plansDir, `${plan.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(plan, null, 2));

    return NextResponse.json({ plan });
  } catch (error) {
    console.error('Failed to create plan:', error);
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 });
  }
}
