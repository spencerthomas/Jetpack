import { useState, useCallback } from 'react';
import { render } from 'ink';
import type { AgentOutputBuffer, ExecutionOutputEvent } from '@jetpack/shared';

// Re-export for external usage
export { AgentDashboard } from './AgentDashboard.js';
export type { AgentDashboardProps } from './AgentDashboard.js';
export { StatusBar } from './StatusBar.js';
export type { StatusBarProps } from './StatusBar.js';
export { AgentPane } from './AgentPane.js';
export type { AgentPaneProps } from './AgentPane.js';

/**
 * Configuration for launching the TUI dashboard
 */
export interface TUIConfig {
  /** Initial agent buffers */
  initialBuffers?: Map<string, AgentOutputBuffer>;
  /** Callback to get updated agent data */
  getAgents?: () => Array<{
    id: string;
    name: string;
    status: 'idle' | 'busy' | 'error' | 'offline';
    currentTask?: string;
  }>;
  /** Callback to get task counts */
  getTaskCounts?: () => { total: number; running: number; completed: number; failed: number };
  /** Callback when user requests quit */
  onQuit?: () => void;
}

/**
 * Hook to manage TUI state
 */
export function useTUIState(config: TUIConfig = {}) {
  const [buffers, setBuffers] = useState<Map<string, AgentOutputBuffer>>(
    config.initialBuffers || new Map()
  );
  const [focusedAgent, setFocusedAgent] = useState<string | null>(null);

  const handleOutput = useCallback((event: ExecutionOutputEvent) => {
    setBuffers((prev) => {
      const next = new Map(prev);
      let buffer = next.get(event.agentId);

      if (!buffer) {
        buffer = {
          agentId: event.agentId,
          agentName: event.agentName,
          currentTaskId: event.taskId,
          currentTaskTitle: event.taskTitle,
          lines: [],
          maxLines: 100,
        };
      }

      // Update buffer
      buffer.currentTaskId = event.taskId;
      buffer.currentTaskTitle = event.taskTitle;

      const newLines = event.chunk.split('\n').filter(Boolean);
      buffer.lines = [...buffer.lines, ...newLines].slice(-buffer.maxLines);

      next.set(event.agentId, buffer);
      return next;
    });
  }, []);

  return {
    buffers,
    focusedAgent,
    setFocusedAgent,
    handleOutput,
  };
}

/**
 * Main entry point for rendering the TUI dashboard
 */
export async function renderDashboard(config: TUIConfig = {}) {
  const { AgentDashboard } = await import('./AgentDashboard.js');

  return render(
    <AgentDashboard
      initialBuffers={config.initialBuffers}
      getAgents={config.getAgents}
      getTaskCounts={config.getTaskCounts}
      onQuit={config.onQuit}
    />
  );
}
