import { describe, it, expect } from 'vitest';
import {
  ConflictTypeSchema,
  ConflictSchema,
  ReassignmentSchema,
  PlannedTaskSchema,
  MilestoneStatusSchema,
  MilestoneSchema,
  ObjectiveStatusSchema,
  ObjectiveSchema,
  QueueThresholdsSchema,
} from './state';

describe('Supervisor State Schemas', () => {
  describe('ConflictTypeSchema', () => {
    it('should accept valid conflict types', () => {
      expect(ConflictTypeSchema.parse('task_failed')).toBe('task_failed');
      expect(ConflictTypeSchema.parse('agent_error')).toBe('agent_error');
      expect(ConflictTypeSchema.parse('dependency_blocked')).toBe('dependency_blocked');
      expect(ConflictTypeSchema.parse('skill_mismatch')).toBe('skill_mismatch');
      expect(ConflictTypeSchema.parse('timeout')).toBe('timeout');
    });

    it('should reject invalid conflict types', () => {
      expect(() => ConflictTypeSchema.parse('invalid')).toThrow();
    });
  });

  describe('ConflictSchema', () => {
    it('should parse valid conflict', () => {
      const conflict = {
        id: 'conf-1',
        type: 'task_failed',
        taskId: 'bd-123',
        agentId: 'agent-1',
        description: 'Task failed due to timeout',
        createdAt: new Date(),
        resolved: false,
      };

      const result = ConflictSchema.parse(conflict);
      expect(result.id).toBe('conf-1');
      expect(result.type).toBe('task_failed');
    });

    it('should default resolved to false', () => {
      const conflict = {
        id: 'conf-2',
        type: 'agent_error',
        taskId: 'bd-456',
        description: 'Agent crashed',
        createdAt: new Date(),
      };

      const result = ConflictSchema.parse(conflict);
      expect(result.resolved).toBe(false);
    });

    it('should make agentId optional', () => {
      const conflict = {
        id: 'conf-3',
        type: 'dependency_blocked',
        taskId: 'bd-789',
        description: 'Dependencies not met',
        createdAt: new Date(),
      };

      const result = ConflictSchema.parse(conflict);
      expect(result.agentId).toBeUndefined();
    });
  });

  describe('ReassignmentSchema', () => {
    it('should parse valid reassignment', () => {
      const reassignment = {
        taskId: 'bd-123',
        fromAgentId: 'agent-1',
        toAgentId: 'agent-2',
        reason: 'Agent 1 is overloaded',
        timestamp: new Date(),
      };

      const result = ReassignmentSchema.parse(reassignment);
      expect(result.taskId).toBe('bd-123');
      expect(result.toAgentId).toBe('agent-2');
    });

    it('should make fromAgentId optional', () => {
      const reassignment = {
        taskId: 'bd-456',
        toAgentId: 'agent-2',
        reason: 'First assignment',
        timestamp: new Date(),
      };

      const result = ReassignmentSchema.parse(reassignment);
      expect(result.fromAgentId).toBeUndefined();
    });
  });

  describe('PlannedTaskSchema', () => {
    it('should parse valid planned task', () => {
      const task = {
        title: 'Implement login',
        description: 'Create login form and authentication',
        requiredSkills: ['react', 'authentication'],
        estimatedMinutes: 60,
        dependsOn: [],
      };

      const result = PlannedTaskSchema.parse(task);
      expect(result.title).toBe('Implement login');
      expect(result.requiredSkills).toContain('react');
    });

    it('should accept dependencies', () => {
      const task = {
        title: 'Add tests',
        description: 'Add unit tests for login',
        requiredSkills: ['testing'],
        estimatedMinutes: 30,
        dependsOn: ['Implement login'],
      };

      const result = PlannedTaskSchema.parse(task);
      expect(result.dependsOn).toContain('Implement login');
    });

    it('should require all fields', () => {
      expect(() => PlannedTaskSchema.parse({})).toThrow();
    });
  });

  describe('MilestoneStatusSchema', () => {
    it('should accept valid statuses', () => {
      expect(MilestoneStatusSchema.parse('pending')).toBe('pending');
      expect(MilestoneStatusSchema.parse('in_progress')).toBe('in_progress');
      expect(MilestoneStatusSchema.parse('completed')).toBe('completed');
    });
  });

  describe('MilestoneSchema', () => {
    it('should parse valid milestone', () => {
      const milestone = {
        id: 'ms-1',
        title: 'Phase 1: Setup',
        completionCriteria: [
          'Project structure created',
          'Dependencies installed',
        ],
        estimatedTasks: 3,
        taskIds: [],
        status: 'pending',
      };

      const result = MilestoneSchema.parse(milestone);
      expect(result.id).toBe('ms-1');
      expect(result.completionCriteria).toHaveLength(2);
    });

    it('should track task IDs', () => {
      const milestone = {
        id: 'ms-2',
        title: 'Phase 2: Implementation',
        completionCriteria: ['Feature complete'],
        estimatedTasks: 5,
        taskIds: ['bd-1', 'bd-2', 'bd-3'],
        status: 'in_progress',
      };

      const result = MilestoneSchema.parse(milestone);
      expect(result.taskIds).toHaveLength(3);
    });
  });

  describe('ObjectiveStatusSchema', () => {
    it('should accept valid statuses', () => {
      expect(ObjectiveStatusSchema.parse('active')).toBe('active');
      expect(ObjectiveStatusSchema.parse('paused')).toBe('paused');
      expect(ObjectiveStatusSchema.parse('completed')).toBe('completed');
      expect(ObjectiveStatusSchema.parse('failed')).toBe('failed');
    });
  });

  describe('ObjectiveSchema', () => {
    it('should parse valid objective', () => {
      const objective = {
        id: 'obj-1',
        title: 'Build Authentication',
        userRequest: 'Implement user authentication for the app',
        status: 'active',
        milestones: [
          {
            id: 'ms-1',
            title: 'Setup',
            completionCriteria: ['Project setup'],
            estimatedTasks: 2,
            taskIds: [],
            status: 'completed',
          },
          {
            id: 'ms-2',
            title: 'Implementation',
            completionCriteria: ['Login working'],
            estimatedTasks: 5,
            taskIds: [],
            status: 'in_progress',
          },
        ],
        currentMilestoneIndex: 1,
        progressPercent: 35,
        generationRound: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = ObjectiveSchema.parse(objective);
      expect(result.id).toBe('obj-1');
      expect(result.milestones).toHaveLength(2);
      expect(result.currentMilestoneIndex).toBe(1);
    });

    it('should track generation rounds', () => {
      const objective = {
        id: 'obj-2',
        title: 'Build Feature',
        userRequest: 'Add feature X',
        status: 'active',
        milestones: [],
        currentMilestoneIndex: 0,
        progressPercent: 0,
        generationRound: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = ObjectiveSchema.parse(objective);
      expect(result.generationRound).toBe(5);
    });
  });

  describe('QueueThresholdsSchema', () => {
    it('should use defaults when empty', () => {
      const result = QueueThresholdsSchema.parse({});

      expect(result.lowWatermark).toBe(2);
      expect(result.highWatermark).toBe(8);
      expect(result.maxWatermark).toBe(15);
      expect(result.cooldownMs).toBe(30000);
    });

    it('should accept custom values', () => {
      const thresholds = {
        lowWatermark: 5,
        highWatermark: 15,
        maxWatermark: 25,
        cooldownMs: 60000,
      };

      const result = QueueThresholdsSchema.parse(thresholds);
      expect(result.lowWatermark).toBe(5);
      expect(result.highWatermark).toBe(15);
    });

    it('should allow partial overrides', () => {
      const result = QueueThresholdsSchema.parse({ lowWatermark: 3 });

      expect(result.lowWatermark).toBe(3);
      expect(result.highWatermark).toBe(8); // Default
    });
  });
});
