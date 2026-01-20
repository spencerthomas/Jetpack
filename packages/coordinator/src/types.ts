import { z } from 'zod';
import type { Task, Agent, AgentType, TaskPriority } from '@jetpack-agent/data';
import type { ModelAdapter, AgentHarness } from '@jetpack-agent/agent-harness';

/**
 * Agent spawning configuration
 */
export interface AgentSpawnConfig {
  /** Unique agent ID (auto-generated if not provided) */
  id?: string;
  /** Display name */
  name: string;
  /** Agent type */
  type: AgentType;
  /** Model adapter to use */
  adapter: ModelAdapter;
  /** Initial skills */
  skills?: string[];
  /** Working directory */
  workDir: string;
  /** Maximum task duration (minutes) */
  maxTaskMinutes?: number;
  /** Custom prompt template */
  promptTemplate?: import('@jetpack-agent/agent-harness').PromptTemplate;
}

/**
 * Coordinator configuration
 */
export interface CoordinatorConfig {
  /** Working directory for the swarm */
  workDir: string;
  /** Maximum number of concurrent agents */
  maxAgents?: number;
  /** Heartbeat timeout before agent considered dead (ms) */
  heartbeatTimeoutMs?: number;
  /** Work distribution interval (ms) */
  distributionIntervalMs?: number;
  /** Enable automatic work distribution */
  autoDistribute?: boolean;
  /** Enable agent health monitoring */
  monitorHealth?: boolean;
  /** Stalled agent detection timeout (ms) - agent busy but no progress */
  stalledTimeoutMs?: number;
  /** Task claiming strategy */
  claimStrategy?: ClaimStrategy;
  /** Callback when agent crashes */
  onAgentCrash?: (agentId: string, error: Error) => void;
  /** Callback when task is orphaned (agent died mid-task) */
  onTaskOrphaned?: (taskId: string, agentId: string) => void;
  /** Callback for coordinator events */
  onEvent?: CoordinatorEventCallback;
}

/**
 * Task claiming strategy
 */
export type ClaimStrategy =
  | 'first-fit' // First agent with matching skills claims
  | 'best-fit' // Agent with best skill match claims
  | 'round-robin' // Rotate among available agents
  | 'load-balanced'; // Balance by current workload

/**
 * Coordinator events
 */
export type CoordinatorEvent =
  | { type: 'agent_spawned'; agentId: string; name: string }
  | { type: 'agent_stopped'; agentId: string; reason: string }
  | { type: 'agent_crashed'; agentId: string; error: string }
  | { type: 'agent_recovered'; agentId: string }
  | { type: 'task_distributed'; taskId: string; agentId: string }
  | { type: 'task_claimed'; taskId: string; agentId: string }
  | { type: 'task_completed'; taskId: string; agentId: string }
  | { type: 'task_failed'; taskId: string; agentId: string; error?: string }
  | { type: 'task_orphaned'; taskId: string; previousAgent: string }
  | { type: 'task_requeued'; taskId: string; reason: string }
  | { type: 'health_check'; healthyAgents: number; totalAgents: number }
  | { type: 'distribution_cycle'; tasksDistributed: number; pendingTasks: number }
  | { type: 'coordinator_started' }
  | { type: 'coordinator_stopped'; reason: string };

export type CoordinatorEventCallback = (event: CoordinatorEvent) => void;

/**
 * Agent health status
 */
export interface AgentHealth {
  agentId: string;
  status: 'healthy' | 'degraded' | 'stalled' | 'dead';
  lastHeartbeat: Date | null;
  currentTaskId: string | null;
  taskStartedAt: Date | null;
  taskProgress: number;
  consecutiveFailures: number;
  uptimeMs: number;
}

/**
 * Swarm statistics
 */
export interface SwarmStats {
  /** Total agents (all states) */
  totalAgents: number;
  /** Agents actively working */
  busyAgents: number;
  /** Agents available for work */
  idleAgents: number;
  /** Agents in error/offline state */
  unhealthyAgents: number;
  /** Tasks waiting to be claimed */
  pendingTasks: number;
  /** Tasks currently being worked on */
  inProgressTasks: number;
  /** Tasks completed in this session */
  completedTasks: number;
  /** Tasks failed in this session */
  failedTasks: number;
  /** Average task duration (ms) */
  avgTaskDurationMs: number;
  /** Uptime since coordinator started */
  uptimeMs: number;
  /** Tasks distributed per minute (moving average) */
  throughputPerMinute: number;
}

/**
 * Work distribution result
 */
export interface DistributionResult {
  /** Number of tasks distributed */
  distributed: number;
  /** Tasks that couldn't be distributed (no matching agents) */
  unmatched: string[];
  /** Agents that received tasks */
  assignments: Array<{
    taskId: string;
    agentId: string;
    skillMatch: number;
  }>;
}

/**
 * Agent assignment with reasoning
 */
export interface AgentAssignment {
  agentId: string;
  taskId: string;
  skillMatchScore: number;
  reason: string;
  alternativesConsidered: number;
}

/**
 * Managed agent instance
 */
export interface ManagedAgent {
  harness: AgentHarness;
  config: AgentSpawnConfig;
  spawnedAt: Date;
  health: AgentHealth;
}

/**
 * Zod schemas for validation
 */
export const AgentSpawnConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  type: z.enum(['claude-code', 'codex', 'gemini', 'browser', 'custom']),
  skills: z.array(z.string()).optional(),
  workDir: z.string(),
  maxTaskMinutes: z.number().positive().optional(),
});

export const CoordinatorConfigSchema = z.object({
  workDir: z.string(),
  maxAgents: z.number().positive().optional(),
  heartbeatTimeoutMs: z.number().positive().optional(),
  distributionIntervalMs: z.number().positive().optional(),
  autoDistribute: z.boolean().optional(),
  monitorHealth: z.boolean().optional(),
  stalledTimeoutMs: z.number().positive().optional(),
  claimStrategy: z
    .enum(['first-fit', 'best-fit', 'round-robin', 'load-balanced'])
    .optional(),
});
