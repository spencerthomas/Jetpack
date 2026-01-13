#!/usr/bin/env node
/**
 * Jetpack MCP Server
 *
 * Exposes Jetpack's planning and task system to Claude Code via MCP protocol.
 * This allows Claude Code to be a first-class Jetpack client, reading/writing
 * plans and tasks that sync with the Jetpack web UI.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Plan, Task, TaskPriority, TaskStatus } from '@jetpack/shared';

// Determine working directory - check env var or use cwd
const WORK_DIR = process.env.JETPACK_WORK_DIR || process.cwd();
const JETPACK_DIR = path.join(WORK_DIR, '.jetpack');
const BEADS_DIR = path.join(WORK_DIR, '.beads');
const PLANS_DIR = path.join(JETPACK_DIR, 'plans');
const TASKS_FILE = path.join(BEADS_DIR, 'tasks.jsonl');

// ============================================================================
// File System Helpers
// ============================================================================

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function readJsonLines<T>(filePath: string): Promise<T[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
}

async function appendJsonLine(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, JSON.stringify(data) + '\n');
}

async function updateJsonLine<T extends { id: string }>(
  filePath: string,
  id: string,
  updater: (item: T) => T
): Promise<T | null> {
  const items = await readJsonLines<T>(filePath);
  let updated: T | null = null;

  const newItems = items.map((item) => {
    if (item.id === id) {
      updated = updater(item);
      return updated;
    }
    return item;
  });

  if (updated) {
    await fs.writeFile(
      filePath,
      newItems.map((item) => JSON.stringify(item)).join('\n') + '\n'
    );
  }

  return updated;
}

// ============================================================================
// Plan Operations
// ============================================================================

async function listPlans(): Promise<Plan[]> {
  try {
    const files = await fs.readdir(PLANS_DIR);
    const plans: Plan[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const plan = await readJsonFile<Plan>(path.join(PLANS_DIR, file));
        if (plan) plans.push(plan);
      }
    }

    return plans.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch {
    return [];
  }
}

async function getPlan(planId: string): Promise<Plan | null> {
  return readJsonFile<Plan>(path.join(PLANS_DIR, `${planId}.json`));
}

async function createPlan(
  title: string,
  description: string,
  userRequest: string,
  items: Plan['items'] = []
): Promise<Plan> {
  const planId = `plan-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const now = new Date().toISOString();

  const plan: Plan = {
    id: planId,
    title,
    description,
    userRequest,
    status: 'draft',
    items,
    tags: [],
    isTemplate: false,
    createdAt: now,
    updatedAt: now,
  };

  await writeJsonFile(path.join(PLANS_DIR, `${planId}.json`), plan);
  return plan;
}

async function updatePlan(planId: string, updates: Partial<Plan>): Promise<Plan | null> {
  const plan = await getPlan(planId);
  if (!plan) return null;

  const updated: Plan = {
    ...plan,
    ...updates,
    id: planId, // Ensure ID isn't changed
    updatedAt: new Date().toISOString(),
  };

  await writeJsonFile(path.join(PLANS_DIR, `${planId}.json`), updated);
  return updated;
}

// ============================================================================
// Task Operations
// ============================================================================

async function listTasks(filters?: {
  status?: TaskStatus;
  planId?: string;
}): Promise<Task[]> {
  const tasks = await readJsonLines<Task>(TASKS_FILE);

  return tasks.filter((task) => {
    if (filters?.status && task.status !== filters.status) return false;
    if (filters?.planId && task.metadata?.planId !== filters.planId) return false;
    return true;
  });
}

async function getTask(taskId: string): Promise<Task | null> {
  const tasks = await readJsonLines<Task>(TASKS_FILE);
  return tasks.find((t) => t.id === taskId) || null;
}

async function createTask(params: {
  title: string;
  description?: string;
  priority?: TaskPriority;
  planId?: string;
  planItemId?: string;
  dependencies?: string[];
}): Promise<Task> {
  const taskId = `bd-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const now = new Date();

  const task: Task = {
    id: taskId,
    title: params.title,
    description: params.description || '',
    status: 'pending',
    priority: params.priority || 'medium',
    dependencies: params.dependencies || [],
    blockers: [],
    requiredSkills: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    metadata: {
      planId: params.planId,
      planItemId: params.planItemId,
    },
  };

  await appendJsonLine(TASKS_FILE, task);
  return task;
}

async function claimTask(taskId: string, agentId: string): Promise<Task | null> {
  return updateJsonLine<Task>(TASKS_FILE, taskId, (task) => ({
    ...task,
    status: 'claimed',
    assignedAgent: agentId,
    updatedAt: new Date(),
  }));
}

async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  output?: string
): Promise<Task | null> {
  return updateJsonLine<Task>(TASKS_FILE, taskId, (task) => ({
    ...task,
    status,
    metadata: output ? { ...task.metadata, output } : task.metadata,
    completedAt: status === 'completed' || status === 'failed' ? new Date() : task.completedAt,
    updatedAt: new Date(),
  }));
}

// ============================================================================
// Status Operations
// ============================================================================

async function getSystemStatus(): Promise<{
  plans: { total: number; byStatus: Record<string, number> };
  tasks: { total: number; byStatus: Record<string, number> };
  workDir: string;
}> {
  const plans = await listPlans();
  const tasks = await readJsonLines<Task>(TASKS_FILE);

  const plansByStatus: Record<string, number> = {};
  for (const plan of plans) {
    plansByStatus[plan.status] = (plansByStatus[plan.status] || 0) + 1;
  }

  const tasksByStatus: Record<string, number> = {};
  for (const task of tasks) {
    tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1;
  }

  return {
    plans: { total: plans.length, byStatus: plansByStatus },
    tasks: { total: tasks.length, byStatus: tasksByStatus },
    workDir: WORK_DIR,
  };
}

// ============================================================================
// MCP Server Setup
// ============================================================================

const server = new McpServer({
  name: 'jetpack',
  version: '0.1.0',
});

// ----- Plan Tools -----

server.tool(
  'jetpack_list_plans',
  'List all plans in Jetpack. Returns plan summaries sorted by last updated.',
  {},
  async () => {
    const plans = await listPlans();
    const summaries = plans.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      itemCount: p.items.length,
      updatedAt: p.updatedAt,
    }));
    return {
      content: [{ type: 'text', text: JSON.stringify(summaries, null, 2) }],
    };
  }
);

server.tool(
  'jetpack_get_plan',
  'Get a specific plan by ID, including all items and their status.',
  { planId: z.string().describe('The plan ID to retrieve') },
  async ({ planId }) => {
    const plan = await getPlan(planId);
    if (!plan) {
      return {
        content: [{ type: 'text', text: `Plan not found: ${planId}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }],
    };
  }
);

server.tool(
  'jetpack_create_plan',
  'Create a new plan in Jetpack. The plan will be visible in the Jetpack UI.',
  {
    title: z.string().describe('Plan title'),
    description: z.string().describe('Plan description'),
    userRequest: z.string().describe('The original user request this plan addresses'),
  },
  async ({ title, description, userRequest }) => {
    const plan = await createPlan(title, description, userRequest);
    return {
      content: [
        {
          type: 'text',
          text: `Created plan: ${plan.id}\nView at: http://localhost:3000/plans/${plan.id}`,
        },
      ],
    };
  }
);

server.tool(
  'jetpack_update_plan',
  'Update a plan (title, description, status, or items).',
  {
    planId: z.string().describe('The plan ID to update'),
    title: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description'),
    status: z
      .enum(['draft', 'approved', 'executing', 'completed', 'failed', 'paused'])
      .optional()
      .describe('New status'),
  },
  async ({ planId, ...updates }) => {
    const plan = await updatePlan(planId, updates);
    if (!plan) {
      return {
        content: [{ type: 'text', text: `Plan not found: ${planId}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: `Updated plan: ${plan.id}` }],
    };
  }
);

// ----- Task Tools -----

server.tool(
  'jetpack_list_tasks',
  'List tasks, optionally filtered by status or plan.',
  {
    status: z
      .enum(['pending', 'ready', 'claimed', 'in_progress', 'blocked', 'completed', 'failed'])
      .optional()
      .describe('Filter by task status'),
    planId: z.string().optional().describe('Filter by plan ID'),
  },
  async ({ status, planId }) => {
    const tasks = await listTasks({ status, planId });
    const summaries = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      assignedAgent: t.assignedAgent,
      planId: t.metadata?.planId,
    }));
    return {
      content: [{ type: 'text', text: JSON.stringify(summaries, null, 2) }],
    };
  }
);

server.tool(
  'jetpack_get_task',
  'Get detailed information about a specific task.',
  { taskId: z.string().describe('The task ID to retrieve') },
  async ({ taskId }) => {
    const task = await getTask(taskId);
    if (!task) {
      return {
        content: [{ type: 'text', text: `Task not found: ${taskId}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(task, null, 2) }],
    };
  }
);

server.tool(
  'jetpack_create_task',
  'Create a new task in Jetpack. Can optionally link to a plan.',
  {
    title: z.string().describe('Task title'),
    description: z.string().optional().describe('Task description'),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Task priority'),
    planId: z.string().optional().describe('Link to a plan'),
    dependencies: z.array(z.string()).optional().describe('Task IDs this depends on'),
  },
  async ({ title, description, priority, planId, dependencies }) => {
    const task = await createTask({ title, description, priority, planId, dependencies });
    return {
      content: [{ type: 'text', text: `Created task: ${task.id}\nTitle: ${task.title}` }],
    };
  }
);

server.tool(
  'jetpack_claim_task',
  'Claim a task to work on. Marks it as assigned to Claude Code.',
  { taskId: z.string().describe('The task ID to claim') },
  async ({ taskId }) => {
    const task = await claimTask(taskId, 'claude-code');
    if (!task) {
      return {
        content: [{ type: 'text', text: `Task not found: ${taskId}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: `Claimed task: ${task.id}\nTitle: ${task.title}` }],
    };
  }
);

server.tool(
  'jetpack_start_task',
  'Mark a task as in progress.',
  { taskId: z.string().describe('The task ID to start') },
  async ({ taskId }) => {
    const task = await updateTaskStatus(taskId, 'in_progress');
    if (!task) {
      return {
        content: [{ type: 'text', text: `Task not found: ${taskId}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: `Started task: ${task.id}` }],
    };
  }
);

server.tool(
  'jetpack_complete_task',
  'Mark a task as completed with optional output/summary.',
  {
    taskId: z.string().describe('The task ID to complete'),
    output: z.string().optional().describe('Summary of what was accomplished'),
  },
  async ({ taskId, output }) => {
    const task = await updateTaskStatus(taskId, 'completed', output);
    if (!task) {
      return {
        content: [{ type: 'text', text: `Task not found: ${taskId}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: `Completed task: ${task.id}` }],
    };
  }
);

server.tool(
  'jetpack_fail_task',
  'Mark a task as failed with an error message.',
  {
    taskId: z.string().describe('The task ID that failed'),
    error: z.string().describe('Error message explaining what went wrong'),
  },
  async ({ taskId, error }) => {
    const task = await updateTaskStatus(taskId, 'failed', error);
    if (!task) {
      return {
        content: [{ type: 'text', text: `Task not found: ${taskId}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: `Failed task: ${task.id}\nError: ${error}` }],
    };
  }
);

// ----- Status Tools -----

server.tool(
  'jetpack_status',
  'Get overall Jetpack system status including plan and task counts.',
  {},
  async () => {
    const status = await getSystemStatus();
    return {
      content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
    };
  }
);

server.tool(
  'jetpack_sync_todos',
  'Sync your current Claude Code todos to Jetpack as tasks under a plan.',
  {
    planId: z.string().describe('The plan ID to sync todos to'),
    todos: z
      .array(
        z.object({
          content: z.string(),
          status: z.enum(['pending', 'in_progress', 'completed']),
        })
      )
      .describe('Array of todo items to sync'),
  },
  async ({ planId, todos }) => {
    const plan = await getPlan(planId);
    if (!plan) {
      return {
        content: [{ type: 'text', text: `Plan not found: ${planId}` }],
        isError: true,
      };
    }

    const created: string[] = [];
    for (const todo of todos) {
      // Map todo status to task status
      let taskStatus: TaskStatus = 'pending';
      if (todo.status === 'in_progress') taskStatus = 'in_progress';
      if (todo.status === 'completed') taskStatus = 'completed';

      const task = await createTask({
        title: todo.content,
        planId,
        priority: 'medium',
      });

      if (taskStatus !== 'pending') {
        await updateTaskStatus(task.id, taskStatus);
      }

      created.push(task.id);
    }

    return {
      content: [
        {
          type: 'text',
          text: `Synced ${created.length} todos to plan ${planId}\nTask IDs: ${created.join(', ')}`,
        },
      ],
    };
  }
);

// ----- Start Server -----

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Jetpack MCP server started');
}

main().catch(console.error);
