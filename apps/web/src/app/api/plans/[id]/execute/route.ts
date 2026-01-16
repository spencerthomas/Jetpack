import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  Plan,
  Task,
  AgentSkill,
  generateTaskId,
  flattenPlanItems,
} from '@jetpack/shared';

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

// Valid agent skills for filtering
const VALID_SKILLS: Set<string> = new Set([
  'typescript', 'python', 'rust', 'go', 'java',
  'react', 'vue',
  'backend', 'frontend', 'devops', 'database', 'testing', 'documentation',
  'sql', 'data', 'ml', 'api', 'security', 'mobile',
]);

// Get working directory from environment variable
function getWorkDir(): string {
  return process.env.JETPACK_WORK_DIR || path.join(process.cwd(), '../..');
}

function getPlansDir(): string {
  return path.join(getWorkDir(), '.jetpack', 'plans');
}

function getBeadsDir(): string {
  return path.join(getWorkDir(), '.beads');
}

function generateExecutionId(): string {
  const chars = '0123456789abcdef';
  let id = 'exec-';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
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

async function appendTask(task: Task): Promise<void> {
  const tasksFile = path.join(getBeadsDir(), 'tasks.jsonl');
  await fs.mkdir(getBeadsDir(), { recursive: true });
  await fs.appendFile(tasksFile, JSON.stringify(task) + '\n');
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

    // Create execution record
    const executionId = generateExecutionId();
    const executionRecord: ExecutionRecord = {
      id: executionId,
      planId: plan.id,
      startedAt: new Date().toISOString(),
      status: 'running',
      taskResults: {},
    };

    // Map from plan item IDs to task IDs
    const taskIdMap: Record<string, string> = {};

    // Flatten plan items (in case of nested structure)
    const allItems = flattenPlanItems(plan.items);
    const itemsToExecute = allItems.filter(item => item.status === 'pending');

    if (itemsToExecute.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No pending items to execute',
      });
    }

    // First pass: generate task IDs for all items
    for (const item of itemsToExecute) {
      taskIdMap[item.id] = generateTaskId();
    }

    // Second pass: create tasks with resolved dependencies
    const createdTasks: Task[] = [];
    for (const item of itemsToExecute) {
      const taskId = taskIdMap[item.id];

      // Resolve dependencies to task IDs
      const dependencies = item.dependencies
        .map(depId => taskIdMap[depId])
        .filter(Boolean);

      const now = new Date();
      const task: Task = {
        id: taskId,
        title: item.title,
        description: item.description,
        status: 'pending',
        priority: item.priority,
        dependencies,
        blockers: [],
        requiredSkills: item.skills.filter(s => VALID_SKILLS.has(s)) as AgentSkill[],
        estimatedMinutes: item.estimatedMinutes,
        tags: [`plan:${plan.id}`, `execution:${executionId}`],
        createdAt: now,
        updatedAt: now,
        retryCount: 0,
        maxRetries: 2,
        targetBranches: [],
      };

      // Append to tasks.jsonl (JSONL format for Beads adapter)
      await appendTask(task);
      createdTasks.push(task);

      // Initialize task result in execution record
      executionRecord.taskResults[item.id] = {
        status: 'pending',
      };
    }

    // Update plan with execution record
    if (!plan.executionHistory) {
      plan.executionHistory = [];
    }
    plan.executionHistory.push(executionRecord);
    plan.status = 'executing';
    await savePlan(plan);

    return NextResponse.json({
      success: true,
      executionId,
      taskCount: createdTasks.length,
      tasks: createdTasks,
      message: `Created ${createdTasks.length} tasks from plan "${plan.title}"`,
    });
  } catch (error) {
    console.error('Failed to execute plan:', error);
    return NextResponse.json({ error: 'Failed to execute plan' }, { status: 500 });
  }
}
