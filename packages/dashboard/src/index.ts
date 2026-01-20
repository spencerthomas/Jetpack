/**
 * @jetpack-agent/dashboard
 *
 * Dashboard data provider and observability for Jetpack Swarm
 */

export {
  DashboardProvider,
  type DashboardConfig,
  type DashboardEventType,
  type DashboardEvent,
  type DashboardMetrics,
  type AgentWithActivity,
} from './DashboardProvider.js';

// Re-export useful types from data layer
export type { SwarmStatus, Task, Agent } from '@jetpack-agent/data';
