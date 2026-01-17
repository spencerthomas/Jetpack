import { Box, Text } from 'ink';
import type { AgentOutputBuffer } from '@jetpack/shared';

export interface AgentPaneProps {
  buffer: AgentOutputBuffer;
  status: 'idle' | 'busy' | 'error' | 'offline';
  focused?: boolean;
  height?: number;
}

const statusColors: Record<string, string> = {
  idle: 'gray',
  busy: 'green',
  error: 'red',
  offline: 'yellow',
};

const statusSymbols: Record<string, string> = {
  idle: '○',
  busy: '●',
  error: '✖',
  offline: '◌',
};

export function AgentPane({ buffer, status, focused = false, height = 10 }: AgentPaneProps) {
  const borderColor = focused ? 'cyan' : 'gray';
  const statusColor = statusColors[status] || 'gray';
  const statusSymbol = statusSymbols[status] || '?';

  // Get the last N lines to display
  const displayLines = buffer.lines.slice(-(height - 4));

  return (
    <Box
      flexDirection="column"
      borderStyle={focused ? 'double' : 'single'}
      borderColor={borderColor}
      width="100%"
      height={height}
    >
      {/* Header */}
      <Box paddingX={1} justifyContent="space-between">
        <Box gap={1}>
          <Text color={statusColor}>{statusSymbol}</Text>
          <Text bold color={focused ? 'cyan' : undefined}>
            {buffer.agentName}
          </Text>
        </Box>
        <Text dimColor>[{status}]</Text>
      </Box>

      {/* Current task */}
      {buffer.currentTaskTitle ? (
        <Box paddingX={1}>
          <Text dimColor>Task: </Text>
          <Text color="yellow" wrap="truncate">
            {buffer.currentTaskTitle}
          </Text>
        </Box>
      ) : (
        <Box paddingX={1}>
          <Text dimColor italic>
            Waiting for tasks...
          </Text>
        </Box>
      )}

      {/* Output lines */}
      <Box flexDirection="column" paddingX={1} flexGrow={1} overflow="hidden">
        {displayLines.length === 0 ? (
          <Text dimColor italic>
            No output yet
          </Text>
        ) : (
          displayLines.map((line, i) => (
            <Text key={i} wrap="truncate-end" dimColor={!focused}>
              {line.slice(0, 120)}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}
