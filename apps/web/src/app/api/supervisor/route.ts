import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

const JETPACK_DIR = path.join(process.cwd(), '../..', '.jetpack');
const SUPERVISOR_STATE_PATH = path.join(JETPACK_DIR, 'supervisor-state.json');
const SUPERVISOR_QUEUE_PATH = path.join(JETPACK_DIR, 'supervisor-queue.json');

// Supervisor state structure
interface SupervisorState {
  status: 'idle' | 'running' | 'completed' | 'error';
  currentRequest?: string;
  startedAt?: string;
  completedAt?: string;
  llmProvider?: string;
  llmModel?: string;
  iterations: number;
  tasksCreated: number;
  tasksCompleted: number;
  tasksFailed: number;
  conflicts: number;
  lastReport?: string;
  error?: string;
  history: SupervisorHistoryEntry[];
}

interface SupervisorHistoryEntry {
  id: string;
  request: string;
  status: 'completed' | 'failed';
  startedAt: string;
  completedAt: string;
  tasksCreated: number;
  tasksCompleted: number;
  tasksFailed: number;
  iterations: number;
}

// Queue request structure
interface SupervisorQueueRequest {
  id: string;
  request: string;
  priority: 'high' | 'normal' | 'low';
  requestedAt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  mode: 'execute' | 'plan';  // execute = create tasks immediately, plan = generate plan only
  planId?: string;  // If mode=plan, the created plan ID
  error?: string;
}

