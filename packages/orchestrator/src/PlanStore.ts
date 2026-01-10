import * as fs from 'fs/promises';
import * as path from 'path';
import { AgentSkill, Logger } from '@jetpack/shared';

export type PlanStatus = 'draft' | 'approved' | 'executing' | 'completed' | 'failed';

export interface PlannedTask {
  id: string;
  title: string;
  description: string;
  requiredSkills: AgentSkill[];
  estimatedMinutes: number;
  dependsOn: string[]; // Task IDs
}

export interface ExecutionRecord {
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

export interface Plan {
  id: string;
  name: string;
  description?: string;
  userRequest: string;
  status: PlanStatus;
  plannedTasks: PlannedTask[];
  createdAt: string;
  updatedAt: string;
  estimatedDuration?: number;
  executionHistory: ExecutionRecord[];
  tags: string[];
  isTemplate: boolean;
}

export interface CreatePlanInput {
  name: string;
  description?: string;
  userRequest: string;
  plannedTasks: PlannedTask[];
  tags?: string[];
  isTemplate?: boolean;
}

export interface UpdatePlanInput {
  name?: string;
  description?: string;
  plannedTasks?: PlannedTask[];
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

  private generatePlanId(): string {
    const chars = '0123456789abcdef';
    let id = 'plan-';
    for (let i = 0; i < 8; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }

  private getPlanPath(planId: string): string {
    return path.join(this.plansDir, `${planId}.json`);
  }

  async create(input: CreatePlanInput): Promise<Plan> {
    const now = new Date().toISOString();
    const plan: Plan = {
      id: this.generatePlanId(),
      name: input.name,
      description: input.description,
      userRequest: input.userRequest,
      status: 'draft',
      plannedTasks: input.plannedTasks,
      createdAt: now,
      updatedAt: now,
      estimatedDuration: input.plannedTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0),
      executionHistory: [],
      tags: input.tags || [],
      isTemplate: input.isTemplate || false,
    };

    await this.save(plan);
    this.logger.info(`Created plan: ${plan.id} - ${plan.name}`);
    return plan;
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

    if (input.name !== undefined) plan.name = input.name;
    if (input.description !== undefined) plan.description = input.description;
    if (input.plannedTasks !== undefined) {
      plan.plannedTasks = input.plannedTasks;
      plan.estimatedDuration = input.plannedTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
    }
    if (input.status !== undefined) plan.status = input.status;
    if (input.tags !== undefined) plan.tags = input.tags;
    if (input.isTemplate !== undefined) plan.isTemplate = input.isTemplate;

    await this.save(plan);
    this.logger.info(`Updated plan: ${planId}`);
    return plan;
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

  async addExecutionRecord(planId: string, record: ExecutionRecord): Promise<Plan | null> {
    const plan = await this.get(planId);
    if (!plan) return null;

    plan.executionHistory.push(record);
    plan.status = 'executing';
    await this.save(plan);
    return plan;
  }

  async updateExecutionRecord(
    planId: string,
    executionId: string,
    updates: Partial<ExecutionRecord>
  ): Promise<Plan | null> {
    const plan = await this.get(planId);
    if (!plan) return null;

    const record = plan.executionHistory.find(r => r.id === executionId);
    if (!record) return null;

    Object.assign(record, updates);

    if (updates.status === 'completed') {
      plan.status = 'completed';
    } else if (updates.status === 'failed') {
      plan.status = 'failed';
    }

    await this.save(plan);
    return plan;
  }

  async clone(planId: string, newName: string): Promise<Plan | null> {
    const original = await this.get(planId);
    if (!original) return null;

    return this.create({
      name: newName,
      description: original.description,
      userRequest: original.userRequest,
      plannedTasks: original.plannedTasks.map(t => ({ ...t })),
      tags: original.tags,
      isTemplate: false,
    });
  }
}
