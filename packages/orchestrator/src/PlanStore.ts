import * as fs from 'fs/promises';
import * as path from 'path';
import {
  Logger,
  Plan,
  PlanItem,
  PlanStatus,
  PlanProgressEvent,
  generatePlanId,
  generatePlanItemId,
  findPlanItem,
  updatePlanItem,
  calculatePlanStats,
} from '@jetpack/shared';
import { PlanParser } from './PlanParser';

// Re-export types for convenience
export type { Plan, PlanItem, PlanStatus, PlanProgressEvent };

export interface CreatePlanInput {
  title: string;
  description?: string;
  userRequest: string;
  items: PlanItem[];
  tags?: string[];
  isTemplate?: boolean;
  source?: 'supervisor' | 'manual' | 'template' | 'import';
  sourceMarkdown?: string;
}

export interface UpdatePlanInput {
  title?: string;
  description?: string;
  items?: PlanItem[];
  status?: PlanStatus;
  tags?: string[];
  isTemplate?: boolean;
}

export class PlanStore {
  private logger: Logger;
  private plansDir: string;

  constructor(workDir: string) {
    this.logger = new Logger('PlanStore');
    this.plansDir = path.join(workDir, '.jetpack', 'plans');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.plansDir, { recursive: true });
    this.logger.info('PlanStore initialized');
  }

  private getPlanPath(planId: string): string {
    return path.join(this.plansDir, `${planId}.json`);
  }

  /**
   * Create a new plan from structured input
   */
  async create(input: CreatePlanInput): Promise<Plan> {
    const now = new Date().toISOString();

    // Calculate total estimate from items
    let estimatedTotalMinutes = 0;
    function sumEstimates(items: PlanItem[]) {
      for (const item of items) {
        estimatedTotalMinutes += item.estimatedMinutes || 0;
        if (item.children) sumEstimates(item.children);
      }
    }
    sumEstimates(input.items);

    const plan: Plan = {
      id: generatePlanId(),
      title: input.title,
      description: input.description,
      userRequest: input.userRequest,
      status: 'draft',
      items: input.items,
      createdAt: now,
      updatedAt: now,
      estimatedTotalMinutes,
      tags: input.tags || [],
      isTemplate: input.isTemplate || false,
      source: input.source || 'manual',
      sourceMarkdown: input.sourceMarkdown,
    };

    await this.save(plan);
    this.logger.info(`Created plan: ${plan.id} - ${plan.title}`);
    return plan;
  }

  /**
   * Create a plan from markdown text
   */
  async createFromMarkdown(markdown: string, userRequest?: string): Promise<Plan> {
    const plan = PlanParser.parse(markdown, userRequest);
    await this.save(plan);
    this.logger.info(`Created plan from markdown: ${plan.id} - ${plan.title}`);
    return plan;
  }

  /**
   * Export a plan to markdown format
   */
  toMarkdown(plan: Plan): string {
    return PlanParser.toMarkdown(plan);
  }

  async save(plan: Plan): Promise<void> {
    plan.updatedAt = new Date().toISOString();
    const filePath = this.getPlanPath(plan.id);
    await fs.writeFile(filePath, JSON.stringify(plan, null, 2));
  }

  async get(planId: string): Promise<Plan | null> {
    try {
      const filePath = this.getPlanPath(planId);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as Plan;
    } catch (error) {
      return null;
    }
  }

  async update(planId: string, input: UpdatePlanInput): Promise<Plan | null> {
    const plan = await this.get(planId);
    if (!plan) {
      return null;
    }

    if (input.title !== undefined) plan.title = input.title;
    if (input.description !== undefined) plan.description = input.description;
    if (input.items !== undefined) {
      plan.items = input.items;
      // Recalculate estimate
      let total = 0;
      function sum(items: PlanItem[]) {
        for (const item of items) {
          total += item.estimatedMinutes || 0;
          if (item.children) sum(item.children);
        }
      }
      sum(input.items);
      plan.estimatedTotalMinutes = total;
    }
    if (input.status !== undefined) plan.status = input.status;
    if (input.tags !== undefined) plan.tags = input.tags;
    if (input.isTemplate !== undefined) plan.isTemplate = input.isTemplate;

    await this.save(plan);
    this.logger.info(`Updated plan: ${planId}`);
    return plan;
  }

  /**
   * Update a single item within a plan
   */
  async updateItem(
    planId: string,
    itemId: string,
    updates: Partial<PlanItem>
  ): Promise<Plan | null> {
    const plan = await this.get(planId);
    if (!plan) return null;

    plan.items = updatePlanItem(plan.items, itemId, updates);
    await this.save(plan);
    this.logger.info(`Updated item ${itemId} in plan ${planId}`);
    return plan;
  }

  /**
   * Get stats for a plan
   */
  async getStats(planId: string) {
    const plan = await this.get(planId);
    if (!plan) return null;
    return calculatePlanStats(plan);
  }

  async delete(planId: string): Promise<boolean> {
    try {
      const filePath = this.getPlanPath(planId);
      await fs.unlink(filePath);
      this.logger.info(`Deleted plan: ${planId}`);
      return true;
    } catch (error) {
      return false;
    }
  }

  async list(options?: {
    status?: PlanStatus;
    isTemplate?: boolean;
    tags?: string[];
  }): Promise<Plan[]> {
    try {
      const files = await fs.readdir(this.plansDir);
      const plans: Plan[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.plansDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const plan = JSON.parse(content) as Plan;

          // Apply filters
          if (options?.status && plan.status !== options.status) continue;
          if (options?.isTemplate !== undefined && plan.isTemplate !== options.isTemplate) continue;
          if (options?.tags && options.tags.length > 0) {
            const hasAllTags = options.tags.every(tag => plan.tags.includes(tag));
            if (!hasAllTags) continue;
          }

          plans.push(plan);
        } catch (err) {
          this.logger.warn(`Failed to parse plan file: ${file}`);
        }
      }

      // Sort by updatedAt descending
      plans.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      return plans;
    } catch (error) {
      return [];
    }
  }

  /**
   * Clone a plan with a new title
   */
  async clone(planId: string, newTitle: string): Promise<Plan | null> {
    const original = await this.get(planId);
    if (!original) return null;

    // Deep clone items and generate new IDs
    function cloneItems(items: PlanItem[]): PlanItem[] {
      return items.map(item => ({
        ...item,
        id: generatePlanItemId(),
        status: 'pending' as const,
        taskId: undefined,
        assignedAgent: undefined,
        startedAt: undefined,
        completedAt: undefined,
        actualMinutes: undefined,
        error: undefined,
        children: item.children ? cloneItems(item.children) : undefined,
      }));
    }

    return this.create({
      title: newTitle,
      description: original.description,
      userRequest: original.userRequest,
      items: cloneItems(original.items),
      tags: original.tags,
      isTemplate: false,
      source: 'template',
    });
  }

  /**
   * Find an item by ID within a plan
   */
  async findItem(planId: string, itemId: string): Promise<PlanItem | null> {
    const plan = await this.get(planId);
    if (!plan) return null;
    return findPlanItem(plan.items, itemId);
  }
}
