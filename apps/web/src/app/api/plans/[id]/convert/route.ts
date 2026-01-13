import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  Plan,
  PlanItem,
  Task,
  AgentSkill,
  generateTaskId,
  updatePlanItem,
  findPlanItem,
  flattenPlanItems,
} from '@jetpack/shared';

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

async function getPlan(planId: string): Promise<Plan | null> {
  try {
    const filePath = path.join(getPlansDir(), `${planId}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as Plan;
  } catch (error) {
    return null;
  }
}

async function savePlan(plan: Plan): Promise<void> {
  plan.updatedAt = new Date().toISOString();
  const filePath = path.join(getPlansDir(), `${plan.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(plan, null, 2));
}

async function appendTask(task: Task): Promise<void> {
  const tasksFile = path.join(getBeadsDir(), 'tasks.jsonl');
  await fs.mkdir(getBeadsDir(), { recursive: true });
  await fs.appendFile(tasksFile, JSON.stringify(task) + '\n');
}

/**
 * POST /api/plans/[id]/convert - Convert plan items to Beads tasks
 *
 * Body: {
 *   itemIds: string[];           // Which plan items to convert (or "all")
 *   preserveDependencies: boolean; // Maintain dependency graph (default: true)
 * }
 *
 * Returns: {
 *   tasks: Task[];                // Created tasks
 *   mappings: { [itemId]: taskId } // Plan item → task mapping
 * }
 */
export async function POST(
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
    const {
      itemIds,
      preserveDependencies = true,
    } = body;

    // Determine which items to convert
    const allItems = flattenPlanItems(plan.items);
    let itemsToConvert: PlanItem[];

    if (itemIds === 'all' || !itemIds) {
      // Convert all pending items
      itemsToConvert = allItems.filter(item => item.status === 'pending');
    } else {
      // Convert specified items
      itemsToConvert = allItems.filter(
        item => itemIds.includes(item.id) && item.status === 'pending'
      );
    }

    if (itemsToConvert.length === 0) {
      return NextResponse.json({
        tasks: [],
        mappings: {},
        message: 'No items to convert (all may already be converted)',
      });
    }

    // Create mapping of plan item ID → task ID
    const mappings: Record<string, string> = {};
    const createdTasks: Task[] = [];

    // First pass: create tasks and build mappings
    for (const item of itemsToConvert) {
      const taskId = generateTaskId();
      mappings[item.id] = taskId;
    }

    // Second pass: create tasks with resolved dependencies
    for (const item of itemsToConvert) {
      const taskId = mappings[item.id];

      // Resolve dependencies: map plan item IDs to task IDs
      let dependencies: string[] = [];
      if (preserveDependencies && item.dependencies.length > 0) {
        dependencies = item.dependencies
          .map(depId => {
            // Check if this dependency is being converted
            if (mappings[depId]) {
              return mappings[depId];
            }
            // Check if it was already converted
            const depItem = findPlanItem(plan.items, depId);
            if (depItem?.taskId) {
              return depItem.taskId;
            }
            return null;
          })
          .filter((id): id is string => id !== null);
      }

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
        tags: [`plan:${plan.id}`],
        createdAt: now,
        updatedAt: now,
      };

      // Append to tasks.jsonl
      await appendTask(task);
      createdTasks.push(task);

      // Update plan item status and link to task
      plan.items = updatePlanItem(plan.items, item.id, {
        status: 'converted',
        taskId,
      });
    }

    // Update plan status
    const allConverted = allItems.every(
      item => item.status !== 'pending' || mappings[item.id]
    );
    if (allConverted && plan.status === 'draft') {
      plan.status = 'approved';
    }
    if (createdTasks.length > 0 && plan.status !== 'executing') {
      plan.status = 'executing';
    }

    await savePlan(plan);

    return NextResponse.json({
      success: true,
      tasks: createdTasks,
      mappings,
      message: `Converted ${createdTasks.length} items to tasks`,
    });
  } catch (error) {
    console.error('Failed to convert plan items:', error);
    return NextResponse.json(
      { error: 'Failed to convert plan items' },
      { status: 500 }
    );
  }
}
