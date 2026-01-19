# @jetpack-agent/cf-mail-adapter

Cloudflare Durable Objects-based messaging adapter for Jetpack multi-agent systems.

## Overview

This package provides:
- `CloudflareMailBus` - Client adapter implementing `IMailBus` interface
- `MailboxDurableObject` - Durable Object for pub/sub messaging
- `LeaseDurableObject` - Durable Object for distributed file locking

Uses WebSockets for real-time communication and Durable Objects for consistency.

## Installation

```bash
npm install @jetpack-agent/cf-mail-adapter
# or
pnpm add @jetpack-agent/cf-mail-adapter
```

## Requirements

- **Cloudflare Durable Objects**: Two DO classes for mailbox and lease management
- **WebSocket support**: For real-time message delivery

## Quick Start

### Worker Setup

```typescript
import {
  CloudflareMailBus,
  MailboxDurableObject,
  LeaseDurableObject,
} from '@jetpack-agent/cf-mail-adapter';

export interface Env {
  MAILBOX: DurableObjectNamespace;
  LEASE: DurableObjectNamespace;
}

// Export Durable Object classes
export { MailboxDurableObject, LeaseDurableObject };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const mailBus = new CloudflareMailBus({
      agentId: 'agent-001',
      mailboxDO: env.MAILBOX,
      leaseDO: env.LEASE,
    });

    await mailBus.initialize();

    // Subscribe to task assignments
    mailBus.subscribe('task_assigned', async (message) => {
      console.log('Task assigned:', message.payload);
    });

    // Publish a message
    await mailBus.publish({
      type: 'agent_ready',
      from: 'agent-001',
      payload: { skills: ['typescript', 'react'] },
    });

    // Send direct message
    await mailBus.sendTo('supervisor', {
      type: 'status_update',
      from: 'agent-001',
      payload: { status: 'idle' },
    });

    return new Response('OK');
  },
};
```

### File Locking

```typescript
// Acquire a lease before modifying a file
const acquired = await mailBus.acquireLease('src/config.ts', 30000); // 30s TTL

if (acquired) {
  try {
    // Modify the file safely
    await modifyFile('src/config.ts');
  } finally {
    await mailBus.releaseLease('src/config.ts');
  }
} else {
  // Another agent has the lease
  const status = await mailBus.isLeased('src/config.ts');
  console.log(`File locked by ${status.agentId}`);
}
```

## Wrangler Configuration

Add Durable Object bindings to your `wrangler.toml`:

```toml
name = "jetpack-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[durable_objects]
bindings = [
  { name = "MAILBOX", class_name = "MailboxDurableObject" },
  { name = "LEASE", class_name = "LeaseDurableObject" }
]

[[migrations]]
tag = "v1"
new_classes = ["MailboxDurableObject", "LeaseDurableObject"]
```

## API Reference

### CloudflareMailBus

#### Constructor

```typescript
new CloudflareMailBus(config: CloudflareMailBusConfig)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.agentId` | `string` | Unique identifier for this agent |
| `config.mailboxDO` | `DurableObjectNamespace` | Mailbox DO binding |
| `config.leaseDO` | `DurableObjectNamespace` | Lease DO binding |

#### Messaging Methods

| Method | Description |
|--------|-------------|
| `initialize()` | Connect to mailbox via WebSocket |
| `shutdown()` | Disconnect and cleanup |
| `publish(message: Message)` | Broadcast message to all subscribers |
| `sendTo(agentId: string, message: Message)` | Send direct message to agent |
| `subscribe(type: MessageType, handler)` | Subscribe to message type |
| `unsubscribe(type: MessageType, handler)` | Unsubscribe from message type |
| `acknowledge(messageId: string, agentId: string)` | Acknowledge message receipt |
| `sendHeartbeat()` | Send heartbeat message |

#### Lease Methods

| Method | Description |
|--------|-------------|
| `acquireLease(file: string, ttlMs: number)` | Acquire exclusive lease on a file |
| `releaseLease(file: string)` | Release file lease |
| `isLeased(file: string)` | Check lease status |

### Message Types

Common message types used in Jetpack:

- `task_assigned` - Task assigned to agent
- `task_completed` - Agent completed task
- `task_failed` - Agent failed task
- `agent_ready` - Agent available for work
- `status_update` - Agent status change
- `heartbeat` - Agent heartbeat
- `sync_request` - Request sync operation
- `sync_complete` - Sync completed

### LeaseStatus

```typescript
interface LeaseStatus {
  isLeased: boolean;
  agentId?: string;
  expiresAt?: number;
}
```

## Durable Objects

### MailboxDurableObject

Handles pub/sub messaging:
- WebSocket connections for real-time delivery
- Message persistence for offline agents
- Type-based subscriptions

Endpoints:
- `GET /subscribe?agentId=xxx` - WebSocket upgrade
- `POST /publish` - Broadcast message
- `POST /send` - Direct message
- `POST /acknowledge` - Acknowledge receipt

### LeaseDurableObject

Handles distributed file locking:
- Atomic lease acquisition
- TTL-based expiration with alarms
- Automatic cleanup of expired leases

Endpoints:
- `POST /acquire` - Acquire lease
- `POST /release` - Release lease
- `POST /status` - Check lease status

## Architecture

```
Agent A ──WebSocket──> MailboxDurableObject <──WebSocket── Agent B
                              │
                              │ (persisted messages)
                              ▼
                       Durable Storage

Agent A ──HTTP──> LeaseDurableObject <──HTTP── Agent B
                         │
                         │ (lease records)
                         ▼
                  Durable Storage
```

## License

MIT
