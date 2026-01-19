# @jetpack-agent/cli-tui

TUI (Terminal User Interface) dashboard for monitoring Jetpack multi-agent orchestration in real-time.

## Installation

```bash
npm install @jetpack-agent/cli-tui
```

## Quick Start

```typescript
import { renderDashboard } from '@jetpack-agent/cli-tui';

// Launch the TUI dashboard
await renderDashboard({
  getAgents: () => orchestrator.getAgents(),
  getTaskCounts: () => ({
    total: 10,
    running: 3,
    completed: 5,
    failed: 2,
  }),
  onQuit: () => {
    console.log('Dashboard closed');
    process.exit(0);
  },
});
```

## Features

- Real-time agent status monitoring
- Multi-pane layout showing all agents simultaneously
- Keyboard navigation (arrow keys, hjkl, number keys)
- Task count status bar with elapsed time
- Auto-scrolling output buffers per agent
- Responsive layout based on terminal size

## API

### `renderDashboard(config)`

Main entry point for rendering the TUI dashboard.

```typescript
interface TUIConfig {
  /** Initial agent output buffers */
  initialBuffers?: Map<string, AgentOutputBuffer>;

  /** Callback to get current agent data */
  getAgents?: () => Array<{
    id: string;
    name: string;
    status: 'idle' | 'busy' | 'error' | 'offline';
    currentTask?: string;
  }>;

  /** Callback to get task counts */
  getTaskCounts?: () => {
    total: number;
    running: number;
    completed: number;
    failed: number;
  };

  /** Callback when user requests quit */
  onQuit?: () => void;
}
```

### `useTUIState(config)`

React hook for managing TUI state programmatically.

```typescript
const { buffers, focusedAgent, setFocusedAgent, handleOutput } = useTUIState({
  initialBuffers: new Map(),
});

// Handle output from agents
handleOutput({
  agentId: 'agent-1',
  agentName: 'Agent 1',
  taskId: 'task-123',
  taskTitle: 'Build feature',
  chunk: 'Processing...\n',
});
```

### Components

Individual components can be imported for custom layouts:

```typescript
import {
  AgentDashboard,
  AgentPane,
  StatusBar
} from '@jetpack-agent/cli-tui';
```

#### `AgentDashboard`

Full dashboard component with status bar and agent panes.

#### `AgentPane`

Individual pane showing agent output, status indicator, and current task.

#### `StatusBar`

Top bar showing agent count, task counts, and elapsed time.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `q` or `Ctrl+C` | Quit dashboard |
| Arrow keys or `h/j/k/l` | Navigate between agent panes |
| `1-9` | Quick select agent by number |

## Configuration

The dashboard automatically adapts to terminal size:
- Calculates optimal column count based on terminal width
- Adjusts pane height based on number of agents
- Minimum pane dimensions: 40 characters wide, 8 lines tall

## Dependencies

- **ink** - React for CLI applications
- **react** - React runtime
- **@jetpack-agent/shared** - Shared types and utilities

## License

MIT
