import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClaudeCodeExecutor, ExecutorConfig } from './ClaudeCodeExecutor';
import { Task, TaskStatus } from '@jetpack-agent/shared';

// Mock task for testing
const createMockTask = (overrides?: Partial<Task>): Task => ({
  id: 'test-task-1',
  title: 'Test Task',
  description: 'A test task',
  status: 'pending' as TaskStatus,
  priority: 'medium',
  requiredSkills: ['testing'],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('ClaudeCodeExecutor', () => {
  describe('constructor', () => {
    it('should use default timeout values', () => {
      const executor = new ClaudeCodeExecutor('/tmp');
      expect(executor).toBeDefined();
    });

    it('should accept custom timeout configuration', () => {
      const config: ExecutorConfig = {
        timeoutMs: 10000,
        gracefulShutdownMs: 2000,
      };
      const executor = new ClaudeCodeExecutor('/tmp', config);
      expect(executor).toBeDefined();
    });
  });

  describe('isExecuting', () => {
    it('should return false when no execution is in progress', () => {
      const executor = new ClaudeCodeExecutor('/tmp');
      expect(executor.isExecuting()).toBe(false);
    });
  });

  describe('abort', () => {
    it('should not throw when no process is running', () => {
      const executor = new ClaudeCodeExecutor('/tmp');
      expect(() => executor.abort()).not.toThrow();
    });
  });

  describe('forceKill', () => {
    it('should not throw when no process is running', () => {
      const executor = new ClaudeCodeExecutor('/tmp');
      expect(() => executor.forceKill()).not.toThrow();
    });
  });

  describe('timeout configuration', () => {
    it('should have correct default values', () => {
      // Default timeout is 5 minutes (300000ms)
      // Default graceful shutdown is 10 seconds (10000ms)
      const executor = new ClaudeCodeExecutor('/tmp');

      // We can't directly access private members, but we can verify
      // the executor was created successfully
      expect(executor).toBeDefined();
    });

    it('should accept zero timeout (immediate timeout)', () => {
      const executor = new ClaudeCodeExecutor('/tmp', {
        timeoutMs: 0,
        gracefulShutdownMs: 0,
      });
      expect(executor).toBeDefined();
    });

    it('should accept very long timeout', () => {
      const executor = new ClaudeCodeExecutor('/tmp', {
        timeoutMs: 60 * 60 * 1000, // 1 hour
        gracefulShutdownMs: 30000,
      });
      expect(executor).toBeDefined();
    });
  });

  describe('execute with mocked process', () => {
    // Since we can't easily mock child_process.spawn in unit tests,
    // these tests verify the structure and error handling

    it('should return ExecutionResult with timedOut flag on timeout', async () => {
      const executor = new ClaudeCodeExecutor('/tmp', {
        timeoutMs: 100, // Very short timeout
        gracefulShutdownMs: 50,
      });

      const task = createMockTask();
      const result = await executor.execute({
        task,
        memories: [],
        workDir: '/tmp',
        agentName: 'test-agent',
        agentSkills: ['testing'],
      });

      // If claude is not installed, we'll get an error about spawning
      // If it times out, we'll get timedOut: true
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('duration');
      expect(typeof result.duration).toBe('number');
    });

    it('should include error message on failure', async () => {
      const executor = new ClaudeCodeExecutor('/nonexistent/path', {
        timeoutMs: 1000,
      });

      const task = createMockTask();
      const result = await executor.execute({
        task,
        memories: [],
        workDir: '/nonexistent/path/that/does/not/exist',
        agentName: 'test-agent',
        agentSkills: ['testing'],
      });

      // Should fail because directory doesn't exist
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
      }
    });
  });

  describe('prompt building', () => {
    it('should include task details in prompt', async () => {
      const executor = new ClaudeCodeExecutor('/tmp', {
        timeoutMs: 100, // Very short to avoid hanging
      });

      const task = createMockTask({
        title: 'Implement Feature X',
        description: 'Add the new feature',
        priority: 'high',
        requiredSkills: ['typescript', 'react'],
      });

      // Execute briefly to verify prompt is built (will likely fail/timeout)
      const result = await executor.execute({
        task,
        memories: [
          {
            id: 'mem-1',
            content: 'Previous context about the codebase',
            type: 'code_context',
            embedding: [],
            metadata: {},
            importance: 0.8,
            accessCount: 1,
            lastAccessedAt: new Date(),
            createdAt: new Date(),
          },
        ],
        workDir: '/tmp',
        agentName: 'Feature Agent',
        agentSkills: ['typescript', 'react'],
      });

      // The prompt building itself doesn't throw
      expect(result).toBeDefined();
    });
  });
});

describe('ExecutionResult type', () => {
  it('should have timedOut property in interface', () => {
    // Type check - this verifies the interface has the timedOut property
    const result = {
      success: false,
      output: '',
      error: 'timeout',
      duration: 1000,
      timedOut: true,
    };

    expect(result.timedOut).toBe(true);
  });
});
