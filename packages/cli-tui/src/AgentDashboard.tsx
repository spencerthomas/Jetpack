import { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import type { AgentOutputBuffer } from '@jetpack-agent/shared';
import { StatusBar } from './StatusBar.js';
import { AgentPane } from './AgentPane.js';

export interface AgentDashboardProps {
  initialBuffers?: Map<string, AgentOutputBuffer>;
  getAgents?: () => Array<{
    id: string;
    name: string;
    status: 'idle' | 'busy' | 'error' | 'offline';
    currentTask?: string;
  }>;
  getTaskCounts?: () => { total: number; running: number; completed: number; failed: number };
  onQuit?: () => void;
}

function formatElapsed(startTime: Date): string {
  const elapsed = Date.now() - startTime.getTime();
  const hours = Math.floor(elapsed / 3600000);
  const minutes = Math.floor((elapsed % 3600000) / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}

export function AgentDashboard({
  initialBuffers,
  getAgents,
  getTaskCounts,
  onQuit,
}: AgentDashboardProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [startTime] = useState(() => new Date());
  const [elapsedTime, setElapsedTime] = useState('0m 0s');
  const [focusIndex, setFocusIndex] = useState(0);
  const [buffers] = useState<Map<string, AgentOutputBuffer>>(
    initialBuffers || new Map()
  );
  const [agents, setAgents] = useState<
    Array<{
      id: string;
      name: string;
      status: 'idle' | 'busy' | 'error' | 'offline';
      currentTask?: string;
    }>
  >([]);
  const [taskCounts, setTaskCounts] = useState({
    total: 0,
    running: 0,
    completed: 0,
    failed: 0,
  });

  // Calculate terminal dimensions
  const termHeight = stdout?.rows || 24;
  const termWidth = stdout?.columns || 80;

  // Calculate number of columns based on width and number of agents
  const numAgents = Math.max(buffers.size, 1);
  const numColumns = Math.min(numAgents, Math.floor(termWidth / 40));
  const numRows = Math.ceil(numAgents / numColumns);
  const paneHeight = Math.max(8, Math.floor((termHeight - 6) / numRows));

  // Update elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(formatElapsed(startTime));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  // Poll for agent and task updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (getAgents) {
        setAgents(getAgents());
      }
      if (getTaskCounts) {
        setTaskCounts(getTaskCounts());
      }
    }, 500);
    return () => clearInterval(interval);
  }, [getAgents, getTaskCounts]);

  // Handle keyboard input
  useInput((input, key) => {
    const agentIds = Array.from(buffers.keys());

    if (input === 'q' || (key.ctrl && input === 'c')) {
      if (onQuit) {
        onQuit();
      }
      exit();
    }

    // Arrow keys or h/j/k/l for navigation
    if (key.leftArrow || input === 'h') {
      setFocusIndex((prev) => Math.max(0, prev - 1));
    }
    if (key.rightArrow || input === 'l') {
      setFocusIndex((prev) => Math.min(agentIds.length - 1, prev + 1));
    }
    if (key.upArrow || input === 'k') {
      setFocusIndex((prev) => Math.max(0, prev - numColumns));
    }
    if (key.downArrow || input === 'j') {
      setFocusIndex((prev) => Math.min(agentIds.length - 1, prev + numColumns));
    }

    // Number keys for quick selection (1-9)
    const num = parseInt(input, 10);
    if (num >= 1 && num <= 9 && num <= agentIds.length) {
      setFocusIndex(num - 1);
    }
  });

  const agentIds = Array.from(buffers.keys());
  const agentStatusMap = new Map(agents.map((a) => [a.id, a.status]));

  // Organize agents into rows
  const rows: string[][] = [];
  for (let i = 0; i < agentIds.length; i += numColumns) {
    rows.push(agentIds.slice(i, i + numColumns));
  }

  return (
    <Box flexDirection="column" height={termHeight}>
      {/* Status bar */}
      <StatusBar
        agentCount={buffers.size}
        taskCounts={taskCounts}
        elapsedTime={elapsedTime}
      />

      {/* Agent panes */}
      <Box flexDirection="column" flexGrow={1}>
        {rows.map((row, rowIdx) => (
          <Box key={rowIdx} flexDirection="row" width="100%">
            {row.map((agentId, colIdx) => {
              const globalIdx = rowIdx * numColumns + colIdx;
              const buffer = buffers.get(agentId);
              if (!buffer) return null;

              return (
                <Box key={agentId} flexGrow={1} width={`${100 / numColumns}%`}>
                  <AgentPane
                    buffer={buffer}
                    status={agentStatusMap.get(agentId) || 'offline'}
                    focused={globalIdx === focusIndex}
                    height={paneHeight}
                  />
                </Box>
              );
            })}
          </Box>
        ))}

        {/* Show placeholder if no agents */}
        {buffers.size === 0 && (
          <Box
            flexGrow={1}
            justifyContent="center"
            alignItems="center"
            borderStyle="single"
            borderColor="gray"
          >
            <Text dimColor italic>
              Waiting for agents to start...
            </Text>
          </Box>
        )}
      </Box>

      {/* Help bar */}
      <Box paddingX={1} gap={2}>
        <Text dimColor>[q] quit</Text>
        <Text dimColor>[←→↑↓/hjkl] navigate</Text>
        <Text dimColor>[1-9] select agent</Text>
      </Box>
    </Box>
  );
}

/**
 * Create a dashboard controller that can be updated externally
 */
export function createDashboardController() {
  let updateBuffers: ((buffers: Map<string, AgentOutputBuffer>) => void) | null = null;
  let updateAgents:
    | ((
        agents: Array<{
          id: string;
          name: string;
          status: 'idle' | 'busy' | 'error' | 'offline';
        }>
      ) => void)
    | null = null;

  return {
    setBufferUpdater: (fn: typeof updateBuffers) => {
      updateBuffers = fn;
    },
    setAgentUpdater: (fn: typeof updateAgents) => {
      updateAgents = fn;
    },
    updateBuffers: (buffers: Map<string, AgentOutputBuffer>) => {
      if (updateBuffers) updateBuffers(buffers);
    },
    updateAgents: (
      agents: Array<{
        id: string;
        name: string;
        status: 'idle' | 'busy' | 'error' | 'offline';
      }>
    ) => {
      if (updateAgents) updateAgents(agents);
    },
  };
}
