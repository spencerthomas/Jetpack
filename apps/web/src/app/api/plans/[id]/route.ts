import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  Plan,
  PlanItem,
  calculatePlanStats,
  updatePlanItem,
} from '@jetpack/shared';
import { PlanParser } from '@jetpack/orchestrator';

// Get working directory from environment variable
function getWorkDir(): string {
  return process.env.JETPACK_WORK_DIR || path.join(process.cwd(), '../..');
}

function getPlansDir(): string {
  return path.join(getWorkDir(), '.jetpack', 'plans');
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

/**
 * GET /api/plans/[id] - Get a single plan with stats
 * Query params: format=markdown (optional, returns markdown instead of JSON)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const plan = await getPlan(id);

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const url = new URL(request.url);
    const format = url.searchParams.get('format');

    if (format === 'markdown') {
      const markdown = PlanParser.toMarkdown(plan);
      return new Response(markdown, {
        headers: { 'Content-Type': 'text/markdown' },
      });
    }

    const stats = calculatePlanStats(plan);
    return NextResponse.json({ plan: { ...plan, stats } });
  } catch (error) {
    console.error('Failed to get plan:', error);
    return NextResponse.json({ error: 'Failed to get plan' }, { status: 500 });
  }
}

/**
 * PATCH /api/plans/[id] - Update a plan
 * Body: { title, description, items, status, tags, isTemplate }
 *
 * For updating a single item, use:
 * Body: { itemId, itemUpdates: { status, taskId, assignedAgent, ... } }
 */
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

    // Check if this is an item update
    if (body.itemId && body.itemUpdates) {
      const { itemId, itemUpdates } = body;
      plan.items = updatePlanItem(plan.items, itemId, itemUpdates);
      await savePlan(plan);
      const stats = calculatePlanStats(plan);
      return NextResponse.json({ plan: { ...plan, stats } });
    }

    // Otherwise, update plan-level fields
    const { title, description, items, status, tags, isTemplate } = body;

    if (title !== undefined) plan.title = title;
    if (description !== undefined) plan.description = description;
    if (items !== undefined) {
      plan.items = items;
      // Recalculate estimate
      let total = 0;
      function sum(items: PlanItem[]) {
        for (const item of items) {
          total += item.estimatedMinutes || 0;
          if (item.children) sum(item.children);
        }
      }
      sum(items);
      plan.estimatedTotalMinutes = total;
    }
    if (status !== undefined) plan.status = status;
    if (tags !== undefined) plan.tags = tags;
    if (isTemplate !== undefined) plan.isTemplate = isTemplate;

    await savePlan(plan);

    const stats = calculatePlanStats(plan);
    return NextResponse.json({ plan: { ...plan, stats } });
  } catch (error) {
    console.error('Failed to update plan:', error);
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
  }
}

/**
 * DELETE /api/plans/[id] - Delete a plan
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const filePath = path.join(getPlansDir(), `${id}.json`);

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
