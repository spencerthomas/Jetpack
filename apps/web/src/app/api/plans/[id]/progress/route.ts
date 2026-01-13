import * as fs from 'fs/promises';
import * as path from 'path';
import { Plan, PlanProgressEvent } from '@jetpack/shared';

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

interface TaskStatus {
  id: string;
  status: string;
  assignedAgent?: string;
  claimedBy?: string;
  startedAt?: string;
  completedAt?: string;
}

async function getTaskStatuses(): Promise<Map<string, TaskStatus>> {
  const tasksFile = path.join(getBeadsDir(), 'tasks.jsonl');
  const statuses = new Map<string, TaskStatus>();

  try {
    const content = await fs.readFile(tasksFile, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const task = JSON.parse(line);
        statuses.set(task.id, {
          id: task.id,
          status: task.status,
          assignedAgent: task.assignedAgent,
          claimedBy: task.claimedBy,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
        });
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // File doesn't exist yet
  }

  return statuses;
}

/**
 * GET /api/plans/[id]/progress - SSE stream of plan progress updates
 *
 * Streams PlanProgressEvent objects as the plan executes.
 * Polls task statuses and emits events when changes are detected.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const plan = await getPlan(id);

  if (!plan) {
    return new Response(JSON.stringify({ error: 'Plan not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  let isRunning = true;

  // Track previous task statuses to detect changes
  const previousStatuses = new Map<string, string>();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      const initEvent: PlanProgressEvent = {
        planId: id,
        itemId: '',
        status: 'converted',
        timestamp: new Date().toISOString(),
      };
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify(initEvent)}\n\n`)
      );

      // Poll for updates
      const pollInterval = setInterval(async () => {
        if (!isRunning) {
          clearInterval(pollInterval);
          return;
        }

        try {
          // Re-fetch plan to get latest state
          const currentPlan = await getPlan(id);
          if (!currentPlan) {
            clearInterval(pollInterval);
            controller.close();
            return;
          }

          // Get current task statuses
          const taskStatuses = await getTaskStatuses();

          // Check each plan item that has been converted to a task
          const checkItems = (items: typeof currentPlan.items) => {
            for (const item of items) {
              if (item.taskId) {
                const taskStatus = taskStatuses.get(item.taskId);
                const previousStatus = previousStatuses.get(item.id);

                if (taskStatus && taskStatus.status !== previousStatus) {
                  // Status changed - emit event
                  const event: PlanProgressEvent = {
                    planId: id,
                    itemId: item.id,
                    taskId: item.taskId,
                    status: mapTaskStatus(taskStatus.status),
                    agentId: taskStatus.claimedBy || taskStatus.assignedAgent,
                    timestamp: new Date().toISOString(),
                  };

                  controller.enqueue(
                    encoder.encode(`event: progress\ndata: ${JSON.stringify(event)}\n\n`)
                  );

                  previousStatuses.set(item.id, taskStatus.status);
                }
              }

              // Check children
              if (item.children) {
                checkItems(item.children);
              }
            }
          };

          checkItems(currentPlan.items);

          // Check if plan is complete
          const allComplete = isAllComplete(currentPlan);
          if (allComplete) {
            const completeEvent: PlanProgressEvent = {
              planId: id,
              itemId: '',
              status: 'completed',
              timestamp: new Date().toISOString(),
            };
            controller.enqueue(
              encoder.encode(`event: complete\ndata: ${JSON.stringify(completeEvent)}\n\n`)
            );
            clearInterval(pollInterval);
            controller.close();
          }
        } catch (error) {
          console.error('Progress polling error:', error);
        }
      }, 2000); // Poll every 2 seconds

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        isRunning = false;
        clearInterval(pollInterval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

function mapTaskStatus(
  taskStatus: string
): PlanProgressEvent['status'] {
  switch (taskStatus) {
    case 'pending':
    case 'ready':
    case 'claimed':
      // Task is queued/claimed but not yet started
      return 'converted';
    case 'in_progress':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'converted';
  }
}

function isAllComplete(plan: Plan): boolean {
  const checkItems = (items: typeof plan.items): boolean => {
    for (const item of items) {
      if (item.taskId) {
        if (item.status !== 'completed' && item.status !== 'failed') {
          return false;
        }
      }
      if (item.children && !checkItems(item.children)) {
        return false;
      }
    }
    return true;
  };

  // Only check if there are any converted items
  const hasConvertedItems = plan.items.some(
    item => item.taskId || item.status === 'converted'
  );

  if (!hasConvertedItems) {
    return false; // Nothing to complete yet
  }

  return checkItems(plan.items);
}
