# @jetpack-agent/mcp-mail-adapter

Inter-agent pub/sub messaging and file leasing for Jetpack multi-agent orchestration.

## Installation

```bash
npm install @jetpack-agent/mcp-mail-adapter
```

## Overview

MCPMailAdapter provides file-based message passing between agents with:

- **Pub/Sub messaging** - Subscribe to and publish typed messages
- **File leasing** - Prevent concurrent file modifications
- **Message archival** - Automatic archiving and deduplication
- **Graceful shutdown** - Release all resources on close

## Quick Start

```typescript
import { MCPMailAdapter } from '@jetpack-agent/mcp-mail-adapter';

// Create adapter for an agent
const mail = new MCPMailAdapter({
  mailDir: './.jetpack/mail',
  agentId: 'agent-1',
});

// Initialize (creates directories, loads state)
await mail.initialize();

// Subscribe to messages
mail.subscribe('task.created', (message) => {
  console.log('New task:', message.payload);
});

mail.subscribe('task.completed', (message) => {
  console.log('Task done:', message.payload.taskId);
});

// Publish a message
await mail.publish({
  type: 'task.claimed',
  from: 'agent-1',
  payload: { taskId: 'bd-abc123', agentName: 'Agent 1' },
  timestamp: new Date(),
});

// Broadcast to all agents
await mail.broadcast({
  type: 'agent.started',
  from: 'agent-1',
  payload: { skills: ['typescript', 'backend'] },
  timestamp: new Date(),
});

// Shutdown (releases leases, cleans up)
await mail.shutdown();
```

## File Leasing

Prevent multiple agents from modifying the same file:

```typescript
// Acquire a lease (60 second duration)
const acquired = await mail.acquireLease('src/utils/auth.ts', 60000);

if (acquired) {
  // Safe to edit the file
  console.log('Editing auth.ts...');

  // Extend lease for long operations
  await mail.renewLease('src/utils/auth.ts', 60000);

  // Release when done
  await mail.releaseLease('src/utils/auth.ts');
} else {
  console.log('File is locked by another agent');
}

// Check if file is leased
const status = await mail.isLeased('src/utils/auth.ts');
if (status.leased) {
  console.log(`Locked by: ${status.agentId}`);
}
```

## Directory Structure

The adapter creates this structure in `mailDir`:

```
.jetpack/mail/
├── inbox/
│   └── {agentId}/     # Messages for specific agent
├── outbox/            # Broadcast messages
├── archive/           # Processed messages
└── leases.json        # Active file leases
```

## API Reference

### Constructor

```typescript
new MCPMailAdapter(config: MCPMailConfig)

interface MCPMailConfig {
  mailDir: string;   // Base directory for mail storage
  agentId: string;   // Unique agent identifier
}
```

### Lifecycle Methods

| Method | Description |
|--------|-------------|
| `initialize()` | Create directories, load state, start polling |
| `shutdown()` | Release leases, stop polling, clean up |

### Messaging Methods

| Method | Description |
|--------|-------------|
| `subscribe(type, handler)` | Listen for messages of a type |
| `unsubscribe(type, handler)` | Remove message listener |
| `publish(message)` | Send message to specific agent |
| `broadcast(message)` | Send message to all agents |
| `acknowledge(messageId)` | Mark message as processed |

### File Leasing Methods

| Method | Description |
|--------|-------------|
| `acquireLease(path, durationMs)` | Lock a file (returns boolean) |
| `releaseLease(path)` | Unlock a file |
| `renewLease(path, durationMs)` | Extend lease duration |
| `isLeased(path)` | Check if file is locked |
| `releaseAllLeases()` | Release all leases for this agent |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `agentId` | string | The agent's unique identifier |

## Message Types

Standard message types from `@jetpack-agent/shared`:

```typescript
type MessageType =
  | 'task.created'
  | 'task.claimed'
  | 'task.assigned'
  | 'task.completed'
  | 'task.failed'
  | 'agent.started'
  | 'agent.stopped'
  | 'heartbeat'
  | 'file.lock'
  | 'file.unlock'
  | 'coordination.request'
  | 'coordination.response';
```

## Message Format

```typescript
interface Message {
  id: string;
  type: MessageType;
  from: string;          // Sender agent ID
  to?: string;           // Target agent (optional for broadcasts)
  payload: any;          // Message data
  timestamp: Date;
  correlationId?: string; // For request-response patterns
}
```

## Lease Behavior

- **Automatic expiry**: Leases expire after specified duration
- **Cleanup**: Expired leases removed every 60 seconds
- **Graceful shutdown**: All leases released on `shutdown()`
- **Shared state**: `leases.json` shared by all agents

## Integration with Orchestrator

```typescript
import { JetpackOrchestrator } from '@jetpack-agent/orchestrator';

const orchestrator = new JetpackOrchestrator({
  workDir: process.cwd(),
});

await orchestrator.initialize();

// Access the mail adapter
const mail = orchestrator.getMCPMailAdapter();

// Subscribe to coordination messages
mail.subscribe('coordination.request', async (msg) => {
  // Handle coordination
});
```

## Related Packages

- `@jetpack-agent/shared` - Shared types and utilities
- `@jetpack-agent/orchestrator` - Main orchestration engine
- `@jetpack-agent/cf-mail-adapter` - Cloudflare Durable Objects version

## License

MIT