async function loadSupervisorState(): Promise<SupervisorState> {
  try {
    const content = await fs.readFile(SUPERVISOR_STATE_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {
      status: 'idle',
      iterations: 0,
      tasksCreated: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      conflicts: 0,
      history: [],
    };
  }
}

async function loadSupervisorQueue(): Promise<SupervisorQueueRequest[]> {
  try {
    const content = await fs.readFile(SUPERVISOR_QUEUE_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function saveSupervisorQueue(queue: SupervisorQueueRequest[]): Promise<void> {
  await fs.mkdir(JETPACK_DIR, { recursive: true });
  await fs.writeFile(SUPERVISOR_QUEUE_PATH, JSON.stringify(queue, null, 2));
}

/**
 * GET /api/supervisor - Get supervisor status and history
 */
export async function GET() {
  try {
    const [state, queue] = await Promise.all([
      loadSupervisorState(),
      loadSupervisorQueue(),
    ]);

    return NextResponse.json({
      ...state,
      queue: queue.filter(q => q.status === 'pending' || q.status === 'processing'),
      queueLength: queue.filter(q => q.status === 'pending').length,
    });
  } catch (error) {
    console.error('Error getting supervisor status:', error);
    return NextResponse.json(
      { error: 'Failed to get supervisor status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/supervisor - Send a request to the supervisor
 *
 * Body: {
 *   request: string;          // The user request to process
 *   priority?: 'high' | 'normal' | 'low';
 *   mode?: 'execute' | 'plan'; // execute = immediate task creation, plan = generate plan only
 * }
 *
 * When mode='plan':
 * - Generates a plan using the supervisor's PlannerNode
 * - Creates a Plan object that can be viewed/edited
 * - Returns the planId for navigation to /plans/[id]
 *
 * When mode='execute' (default):
 * - Queues the request for the orchestrator
 * - Tasks are created and assigned to agents
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.request || !body.request.trim()) {
      return NextResponse.json(
        { error: 'Request text is required' },
        { status: 400 }
      );
    }

    const mode = body.mode || 'execute';

    // If plan mode, generate plan immediately without queueing
    if (mode === 'plan') {
      return await generatePlan(body.request.trim());
    }

    // Create queue entry for execution mode
    const queueEntry: SupervisorQueueRequest = {
      id: `sup-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      request: body.request.trim(),
      priority: body.priority || 'normal',
      requestedAt: new Date().toISOString(),
      status: 'pending',
      mode: 'execute',
    };

    // Load and update queue
    const queue = await loadSupervisorQueue();
    queue.push(queueEntry);
    await saveSupervisorQueue(queue);

    return NextResponse.json({
      success: true,
      requestId: queueEntry.id,
      message: 'Request queued for supervisor. It will be processed when the orchestrator is running.',
    });
  } catch (error) {
    console.error('Error queuing supervisor request:', error);
    return NextResponse.json(
      { error: 'Failed to queue supervisor request' },
      { status: 500 }
    );
  }
}

/**
 * Generate a plan from a user request using the supervisor's planner
 */
async function generatePlan(userRequest: string) {
  try {
    // Import PlanParser and types
    const { PlanParser } = await import('@jetpack-agent/orchestrator');
    const { calculatePlanStats } = await import('@jetpack-agent/shared');

    // For now, generate a basic plan structure
    // In a full implementation, this would call the LLM-powered PlannerNode

    // Generate markdown plan (simplified - real impl would use LLM)
    const planMarkdown = generateBasicPlanMarkdown(userRequest);

    // Parse markdown to plan
    const plan = PlanParser.parse(planMarkdown, userRequest);

    // Save plan
    const plansDir = path.join(JETPACK_DIR, 'plans');
    await fs.mkdir(plansDir, { recursive: true });
    const planPath = path.join(plansDir, `${plan.id}.json`);
    await fs.writeFile(planPath, JSON.stringify(plan, null, 2));

    const stats = calculatePlanStats(plan);

    return NextResponse.json({
      success: true,
      mode: 'plan',
      planId: plan.id,
      plan: { ...plan, stats },
      message: 'Plan generated. Navigate to /plans/' + plan.id + ' to view and edit.',
    });
  } catch (error) {
    console.error('Error generating plan:', error);
    return NextResponse.json(
      { error: 'Failed to generate plan: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * Generate a basic plan markdown from a user request
 * This is a simplified version - the real implementation would use the LLM PlannerNode
 */
function generateBasicPlanMarkdown(userRequest: string): string {
  // Extract a title from the request
  const title = userRequest.length > 50
    ? userRequest.substring(0, 50) + '...'
    : userRequest;

  return `# Plan: ${title}

## Overview
${userRequest}

## Tasks

### 1. Analyze requirements [high] [backend]
Review the request and identify specific technical requirements.
- Dependencies: none
- Estimate: 15m

### 2. Design solution [high] [backend, typescript]
Create the technical design and identify files to modify.
- Dependencies: 1
- Estimate: 20m

### 3. Implement changes [high] [typescript, backend]
Make the necessary code changes to implement the solution.
- Dependencies: 2
- Estimate: 45m

### 4. Test implementation [medium] [testing]
Verify the implementation works correctly.
- Dependencies: 3
- Estimate: 15m

### 5. Documentation [low] [documentation]
Update documentation if needed.
- Dependencies: 4
- Estimate: 10m
`;
}

/**
 * DELETE /api/supervisor - Cancel pending requests
 */
export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const requestId = url.searchParams.get('id');

    const queue = await loadSupervisorQueue();

    if (requestId) {
      // Cancel specific request
      const index = queue.findIndex(q => q.id === requestId && q.status === 'pending');
      if (index === -1) {
        return NextResponse.json(
          { error: 'Request not found or already processing' },
          { status: 404 }
        );
      }
      queue.splice(index, 1);
    } else {
      // Clear all pending requests
      const pending = queue.filter(q => q.status === 'pending').length;
      const remaining = queue.filter(q => q.status !== 'pending');
      await saveSupervisorQueue(remaining);
      return NextResponse.json({
        success: true,
        cleared: pending,
      });
    }

    await saveSupervisorQueue(queue);

    return NextResponse.json({
      success: true,
      message: requestId ? 'Request cancelled' : 'All pending requests cleared',
    });
  } catch (error) {
    console.error('Error cancelling supervisor request:', error);
    return NextResponse.json(
      { error: 'Failed to cancel supervisor request' },
      { status: 500 }
    );
  }
}
