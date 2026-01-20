/**
 * @jetpack-agent/quality
 *
 * Quality metrics collection and regression detection for Jetpack Swarm
 */

export {
  QualityCollector,
  QualityManager,
  type QualityCollectorConfig,
  type CommandResult,
  type QualityMetrics,
  type QualityGateResult,
} from './QualityCollector.js';

// Re-export quality types from data layer
export type {
  QualitySnapshot,
  QualitySnapshotCreate,
  QualityBaseline,
  Regression,
} from '@jetpack-agent/data';
