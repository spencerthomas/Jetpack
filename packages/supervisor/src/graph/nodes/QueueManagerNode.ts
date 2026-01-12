import { Logger } from '@jetpack/shared';
import { BeadsAdapter } from '@jetpack/beads-adapter';
import { SupervisorState, QueueThresholds } from '../state';

export interface QueueManagerNodeConfig {
  beads: BeadsAdapter;
}

export interface QueueDecision {
  shouldGenerateTasks: boolean;
  targetCount: number;
  reason: string;
}

/**
 * QueueManagerNode monitors the task queue depth and decides when
 * to trigger task generation based on watermark thresholds.
 *
 * Watermark-based replenishment:
 * - LOW_WATERMARK (default 2): Trigger generation when below
 * - HIGH_WATERMARK (default 8): Target queue size
 * - MAX_WATERMARK (default 15): Never exceed
 */
export async function createQueueManagerNode(config: QueueManagerNodeConfig) {
  const logger = new Logger('QueueManagerNode');
  const { beads } = config;

  return async (state: SupervisorState): Promise<Partial<SupervisorState>> => {
    // Skip if not in continuous mode
    if (!state.continuousMode) {
      logger.debug('Skipping: not in continuous mode');
      return {};
    }

    const thresholds = state.queueThresholds;

    // Get current pending task count
    const allTasks = await beads.listTasks();
    const pendingTasks = allTasks.filter(t =>
      t.status === 'pending' || t.status === 'ready'
    );
    const pendingCount = pendingTasks.length;

    logger.debug(`Queue status: ${pendingCount} pending (watermarks: low=${thresholds.lowWatermark}, high=${thresholds.highWatermark})`);

    // Check cooldown
    const now = Date.now();
    const lastGen = state.lastGenerationTime?.getTime() ?? 0;
    const cooldownActive = (now - lastGen) < thresholds.cooldownMs;

    if (cooldownActive) {
      const remaining = thresholds.cooldownMs - (now - lastGen);
      logger.debug(`Cooldown active: ${Math.ceil(remaining / 1000)}s remaining`);
    }

    // Decide whether to generate tasks
    const decision = decideTaskGeneration(pendingCount, thresholds, cooldownActive);

    logger.info(`Queue decision: ${decision.reason}` +
      (decision.shouldGenerateTasks ? ` (target: ${decision.targetCount} new tasks)` : ''));

    return {
      pendingTaskCount: pendingCount,
    };
  };
}

/**
 * Determines whether to generate more tasks based on queue state
 */
export function decideTaskGeneration(
  pendingCount: number,
  thresholds: QueueThresholds,
  cooldownActive: boolean
): QueueDecision {
  // Don't generate if in cooldown
  if (cooldownActive) {
    return {
      shouldGenerateTasks: false,
      targetCount: 0,
      reason: 'Generation cooldown active',
    };
  }

  // Don't generate if above high watermark
  if (pendingCount >= thresholds.highWatermark) {
    return {
      shouldGenerateTasks: false,
      targetCount: 0,
      reason: `Queue at ${pendingCount}, above high watermark (${thresholds.highWatermark})`,
    };
  }

  // Generate if below low watermark
  if (pendingCount < thresholds.lowWatermark) {
    const targetCount = Math.min(
      thresholds.highWatermark - pendingCount,
      thresholds.maxWatermark - pendingCount
    );
    return {
      shouldGenerateTasks: true,
      targetCount,
      reason: `Queue at ${pendingCount}, below low watermark (${thresholds.lowWatermark})`,
    };
  }

  // Between low and high - could generate proactively but not required
  return {
    shouldGenerateTasks: false,
    targetCount: 0,
    reason: `Queue at ${pendingCount}, between watermarks (stable)`,
  };
}

/**
 * Check if we should generate tasks (used by graph routing)
 */
export function shouldGenerateMoreTasks(state: SupervisorState): boolean {
  if (!state.continuousMode || !state.objective) {
    return false;
  }

  const thresholds = state.queueThresholds;

  // Check cooldown
  const now = Date.now();
  const lastGen = state.lastGenerationTime?.getTime() ?? 0;
  if ((now - lastGen) < thresholds.cooldownMs) {
    return false;
  }

  // Check watermark
  return state.pendingTaskCount < thresholds.lowWatermark;
}
