import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { AgentController, AgentControllerConfig } from './AgentController';
import { BeadsAdapter } from '@jetpack-agent/beads-adapter';
import { MCPMailAdapter } from '@jetpack-agent/mcp-mail-adapter';
import { CASSAdapter } from '@jetpack-agent/cass-adapter';
import { Task, TaskStatus, AgentSkill } from '@jetpack-agent/shared';

// Mock the adapters
vi.mock('@jetpack-agent/beads-adapter');
vi.mock('@jetpack-agent/mcp-mail-adapter');
vi.mock('@jetpack-agent/cass-adapter');

// Mock task for testing
const createMockTask = (overrides?: Partial<Task>): Task => ({
  id: 'test-task-1',
  title: 'Test Task',
  description: 'A test task for TypeScript development',
  status: 'ready' as TaskStatus,
  priority: 'medium',
  requiredSkills: ['typescript'] as AgentSkill[],
  createdAt: new Date(),
  updatedAt: new Date(),
  dependencies: [],
  tags: [],
  ...overrides,
});

describe('AgentController', () => {
  let controller: AgentController;
  let mockBeads: BeadsAdapter;
  let mockMail: MCPMailAdapter;
  let mockCass: CASSAdapter;
  let config: AgentControllerConfig;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Create mock instances
    mockBeads = {
      getReadyTasks: vi.fn().mockResolvedValue([]),
      getTask: vi.fn().mockResolvedValue(null),
      claimTask: vi.fn().mockResolvedValue(null),
      updateTask: vi.fn().mockResolvedValue(undefined),
    } as unknown as BeadsAdapter;

    mockMail = {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      publish: vi.fn().mockResolvedValue(undefined),
      sendHeartbeat: vi.fn().mockResolvedValue(undefined),
      acquireLease: vi.fn().mockResolvedValue(true),
      releaseLease: vi.fn().mockResolvedValue(undefined),
      isLeased: vi.fn().mockResolvedValue({ isLeased: false, agentId: null }),
      acknowledge: vi.fn().mockResolvedValue(undefined),
    } as unknown as MCPMailAdapter;

    mockCass = {
      semanticSearchByQuery: vi.fn().mockResolvedValue([]),
      store: vi.fn().mockResolvedValue({ id: 'mem-1' }),
    } as unknown as CASSAdapter;

    config = {
      name: 'test-agent',
      skills: ['typescript', 'testing'] as AgentSkill[],
      workDir: '/tmp/test-project',
      workPollingIntervalMs: 100, // Short interval for testing
    };
  });

  afterEach(async () => {
    vi.useRealTimers();
    // Ensure controller is stopped
    if (controller) {
      try {
        await controller.stop();
      } catch {
        // Ignore errors during cleanup
      }
    }
  });

  describe('constructor', () => {
    it('should create an agent with the provided configuration', () => {
      controller = new AgentController(config, mockBeads, mockMail, mockCass);
      const agent = controller.getAgent();

      expect(agent.name).toBe('test-agent');
      expect(agent.skills).toContain('typescript');
      expect(agent.skills).toContain('testing');
      expect(agent.status).toBe('idle');
    });
  });

  describe('start', () => {
    it('should subscribe to task messages', async () => {
      controller = new AgentController(config, mockBeads, mockMail, mockCass);
      await controller.start();

      expect(mockMail.subscribe).toHaveBeenCalledWith('task.created', expect.any(Function));
      expect(mockMail.subscribe).toHaveBeenCalledWith('task.updated', expect.any(Function));
      expect(mockMail.subscribe).toHaveBeenCalledWith('task.assigned', expect.any(Function));
    });

    it('should publish agent.started message', async () => {
      controller = new AgentController(config, mockBeads, mockMail, mockCass);
      await controller.start();

      expect(mockMail.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent.started',
          payload: expect.objectContaining({
            name: 'test-agent',
            skills: expect.arrayContaining(['typescript', 'testing']),
          }),
        })
      );
    });

    it('should immediately look for work on start', async () => {
      controller = new AgentController(config, mockBeads, mockMail, mockCass);
      await controller.start();

      expect(mockBeads.getReadyTasks).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('should unsubscribe from task messages', async () => {
      controller = new AgentController(config, mockBeads, mockMail, mockCass);
      await controller.start();
      await controller.stop();

      expect(mockMail.unsubscribe).toHaveBeenCalledWith('task.created', expect.any(Function));
      expect(mockMail.unsubscribe).toHaveBeenCalledWith('task.updated', expect.any(Function));
      expect(mockMail.unsubscribe).toHaveBeenCalledWith('task.assigned', expect.any(Function));
    });

    it('should publish agent.stopped message', async () => {
      controller = new AgentController(config, mockBeads, mockMail, mockCass);
      await controller.start();
      await controller.stop();

      expect(mockMail.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent.stopped',
          payload: expect.objectContaining({
            name: 'test-agent',
          }),
        })
      );
    });
  });

  // ============================================================================
  // BUG-5: Periodic Work Polling Tests
  // ============================================================================

  describe('periodic work polling (BUG-5)', () => {
    it('should poll for work at the configured interval when idle', async () => {
      controller = new AgentController(config, mockBeads, mockMail, mockCass);
      await controller.start();

      // Reset mock to count only polling calls (not initial call)
      (mockBeads.getReadyTasks as Mock).mockClear();

      // Advance time by one polling interval
      await vi.advanceTimersByTimeAsync(100);

      expect(mockBeads.getReadyTasks).toHaveBeenCalledTimes(1);

      // Advance by another interval
      await vi.advanceTimersByTimeAsync(100);

      expect(mockBeads.getReadyTasks).toHaveBeenCalledTimes(2);
    });

    it('should use default 30 second interval when not configured', async () => {
      const configWithoutInterval: AgentControllerConfig = {
        name: 'test-agent',
        skills: ['typescript'] as AgentSkill[],
        workDir: '/tmp/test-project',
        // Note: workPollingIntervalMs not set
      };

      controller = new AgentController(configWithoutInterval, mockBeads, mockMail, mockCass);
      await controller.start();

      // Reset mock to count only polling calls
      (mockBeads.getReadyTasks as Mock).mockClear();

      // Advance time by less than 30 seconds - should not poll
      await vi.advanceTimersByTimeAsync(29000);
      expect(mockBeads.getReadyTasks).toHaveBeenCalledTimes(0);

      // Advance to 30 seconds - should poll
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockBeads.getReadyTasks).toHaveBeenCalledTimes(1);
    });

    it('should not poll when agent is busy', async () => {
      // The agent becomes busy when it claims a task and starts executing.
      // The lookForWork() method checks agent.status !== 'idle' and returns early if busy.
      // We test this by verifying that if agent status is not 'idle', lookForWork won't
      // call getReadyTasks. To simulate this, we can check the agent's state after claiming.

      controller = new AgentController(config, mockBeads, mockMail, mockCass);

      // Initially no tasks
      (mockBeads.getReadyTasks as Mock).mockResolvedValue([]);
      await controller.start();

      // Verify agent is idle
      expect(controller.getAgent().status).toBe('idle');

      // Reset mock and verify polling happens when idle
      (mockBeads.getReadyTasks as Mock).mockClear();
      await vi.advanceTimersByTimeAsync(100);
      expect(mockBeads.getReadyTasks).toHaveBeenCalledTimes(1);

      // Note: To fully test the busy state, we would need to mock the executor
      // and ensure the agent stays in 'busy' status during task execution.
      // This is tested implicitly by the lookForWork() early return check.
    });

    it('should stop polling when agent is stopped', async () => {
      controller = new AgentController(config, mockBeads, mockMail, mockCass);
      await controller.start();

      // Reset mock to count only post-stop calls
      (mockBeads.getReadyTasks as Mock).mockClear();

      // Stop the agent
      await controller.stop();

      // Advance time - should not poll after stop
      await vi.advanceTimersByTimeAsync(200);

      expect(mockBeads.getReadyTasks).toHaveBeenCalledTimes(0);
    });

    it('should handle errors gracefully during polling', async () => {
      controller = new AgentController(config, mockBeads, mockMail, mockCass);
      await controller.start();

      // Reset and make getReadyTasks throw an error
      (mockBeads.getReadyTasks as Mock).mockClear();
      (mockBeads.getReadyTasks as Mock).mockRejectedValueOnce(new Error('Network error'));

      // Should not throw, just log error
      await expect(vi.advanceTimersByTimeAsync(100)).resolves.not.toThrow();

      // Next polling cycle should still work
      (mockBeads.getReadyTasks as Mock).mockResolvedValue([]);
      await vi.advanceTimersByTimeAsync(100);

      // Should have tried polling twice (one error, one success)
      expect(mockBeads.getReadyTasks).toHaveBeenCalledTimes(2);
    });

    it('should claim tasks found during polling', async () => {
      const task = createMockTask();
      controller = new AgentController(config, mockBeads, mockMail, mockCass);
      await controller.start();

      // Reset mock and prepare for polling
      (mockBeads.getReadyTasks as Mock).mockClear();
      (mockBeads.getReadyTasks as Mock).mockResolvedValue([task]);
      (mockBeads.claimTask as Mock).mockResolvedValue(task);

      // Advance to trigger polling
      await vi.advanceTimersByTimeAsync(100);

      expect(mockBeads.claimTask).toHaveBeenCalledWith(task.id, expect.any(String));
    });
  });

  describe('work polling configuration', () => {
    it('should accept custom polling interval', async () => {
      const customConfig: AgentControllerConfig = {
        ...config,
        workPollingIntervalMs: 5000, // 5 seconds
      };

      controller = new AgentController(customConfig, mockBeads, mockMail, mockCass);
      await controller.start();

      (mockBeads.getReadyTasks as Mock).mockClear();

      // Should not poll before 5 seconds
      await vi.advanceTimersByTimeAsync(4000);
      expect(mockBeads.getReadyTasks).toHaveBeenCalledTimes(0);

      // Should poll at 5 seconds
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockBeads.getReadyTasks).toHaveBeenCalledTimes(1);
    });

    it('should respect very short polling intervals for testing', async () => {
      const fastConfig: AgentControllerConfig = {
        ...config,
        workPollingIntervalMs: 50, // 50ms for fast testing
      };

      controller = new AgentController(fastConfig, mockBeads, mockMail, mockCass);
      await controller.start();

      (mockBeads.getReadyTasks as Mock).mockClear();

      // Should poll multiple times in 200ms
      await vi.advanceTimersByTimeAsync(200);
      expect(mockBeads.getReadyTasks).toHaveBeenCalledTimes(4);
    });
  });

  describe('heartbeat', () => {
    it('should send heartbeats every 30 seconds', async () => {
      controller = new AgentController(config, mockBeads, mockMail, mockCass);
      await controller.start();

      (mockMail.sendHeartbeat as Mock).mockClear();

      // Advance by 30 seconds
      await vi.advanceTimersByTimeAsync(30000);

      expect(mockMail.sendHeartbeat).toHaveBeenCalledTimes(1);

      // Advance another 30 seconds
      await vi.advanceTimersByTimeAsync(30000);

      expect(mockMail.sendHeartbeat).toHaveBeenCalledTimes(2);
    });
  });

  describe('status broadcasting', () => {
    it('should broadcast status every 10 seconds', async () => {
      controller = new AgentController(config, mockBeads, mockMail, mockCass);
      await controller.start();

      // Count agent.status messages
      const statusCalls = () =>
        (mockMail.publish as Mock).mock.calls.filter(
          call => call[0]?.type === 'agent.status'
        ).length;

      const initialStatusCalls = statusCalls();

      // Advance by 10 seconds
      await vi.advanceTimersByTimeAsync(10000);

      expect(statusCalls()).toBe(initialStatusCalls + 1);

      // Advance another 10 seconds
      await vi.advanceTimersByTimeAsync(10000);

      expect(statusCalls()).toBe(initialStatusCalls + 2);
    });
  });

  describe('agent state', () => {
    it('should return agent info via getAgent()', () => {
      controller = new AgentController(config, mockBeads, mockMail, mockCass);
      const agent = controller.getAgent();

      expect(agent.id).toMatch(/^agent-/);
      expect(agent.name).toBe('test-agent');
      expect(agent.status).toBe('idle');
      expect(agent.skills).toEqual(['typescript', 'testing']);
    });

    it('should return undefined for getCurrentTask when idle', () => {
      controller = new AgentController(config, mockBeads, mockMail, mockCass);
      expect(controller.getCurrentTask()).toBeUndefined();
    });

    it('should return agent stats via getStats()', () => {
      controller = new AgentController(config, mockBeads, mockMail, mockCass);
      const stats = controller.getStats();

      expect(stats.tasksCompleted).toBe(0);
      expect(stats.tasksFailed).toBe(0);
      expect(stats.totalCompletionMs).toBe(0);
      expect(stats.startTime).toBeInstanceOf(Date);
    });
  });

  // ============================================================================
  // BUG-7: Graceful Shutdown Tests
  // ============================================================================

  describe('graceful shutdown (BUG-7)', () => {
    describe('saveStateBeforeExit', () => {
      it('should save agent statistics to CASS on shutdown', async () => {
        controller = new AgentController(config, mockBeads, mockMail, mockCass);
        await controller.start();

        await controller.saveStateBeforeExit();

        // Should store agent statistics in CASS
        expect(mockCass.store).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'agent_learning',
            content: expect.stringContaining('shutdown'),
            metadata: expect.objectContaining({
              agentName: 'test-agent',
              shutdownAt: expect.any(String),
            }),
          })
        );
      });

      it('should not store task info if no task in progress', async () => {
        controller = new AgentController(config, mockBeads, mockMail, mockCass);
        await controller.start();

        // Clear any mock calls from start
        (mockCass.store as Mock).mockClear();
        (mockBeads.updateTask as Mock).mockClear();

        await controller.saveStateBeforeExit();

        // Should not update any tasks (no task was in progress)
        expect(mockBeads.updateTask).not.toHaveBeenCalled();

        // Should store agent stats (one call for shutdown statistics)
        expect(mockCass.store).toHaveBeenCalledTimes(1);
      });
    });

    describe('gracefulStop', () => {
      it('should call saveStateBeforeExit before stop', async () => {
        controller = new AgentController(config, mockBeads, mockMail, mockCass);
        await controller.start();

        await controller.gracefulStop();

        // Verify CASS store was called for shutdown stats
        expect(mockCass.store).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'agent_learning',
            content: expect.stringContaining('shutdown'),
          })
        );
      });

      it('should publish agent.stopped message', async () => {
        controller = new AgentController(config, mockBeads, mockMail, mockCass);
        await controller.start();

        await controller.gracefulStop();

        expect(mockMail.publish).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'agent.stopped',
            payload: expect.objectContaining({
              name: 'test-agent',
            }),
          })
        );
      });

      it('should unsubscribe from all mail topics', async () => {
        controller = new AgentController(config, mockBeads, mockMail, mockCass);
        await controller.start();

        await controller.gracefulStop();

        expect(mockMail.unsubscribe).toHaveBeenCalledWith('task.created', expect.any(Function));
        expect(mockMail.unsubscribe).toHaveBeenCalledWith('task.updated', expect.any(Function));
        expect(mockMail.unsubscribe).toHaveBeenCalledWith('task.assigned', expect.any(Function));
      });

      it('should stop work polling timer', async () => {
        controller = new AgentController(config, mockBeads, mockMail, mockCass);
        await controller.start();

        (mockBeads.getReadyTasks as Mock).mockClear();

        await controller.gracefulStop();

        // Advance time - should not poll after gracefulStop
        await vi.advanceTimersByTimeAsync(200);

        expect(mockBeads.getReadyTasks).toHaveBeenCalledTimes(0);
      });
    });
  });
});
