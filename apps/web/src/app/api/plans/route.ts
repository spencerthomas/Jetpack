import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  Plan,
  PlanItem,
  PlanStatus,
  generatePlanId,
  generatePlanItemId,
  calculatePlanStats,
} from '@jetpack-agent/shared';
import { PlanParser } from '@jetpack-agent/orchestrator';

// Get working directory from environment variable
function getWorkDir(): string {
  return process.env.JETPACK_WORK_DIR || path.join(process.cwd(), '../..');
}

function getPlansDir(): string {
  return path.join(getWorkDir(), '.jetpack', 'plans');
}

async function ensurePlansDir() {
  await fs.mkdir(getPlansDir(), { recursive: true });
}

/**
 * GET /api/plans - List all plans with optional filtering
 * Query params: status, isTemplate, tags
 */
export async function GET(request: Request) {
  try {
    await ensurePlansDir();

    const url = new URL(request.url);
    const status = url.searchParams.get('status') as PlanStatus | null;
    const isTemplate = url.searchParams.get('isTemplate');
    const tags = url.searchParams.get('tags')?.split(',').filter(Boolean);

    const plansDir = getPlansDir();
    const files = await fs.readdir(plansDir);
    const plans: (Plan & { stats: ReturnType<typeof calculatePlanStats> })[] = [];

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
        if (tags && tags.length > 0) {
          const hasAllTags = tags.every(tag => plan.tags.includes(tag));
          if (!hasAllTags) continue;
        }

        // Add computed stats
        const stats = calculatePlanStats(plan);
        plans.push({ ...plan, stats });
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

/**
 * POST /api/plans - Create a new plan
 * Body: { title, description, userRequest, items, tags, isTemplate, markdown }
 *
 * If 'markdown' is provided, parses it to create the plan structure.
 * Otherwise, uses 'items' directly.
 */
export async function POST(request: Request) {
  try {
    await ensurePlansDir();

    const body = await request.json();
    const { title, description, userRequest, items, tags, isTemplate, markdown } = body;

    let plan: Plan;

    if (markdown) {
      // Parse markdown to create plan
      plan = PlanParser.parse(markdown, userRequest || title);
      // Override with provided values
      if (title) plan.title = title;
      if (description) plan.description = description;
      if (tags) plan.tags = tags;
      if (isTemplate !== undefined) plan.isTemplate = isTemplate;
    } else {
      // Create from structured input
      if (!title || !userRequest) {
        return NextResponse.json(
          { error: 'title and userRequest are required (or provide markdown)' },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();

      // Generate IDs for items if not provided
      const planItems: PlanItem[] = (items || []).map((item: Partial<PlanItem>) => ({
        id: item.id || generatePlanItemId(),
        title: item.title || '',
        description: item.description,
        status: item.status || 'pending',
        priority: item.priority || 'medium',
        skills: item.skills || [],
        estimatedMinutes: item.estimatedMinutes,
        dependencies: item.dependencies || [],
        children: item.children?.map((child: Partial<PlanItem>) => ({
          id: child.id || generatePlanItemId(),
          title: child.title || '',
          description: child.description,
          status: child.status || 'pending',
          priority: child.priority || 'medium',
          skills: child.skills || [],
          estimatedMinutes: child.estimatedMinutes,
          dependencies: child.dependencies || [],
        })),
      }));

      // Calculate total estimate
      let estimatedTotalMinutes = 0;
      function sumEstimates(items: PlanItem[]) {
        for (const item of items) {
          estimatedTotalMinutes += item.estimatedMinutes || 0;
          if (item.children) sumEstimates(item.children);
        }
      }
      sumEstimates(planItems);

      plan = {
        id: generatePlanId(),
        title,
        description,
        userRequest,
        status: 'draft',
        items: planItems,
        createdAt: now,
        updatedAt: now,
        estimatedTotalMinutes,
        tags: tags || [],
        isTemplate: isTemplate || false,
        source: 'manual',
      };
    }

    // Save plan
    const filePath = path.join(getPlansDir(), `${plan.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(plan, null, 2));

    // Return with stats
    const stats = calculatePlanStats(plan);
    return NextResponse.json({ plan: { ...plan, stats } });
  } catch (error) {
    console.error('Failed to create plan:', error);
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 });
  }
}
