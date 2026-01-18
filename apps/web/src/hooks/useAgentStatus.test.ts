import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAgentStatus } from './useAgentStatus';
import type { AgentStatusData } from '@/components/AgentStatusCard';

// Mock agent data
const mockAgentData: AgentStatusData[] = [
  {
    id: 'agent-123',
    name: 'test-agent-1',
    status: 'idle',
    skills: ['typescript', 'react'],
    currentTask: null,
    tasksCompleted: 5,
    lastHeartbeat: new Date().toISOString(),
    startedAt: new Date(Date.now() - 3600000).toISOString(),
    healthStatus: 'healthy',
    heartbeatAgeMs: 5000,
  },
  {
    id: 'agent-456',
    name: 'test-agent-2',
    status: 'busy',
    skills: ['python', 'backend'],
    currentTask: 'bd-abc123',
    tasksCompleted: 10,
    lastHeartbeat: new Date().toISOString(),
    startedAt: new Date(Date.now() - 7200000).toISOString(),
    healthStatus: 'healthy',
    heartbeatAgeMs: 2000,
  },
];

// Simple EventSource mock
class MockEventSource {
  url: string;
  listeners: Map<string, Set<(event: MessageEvent) => void>> = new Map();
  readyState: number = 0;
  onopen: ((event: Event) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    this.readyState = 0; // CONNECTING

    // Simulate connection
    setTimeout(() => {
      this.readyState = 1; // OPEN
    }, 0);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.readyState = 2; // CLOSED
  }

  // Helper to emit events in tests
  emit(type: string, data: unknown): void {
    const event = new MessageEvent(type, {
      data: JSON.stringify(data),
    });
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

describe('useAgentStatus', () => {
  let mockEventSource: MockEventSource | null = null;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock EventSource
    vi.stubGlobal('EventSource', function (url: string) {
      mockEventSource = new MockEventSource(url);
      return mockEventSource;
    });

    // Mock fetch for fallback
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ agents: mockAgentData }),
    }));
  });

  afterEach(() => {
    mockEventSource?.close();
    mockEventSource = null;
    vi.unstubAllGlobals();
  });

  describe('initialization', () => {
    it('should return initial state when disabled', () => {
      const { result } = renderHook(() => useAgentStatus({ enabled: false }));

      expect(result.current.agents).toEqual([]);
      expect(result.current.isConnected).toBe(false);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBeNull();
      expect(result.current.stats).toEqual({ total: 0, busy: 0, idle: 0, error: 0 });
    });

    it('should create EventSource when enabled', () => {
      renderHook(() => useAgentStatus({ enabled: true }));

      expect(mockEventSource).not.toBeNull();
      expect(mockEventSource!.url).toBe('/api/agents/stream');
    });

    it('should not create EventSource when disabled', () => {
      renderHook(() => useAgentStatus({ enabled: false }));

      expect(mockEventSource).toBeNull();
    });
  });

  describe('SSE events', () => {
    it('should handle connected event', async () => {
      const onConnect = vi.fn();
      const { result } = renderHook(() => useAgentStatus({ enabled: true, onConnect }));

      expect(mockEventSource).not.toBeNull();

      act(() => {
        mockEventSource!.emit('connected', { clientId: 'test-client', timestamp: new Date().toISOString() });
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      expect(onConnect).toHaveBeenCalled();
    });

    it('should handle agents event with data', async () => {
      const { result } = renderHook(() => useAgentStatus({ enabled: true }));

      expect(mockEventSource).not.toBeNull();

      act(() => {
        mockEventSource!.emit('agents', {
          agents: mockAgentData,
          timestamp: new Date().toISOString(),
          agentCount: 2,
          busyCount: 1,
          idleCount: 1,
          errorCount: 0,
        });
      });

      await waitFor(() => {
        expect(result.current.agents).toHaveLength(2);
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.agents[0].name).toBe('test-agent-1');
      expect(result.current.agents[1].name).toBe('test-agent-2');
    });

    it('should update stats based on agent data', async () => {
      const { result } = renderHook(() => useAgentStatus({ enabled: true }));

      expect(mockEventSource).not.toBeNull();

      act(() => {
        mockEventSource!.emit('agents', {
          agents: mockAgentData,
          timestamp: new Date().toISOString(),
          agentCount: 2,
          busyCount: 1,
          idleCount: 1,
          errorCount: 0,
        });
      });

      await waitFor(() => {
        expect(result.current.stats.total).toBe(2);
      });

      expect(result.current.stats.busy).toBe(1);
      expect(result.current.stats.idle).toBe(1);
      expect(result.current.stats.error).toBe(0);
    });
  });

  describe('lastUpdate', () => {
    it('should update lastUpdate when receiving agent data', async () => {
      const { result } = renderHook(() => useAgentStatus({ enabled: true }));

      expect(result.current.lastUpdate).toBeNull();

      const timestamp = new Date().toISOString();

      act(() => {
        mockEventSource!.emit('agents', {
          agents: mockAgentData,
          timestamp,
          agentCount: 2,
          busyCount: 1,
          idleCount: 1,
          errorCount: 0,
        });
      });

      await waitFor(() => {
        expect(result.current.lastUpdate).not.toBeNull();
      });

      expect(result.current.lastUpdate?.toISOString()).toBe(timestamp);
    });
  });

  describe('reconnect', () => {
    it('should provide reconnect function', () => {
      const { result } = renderHook(() => useAgentStatus({ enabled: true }));

      expect(typeof result.current.reconnect).toBe('function');
    });
  });

  describe('cleanup', () => {
    it('should close EventSource on unmount', () => {
      const { unmount } = renderHook(() => useAgentStatus({ enabled: true }));

      expect(mockEventSource).not.toBeNull();
      const closeSpy = vi.spyOn(mockEventSource!, 'close');

      unmount();

      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('stats calculation', () => {
    it('should calculate stats correctly for all agent statuses', async () => {
      const { result } = renderHook(() => useAgentStatus({ enabled: true }));

      const allStatusAgents: AgentStatusData[] = [
        { ...mockAgentData[0], id: 'a1', status: 'idle' },
        { ...mockAgentData[0], id: 'a2', status: 'busy' },
        { ...mockAgentData[0], id: 'a3', status: 'busy' },
        { ...mockAgentData[0], id: 'a4', status: 'error' },
      ];

      act(() => {
        mockEventSource!.emit('agents', {
          agents: allStatusAgents,
          timestamp: new Date().toISOString(),
          agentCount: 4,
          busyCount: 2,
          idleCount: 1,
          errorCount: 1,
        });
      });

      await waitFor(() => {
        expect(result.current.stats.total).toBe(4);
      });

      expect(result.current.stats).toEqual({
        total: 4,
        idle: 1,
        busy: 2,
        error: 1,
      });
    });
  });
});
