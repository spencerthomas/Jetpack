'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { PlanProgressEvent } from '@jetpack/shared';

interface UsePlanProgressOptions {
  planId: string;
  enabled?: boolean;
  onProgress?: (event: PlanProgressEvent) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

interface UsePlanProgressReturn {
  connected: boolean;
  events: PlanProgressEvent[];
  lastEvent: PlanProgressEvent | null;
  error: Error | null;
  reconnect: () => void;
}

/**
 * Hook for subscribing to real-time plan progress via SSE
 *
 * Usage:
 * ```tsx
 * const { connected, events, lastEvent } = usePlanProgress({
 *   planId: plan.id,
 *   enabled: plan.status === 'executing',
 *   onProgress: (event) => console.log('Progress:', event),
 *   onComplete: () => console.log('Plan complete!'),
 * });
 * ```
 */
export function usePlanProgress({
  planId,
  enabled = true,
  onProgress,
  onComplete,
  onError,
}: UsePlanProgressOptions): UsePlanProgressReturn {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<PlanProgressEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<PlanProgressEvent | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!enabled || !planId) return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    const url = `/api/plans/${planId}/progress`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
    };

    // Handle connection event
    eventSource.addEventListener('connected', (e) => {
      try {
        const event = JSON.parse((e as MessageEvent).data) as PlanProgressEvent;
        setLastEvent(event);
      } catch (err) {
        console.error('Failed to parse connected event:', err);
      }
    });

    // Handle progress events
    eventSource.addEventListener('progress', (e) => {
      try {
        const event = JSON.parse((e as MessageEvent).data) as PlanProgressEvent;
        setEvents((prev) => [...prev, event]);
        setLastEvent(event);
        onProgress?.(event);
      } catch (err) {
        console.error('Failed to parse progress event:', err);
      }
    });

    // Handle completion
    eventSource.addEventListener('complete', (e) => {
      try {
        const event = JSON.parse((e as MessageEvent).data) as PlanProgressEvent;
        setEvents((prev) => [...prev, event]);
        setLastEvent(event);
        onComplete?.();
      } catch (err) {
        console.error('Failed to parse complete event:', err);
      }
    });

    eventSource.onerror = () => {
      const err = new Error('SSE connection error');
      setError(err);
      setConnected(false);
      onError?.(err);

      // Close and attempt reconnect
      eventSource.close();
      eventSourceRef.current = null;

      // Reconnect after 5 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 5000);
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [planId, enabled, onProgress, onComplete, onError]);

  // Connect on mount and when dependencies change
  useEffect(() => {
    const cleanup = connect();

    return () => {
      cleanup?.();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  // Manual reconnect function
  const reconnect = useCallback(() => {
    setEvents([]);
    setLastEvent(null);
    setError(null);
    connect();
  }, [connect]);

  return {
    connected,
    events,
    lastEvent,
    error,
    reconnect,
  };
}
