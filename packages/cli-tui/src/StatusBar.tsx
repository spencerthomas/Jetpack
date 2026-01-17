import { Box, Text } from 'ink';

export interface StatusBarProps {
  agentCount: number;
  taskCounts: {
    total: number;
    running: number;
    completed: number;
    failed: number;
  };
  elapsedTime: string;
}

export function StatusBar({ agentCount, taskCounts, elapsedTime }: StatusBarProps) {
  return (
    <Box
      borderStyle="single"
      borderColor="cyan"
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        <Text bold color="cyan">
          Jetpack Agent Dashboard
        </Text>
      </Box>
      <Box gap={2}>
        <Text>
          <Text color="green">{agentCount}</Text>
          <Text dimColor> agents</Text>
        </Text>
        <Text>
          <Text color="yellow">{taskCounts.total}</Text>
          <Text dimColor> tasks</Text>
        </Text>
        <Text>
          <Text color="blue">{taskCounts.running}</Text>
          <Text dimColor> running</Text>
        </Text>
        <Text>
          <Text color="green">{taskCounts.completed}</Text>
          <Text dimColor> done</Text>
        </Text>
        {taskCounts.failed > 0 && (
          <Text>
            <Text color="red">{taskCounts.failed}</Text>
            <Text dimColor> failed</Text>
          </Text>
        )}
        <Text dimColor>{elapsedTime}</Text>
      </Box>
    </Box>
  );
}
