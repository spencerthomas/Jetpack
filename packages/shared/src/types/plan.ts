import { z } from 'zod';
import { AgentSkillSchema } from './agent';

// Plan item status - tracks lifecycle from planning to execution
export const PlanItemStatusSchema = z.enum([
  'pending',      // Not yet converted to task
  'converted',    // Converted to Beads task, awaiting agent
  'in_progress',  // Agent is working on it
  'completed',    // Successfully completed
  'failed',       // Failed during execution
  'skipped',      // User skipped this item
]);
export type PlanItemStatus = z.infer<typeof PlanItemStatusSchema>;

// Priority levels
export const PlanPrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type PlanPriority = z.infer<typeof PlanPrioritySchema>;

// Plan status - overall plan lifecycle
export const PlanStatusSchema = z.enum([
  'draft',        // Being edited
  'approved',     // Approved, ready to execute
  'executing',    // Tasks being executed by agents
  'completed',    // All items completed
  'failed',       // Execution failed
  'paused',       // Execution paused by user
]);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

// Individual plan item (can be nested)
export const PlanItemSchema: z.ZodType<PlanItem> = z.lazy(() =>
  z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    status: PlanItemStatusSchema,
    priority: PlanPrioritySchema,
    skills: z.array(AgentSkillSchema),
    estimatedMinutes: z.number().optional(),
    dependencies: z.array(z.string()), // IDs of other plan items
    children: z.array(PlanItemSchema).optional(), // Nested sub-items

    // Execution tracking (populated when converted/executing)
    taskId: z.string().optional(),      // Linked Beads task ID
    assignedAgent: z.string().optional(), // Agent currently working on it
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
    actualMinutes: z.number().optional(),
    error: z.string().optional(),
  })
);

export interface PlanItem {
  id: string;
  title: string;
  description?: string;
  status: PlanItemStatus;
  priority: PlanPriority;
  skills: string[];
  estimatedMinutes?: number;
  dependencies: string[];
  children?: PlanItem[];

  // Execution tracking
  taskId?: string;
  assignedAgent?: string;
  startedAt?: string;
  completedAt?: string;
  actualMinutes?: number;
  error?: string;
}

// Full plan structure
export const PlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  userRequest: z.string(), // Original user request that generated this plan
  status: PlanStatusSchema,
  items: z.array(PlanItemSchema),

  // Metadata
  createdAt: z.string(),
  updatedAt: z.string(),
  estimatedTotalMinutes: z.number().optional(),
  tags: z.array(z.string()),
  isTemplate: z.boolean(),

  // Source tracking
  source: z.enum(['supervisor', 'manual', 'template', 'import']).optional(),
  sourceMarkdown: z.string().optional(), // Original markdown if parsed
});

export interface Plan {
  id: string;
  title: string;
  description?: string;
  userRequest: string;
  status: PlanStatus;
  items: PlanItem[];

  createdAt: string;
  updatedAt: string;
  estimatedTotalMinutes?: number;
  tags: string[];
  isTemplate: boolean;

  source?: 'supervisor' | 'manual' | 'template' | 'import';
  sourceMarkdown?: string;
}

// Progress event for real-time updates
export const PlanProgressEventSchema = z.object({
  planId: z.string(),
  itemId: z.string(),
  taskId: z.string().optional(),
  status: PlanItemStatusSchema,
  agentId: z.string().optional(),
  agentName: z.string().optional(),
  elapsedMs: z.number().optional(),
  message: z.string().optional(),
  timestamp: z.string(),
});

export interface PlanProgressEvent {
  planId: string;
  itemId: string;
  taskId?: string;
  status: PlanItemStatus;
  agentId?: string;
  agentName?: string;
  elapsedMs?: number;
  message?: string;
  timestamp: string;
}

// Plan statistics
export interface PlanStats {
  totalItems: number;
  pendingItems: number;
  convertedItems: number;
  inProgressItems: number;
  completedItems: number;
  failedItems: number;
  skippedItems: number;
  completionPercentage: number;
  estimatedRemainingMinutes: number;
}

// Helper to calculate plan stats
export function calculatePlanStats(plan: Plan): PlanStats {
  const flatItems = flattenPlanItems(plan.items);

  const stats: PlanStats = {
    totalItems: flatItems.length,
    pendingItems: 0,
    convertedItems: 0,
    inProgressItems: 0,
    completedItems: 0,
    failedItems: 0,
    skippedItems: 0,
    completionPercentage: 0,
    estimatedRemainingMinutes: 0,
  };

  for (const item of flatItems) {
    switch (item.status) {
      case 'pending': stats.pendingItems++; break;
      case 'converted': stats.convertedItems++; break;
      case 'in_progress': stats.inProgressItems++; break;
      case 'completed': stats.completedItems++; break;
      case 'failed': stats.failedItems++; break;
      case 'skipped': stats.skippedItems++; break;
    }

    if (item.status !== 'completed' && item.status !== 'skipped' && item.estimatedMinutes) {
      stats.estimatedRemainingMinutes += item.estimatedMinutes;
    }
  }

  const actionableItems = stats.totalItems - stats.skippedItems;
  if (actionableItems > 0) {
    stats.completionPercentage = Math.round((stats.completedItems / actionableItems) * 100);
  }

  return stats;
}

// Flatten nested items into a single array
export function flattenPlanItems(items: PlanItem[]): PlanItem[] {
  const result: PlanItem[] = [];

  function traverse(items: PlanItem[]) {
    for (const item of items) {
      result.push(item);
      if (item.children && item.children.length > 0) {
        traverse(item.children);
      }
    }
  }

  traverse(items);
  return result;
}

// Find an item by ID in nested structure
export function findPlanItem(items: PlanItem[], itemId: string): PlanItem | null {
  for (const item of items) {
    if (item.id === itemId) return item;
    if (item.children) {
      const found = findPlanItem(item.children, itemId);
      if (found) return found;
    }
  }
  return null;
}

// Update an item in nested structure (immutable)
export function updatePlanItem(
  items: PlanItem[],
  itemId: string,
  updates: Partial<PlanItem>
): PlanItem[] {
  return items.map(item => {
    if (item.id === itemId) {
      return { ...item, ...updates };
    }
    if (item.children) {
      return {
        ...item,
        children: updatePlanItem(item.children, itemId, updates),
      };
    }
    return item;
  });
}

// Generate a unique plan item ID
export function generatePlanItemId(): string {
  const chars = '0123456789abcdef';
  let id = 'pi-';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Generate a unique plan ID
export function generatePlanId(): string {
  const chars = '0123456789abcdef';
  let id = 'plan-';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}
