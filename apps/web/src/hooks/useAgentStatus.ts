'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AgentStatusData } from '@/components/AgentStatusCard';

export interface AgentStatusUpdate {
  agents: AgentStatusData[];
  timestamp: string;
  agentCount: number;
  busyCount: number;
  idleCount: number;
  errorCount: number;
}

interface UseAgentStatusOptions {
  enabled?: boolean;
  fallbackPollingInterval?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

interface UseAgentStatusResult {
  agents: AgentStatusData[];
  isConnected: boolean;
  isLoading: boolean;
  error: Error | null;
  stats: {
    total: number;
    busy: number;
    idle: number;
    error: number;
  };
  lastUpdate: Date | null;
  reconnect: () => void;
}

/**
 * Hook for subscribing to real-time agent status updates via SSE
 */
export function useAgentStatus(options: UseAgentStatusOptions = {}): UseAgentStatusResult {
  const {
    enabled = true,
    fallbackPollingInterval = 5000,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  const [agents, setAgents] = useState<AgentStatusData[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  // Calculate stats
  const stats = {
    total: agents.length,
    busy: agents.filter((a) => a.status === 'busy').length,
    idle: agents.filter((a) => a.status === 'idle').length,
    error: agents.filter((a) => a.status === 'error').length,
  };

  // Cleanup function
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Fallback polling function
  const fetchAgents = useCallback(async () => {
    try {
      const response = await fetch('/api/agents');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setAgents(data.agents || []);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      const fetchError = err instanceof Error ? err : new Error('Failed to fetch agents');
      setError(fetchError);
      onError?.(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  // Connect to SSE stream
  const connect = useCallback(() => {
    if (!enabled) return;

    cleanup();
    setIsLoading(true);

    try {
      const eventSource = new EventSource('/api/agents/stream');
      eventSourceRef.current = eventSource;

      eventSource.addEventListener('connected', () => {
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        onConnect?.();
      });

      eventSource.addEventListener('agents', (event) => {
        try {
          const data: AgentStatusUpdate = JSON.parse(event.data);
          setAgents(data.agents);
          setLastUpdate(new Date(data.timestamp));
          setIsLoading(false);
          setError(null);
        } catch (err) {
          console.error('Failed to parse agent update:', err);
        }
      });

      eventSource.addEventListener('heartbeat', () => {
        // Heartbeat received, connection is alive
        setIsConnected(true);
      });

      eventSource.onerror = (): void => {
        setIsConnected(false);
        onDisconnect?.();

        // Cleanup the failed connection
        eventSource.close();
        eventSourceRef.current = null;

        // Attempt reconnection with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          // Fall back to polling after max attempts
          setError(new Error('SSE connection failed, falling back to polling'));
          // Start polling as a fallback (cleaned up via useEffect cleanup)
          const pollInterval = setInterval(fetchAgents, fallbackPollingInterval);
          // Store the interval for cleanup
          reconnectTimeoutRef.current = pollInterval as unknown as ReturnType<typeof setTimeout>;
        }
      };
    } catch (err) {
      const connectError = err instanceof Error ? err : new Error('Failed to connect');
      setError(connectError);
      setIsConnected(false);
      setIsLoading(false);
      onError?.(connectError);
    }
  }, [enabled, cleanup, onConnect, onDisconnect, onError, fetchAgents, fallbackPollingInterval]);

  // Reconnect function exposed to consumers
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  // Connect on mount, cleanup on unmount
  useEffect(() => {
    if (enabled) {
      connect();
    }
    return cleanup;
  }, [enabled, connect, cleanup]);

  return {
    agents,
    isConnected,
    isLoading,
    error,
    stats,
    lastUpdate,
    reconnect,
  };
}

export default useAgentStatus;
