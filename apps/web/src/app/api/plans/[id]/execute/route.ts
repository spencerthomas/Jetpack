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
  plannedTasks: PlannedTask[];
  createdAt: string;
  updatedAt: string;
  estimatedDuration?: number;
  executionHistory: ExecutionRecord[];
  tags: string[];
  isTemplate: boolean;
}

const plansDir = path.join(process.cwd(), '../..', '.jetpack', 'plans');
const tasksDir = path.join(process.cwd(), '../..', '.beads', 'tasks');

function generateExecutionId(): string {
  const chars = '0123456789abcdef';
  let id = 'exec-';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function generateTaskId(): string {
  const chars = '0123456789abcdef';
  let id = 'bd-';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

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

// POST /api/plans/[id]/execute - Execute a plan by creating tasks
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

    if (plan.status === 'executing') {
      return NextResponse.json(
        { error: 'Plan is already executing' },
        { status: 400 }
      );
    }

    // Ensure tasks directory exists
    await fs.mkdir(tasksDir, { recursive: true });

    // Create execution record
    const executionId = generateExecutionId();
    const executionRecord: ExecutionRecord = {
      id: executionId,
      planId: plan.id,
      startedAt: new Date().toISOString(),
      status: 'running',
      taskResults: {},
    };

    // Map from planned task IDs to bead task IDs
    const taskIdMap: Record<string, string> = {};

    // Create task files for each planned task
    for (const plannedTask of plan.plannedTasks) {
      const beadTaskId = generateTaskId();
      taskIdMap[plannedTask.id] = beadTaskId;

      // Resolve dependencies to bead task IDs
      const dependencies = plannedTask.dependsOn
        .map(depId => taskIdMap[depId])
        .filter(Boolean);

      // Create task markdown file
      const taskContent = `---
title: ${plannedTask.title}
priority: medium
skills: [${plannedTask.requiredSkills.join(', ')}]
estimate: ${plannedTask.estimatedMinutes}
${dependencies.length > 0 ? `dependencies: [${dependencies.join(', ')}]` : ''}
---

${plannedTask.description}

---
*Generated from plan: ${plan.name} (${plan.id})*
*Execution: ${executionId}*
`;

      const taskFilePath = path.join(tasksDir, `${beadTaskId}-${plannedTask.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}.md`);
      await fs.writeFile(taskFilePath, taskContent);

      // Initialize task result
      executionRecord.taskResults[plannedTask.id] = {
        status: 'pending',
      };
    }

    // Update plan with execution record
    plan.executionHistory.push(executionRecord);
    plan.status = 'executing';
    await savePlan(plan);

    return NextResponse.json({
      success: true,
      executionId,
      taskCount: plan.plannedTasks.length,
      message: `Created ${plan.plannedTasks.length} tasks from plan`,
    });
  } catch (error) {
    console.error('Failed to execute plan:', error);
    return NextResponse.json({ error: 'Failed to execute plan' }, { status: 500 });
  }
}
