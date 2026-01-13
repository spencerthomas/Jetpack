import { describe, it, expect } from 'vitest';
import { decideTaskGeneration, shouldGenerateMoreTasks } from './QueueManagerNode';
import { QueueThresholds, SupervisorState } from '../state';

// Default thresholds for testing
const defaultThresholds: QueueThresholds = {
  lowWatermark: 2,
  highWatermark: 8,
  maxWatermark: 15,
  cooldownMs: 30000,
};

// Helper to create minimal state
const createState = (overrides: Partial<SupervisorState> = {}): SupervisorState => ({
  objective: null,
  plan: [],
  taskIds: [],
  taskAssignments: {},
  conflicts: [],
  reassignments: [],
  currentPhase: 'planning',
  error: null,
  isComplete: false,
  continuousMode: false,
  queueThresholds: defaultThresholds,
  pendingTaskCount: 0,
  lastGenerationTime: null,
  generationRound: 0,
  ...overrides,
});

describe('QueueManagerNode', () => {
  describe('decideTaskGeneration', () => {
    describe('cooldown behavior', () => {
      it('should not generate when cooldown is active', () => {
        const decision = decideTaskGeneration(0, defaultThresholds, true);

        expect(decision.shouldGenerateTasks).toBe(false);
        expect(decision.targetCount).toBe(0);
        expect(decision.reason).toContain('cooldown');
      });

      it('should consider generation when cooldown is inactive', () => {
        const decision = decideTaskGeneration(0, defaultThresholds, false);

        expect(decision.shouldGenerateTasks).toBe(true);
      });
    });

    describe('below low watermark', () => {
      it('should generate when queue is empty', () => {
        const decision = decideTaskGeneration(0, defaultThresholds, false);

        expect(decision.shouldGenerateTasks).toBe(true);
        expect(decision.targetCount).toBe(8); // highWatermark - 0
        expect(decision.reason).toContain('below low watermark');
      });

      it('should generate when queue is 1 (below low watermark of 2)', () => {
        const decision = decideTaskGeneration(1, defaultThresholds, false);

        expect(decision.shouldGenerateTasks).toBe(true);
        expect(decision.targetCount).toBe(7); // highWatermark - 1
      });

      it('should cap target at maxWatermark', () => {
        const thresholds: QueueThresholds = {
          lowWatermark: 2,
          highWatermark: 20, // Very high
          maxWatermark: 10,
          cooldownMs: 30000,
        };

        const decision = decideTaskGeneration(0, thresholds, false);

        expect(decision.shouldGenerateTasks).toBe(true);
        expect(decision.targetCount).toBe(10); // maxWatermark - 0
      });
    });

    describe('at or above low watermark', () => {
      it('should not generate when exactly at low watermark', () => {
        const decision = decideTaskGeneration(2, defaultThresholds, false);

        expect(decision.shouldGenerateTasks).toBe(false);
        expect(decision.reason).toContain('between watermarks');
      });

      it('should not generate when between watermarks', () => {
        const decision = decideTaskGeneration(5, defaultThresholds, false);

        expect(decision.shouldGenerateTasks).toBe(false);
        expect(decision.reason).toContain('between watermarks');
      });
    });

    describe('at or above high watermark', () => {
      it('should not generate when exactly at high watermark', () => {
        const decision = decideTaskGeneration(8, defaultThresholds, false);

        expect(decision.shouldGenerateTasks).toBe(false);
        expect(decision.reason).toContain('above high watermark');
      });

      it('should not generate when above high watermark', () => {
        const decision = decideTaskGeneration(12, defaultThresholds, false);

        expect(decision.shouldGenerateTasks).toBe(false);
        expect(decision.reason).toContain('above high watermark');
      });
    });

    describe('custom thresholds', () => {
      it('should respect custom low watermark', () => {
        const thresholds: QueueThresholds = {
          lowWatermark: 5,
          highWatermark: 10,
          maxWatermark: 15,
          cooldownMs: 30000,
        };

        // At 4, should generate (below low of 5)
        const decision = decideTaskGeneration(4, thresholds, false);
        expect(decision.shouldGenerateTasks).toBe(true);

        // At 5, should not generate (at low)
        const decision2 = decideTaskGeneration(5, thresholds, false);
        expect(decision2.shouldGenerateTasks).toBe(false);
      });

      it('should calculate correct target count with custom thresholds', () => {
        const thresholds: QueueThresholds = {
          lowWatermark: 3,
          highWatermark: 10,
          maxWatermark: 15,
          cooldownMs: 30000,
        };

        const decision = decideTaskGeneration(1, thresholds, false);

        expect(decision.shouldGenerateTasks).toBe(true);
        expect(decision.targetCount).toBe(9); // highWatermark(10) - pending(1)
      });
    });
  });

  describe('shouldGenerateMoreTasks', () => {
    describe('mode requirements', () => {
      it('should return false when not in continuous mode', () => {
        const state = createState({
          continuousMode: false,
          objective: { id: 'obj-1', title: 'Test', userRequest: 'Test', status: 'active', milestones: [], currentMilestoneIndex: 0, progressPercent: 0, generationRound: 1, createdAt: new Date(), updatedAt: new Date() },
          pendingTaskCount: 0,
        });

        expect(shouldGenerateMoreTasks(state)).toBe(false);
      });

      it('should return false when no objective exists', () => {
        const state = createState({
          continuousMode: true,
          objective: null,
          pendingTaskCount: 0,
        });

        expect(shouldGenerateMoreTasks(state)).toBe(false);
      });
    });

    describe('cooldown behavior', () => {
      it('should return false when in cooldown period', () => {
        const recentTime = new Date(Date.now() - 10000); // 10 seconds ago
        const state = createState({
          continuousMode: true,
          objective: { id: 'obj-1', title: 'Test', userRequest: 'Test', status: 'active', milestones: [], currentMilestoneIndex: 0, progressPercent: 0, generationRound: 1, createdAt: new Date(), updatedAt: new Date() },
          pendingTaskCount: 0,
          lastGenerationTime: recentTime,
          queueThresholds: { ...defaultThresholds, cooldownMs: 30000 },
        });

        expect(shouldGenerateMoreTasks(state)).toBe(false);
      });

      it('should allow generation when cooldown has passed', () => {
        const oldTime = new Date(Date.now() - 60000); // 60 seconds ago
        const state = createState({
          continuousMode: true,
          objective: { id: 'obj-1', title: 'Test', userRequest: 'Test', status: 'active', milestones: [], currentMilestoneIndex: 0, progressPercent: 0, generationRound: 1, createdAt: new Date(), updatedAt: new Date() },
          pendingTaskCount: 0,
          lastGenerationTime: oldTime,
          queueThresholds: { ...defaultThresholds, cooldownMs: 30000 },
        });

        expect(shouldGenerateMoreTasks(state)).toBe(true);
      });

      it('should allow generation when no previous generation time', () => {
        const state = createState({
          continuousMode: true,
          objective: { id: 'obj-1', title: 'Test', userRequest: 'Test', status: 'active', milestones: [], currentMilestoneIndex: 0, progressPercent: 0, generationRound: 1, createdAt: new Date(), updatedAt: new Date() },
          pendingTaskCount: 0,
          lastGenerationTime: null,
        });

        expect(shouldGenerateMoreTasks(state)).toBe(true);
      });
    });

    describe('watermark checks', () => {
      it('should return true when below low watermark', () => {
        const oldTime = new Date(Date.now() - 60000);
        const state = createState({
          continuousMode: true,
          objective: { id: 'obj-1', title: 'Test', userRequest: 'Test', status: 'active', milestones: [], currentMilestoneIndex: 0, progressPercent: 0, generationRound: 1, createdAt: new Date(), updatedAt: new Date() },
          pendingTaskCount: 1, // Below low watermark of 2
          lastGenerationTime: oldTime,
        });

        expect(shouldGenerateMoreTasks(state)).toBe(true);
      });

      it('should return false when at or above low watermark', () => {
        const oldTime = new Date(Date.now() - 60000);
        const state = createState({
          continuousMode: true,
          objective: { id: 'obj-1', title: 'Test', userRequest: 'Test', status: 'active', milestones: [], currentMilestoneIndex: 0, progressPercent: 0, generationRound: 1, createdAt: new Date(), updatedAt: new Date() },
          pendingTaskCount: 2, // At low watermark
          lastGenerationTime: oldTime,
        });

        expect(shouldGenerateMoreTasks(state)).toBe(false);
      });

      it('should return false when queue is full', () => {
        const oldTime = new Date(Date.now() - 60000);
        const state = createState({
          continuousMode: true,
          objective: { id: 'obj-1', title: 'Test', userRequest: 'Test', status: 'active', milestones: [], currentMilestoneIndex: 0, progressPercent: 0, generationRound: 1, createdAt: new Date(), updatedAt: new Date() },
          pendingTaskCount: 10, // Well above watermarks
          lastGenerationTime: oldTime,
        });

        expect(shouldGenerateMoreTasks(state)).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle zero cooldown', () => {
        const recentTime = new Date(Date.now() - 1);
        const state = createState({
          continuousMode: true,
          objective: { id: 'obj-1', title: 'Test', userRequest: 'Test', status: 'active', milestones: [], currentMilestoneIndex: 0, progressPercent: 0, generationRound: 1, createdAt: new Date(), updatedAt: new Date() },
          pendingTaskCount: 0,
          lastGenerationTime: recentTime,
          queueThresholds: { ...defaultThresholds, cooldownMs: 0 },
        });

        expect(shouldGenerateMoreTasks(state)).toBe(true);
      });

      it('should handle zero low watermark', () => {
        const oldTime = new Date(Date.now() - 60000);
        const state = createState({
          continuousMode: true,
          objective: { id: 'obj-1', title: 'Test', userRequest: 'Test', status: 'active', milestones: [], currentMilestoneIndex: 0, progressPercent: 0, generationRound: 1, createdAt: new Date(), updatedAt: new Date() },
          pendingTaskCount: 0,
          lastGenerationTime: oldTime,
          queueThresholds: { ...defaultThresholds, lowWatermark: 0 },
        });

        // pendingTaskCount (0) is not < lowWatermark (0), so false
        expect(shouldGenerateMoreTasks(state)).toBe(false);
      });
    });
  });
});
