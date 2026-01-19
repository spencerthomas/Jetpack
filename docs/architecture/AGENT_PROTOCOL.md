# Jetpack Agent Protocol Specification

**Version**: 1.0.0
**Status**: Draft
**Date**: 2026-01-19

---

## Overview

The Jetpack Agent Protocol defines how autonomous agents interact with the Jetpack swarm infrastructure. This protocol is:

- **Language-agnostic**: Can be implemented in any programming language
- **Model-agnostic**: Works with any AI backend (Claude, Codex, Gemini, custom)
- **Transport-agnostic**: Supports direct DB, HTTP API, or file-based communication

---

## Design Principles

1. **Agents are autonomous**: Agents make their own decisions about which tasks to claim
2. **State is external**: Agents don't store coordination state; it lives in the data layer
3. **Failures are expected**: Protocol handles crashes, timeouts, and retries gracefully
4. **Horizontal scaling**: Protocol allows unlimited agents without coordination overhead

---

## Protocol Operations

### 1. REGISTER

Agent announces its presence and capabilities to the swarm.

**Request**:
```typescript
interface RegisterRequest {
  operation: 'REGISTER';
  agent: {
    id: string;           // Unique agent identifier (usually UUID)
    name: string;         // Human-readable name
    type: AgentType;      // 'claude-code' | 'codex' | 'gemini' | 'browser' | 'custom'
    capabilities: {
      skills: string[];   // e.g., ['typescript', 'react', 'testing']
      maxTaskMinutes: number;
      canRunTests: boolean;
      canRunBuild: boolean;
      canAccessBrowser: boolean;
    };
    machine?: {
      id: string;         // Machine identifier (for distributed setups)
      hostname: string;
      pid: number;
    };
  };
}
```

**Response**:
```typescript
interface RegisterResponse {
  success: boolean;
  registeredAt: string;   // ISO timestamp
  error?: string;
}
```

**Behavior**:
- If agent ID already exists and last heartbeat is stale (>2 minutes), re-register
- If agent ID exists and is active, reject with error
- Record registration timestamp

---

### 2. HEARTBEAT

Agent reports it's alive and its current status.

**Request**:
```typescript
interface HeartbeatRequest {
  operation: 'HEARTBEAT';
  agentId: string;
  status: AgentStatus;    // 'idle' | 'busy' | 'error'
  currentTask?: {
    id: string;
    progress?: number;    // 0-100
    phase?: string;       // 'analyzing' | 'implementing' | 'testing'
  };
  metrics?: {
    memoryUsedMB: number;
    tasksCompletedSession: number;
  };
}
```

**Response**:
```typescript
interface HeartbeatResponse {
  success: boolean;
  timestamp: string;
  commands?: Command[];   // Optional commands from coordinator
}

type Command =
  | { type: 'SHUTDOWN'; reason: string }
  | { type: 'RELEASE_TASK'; taskId: string; reason: string }
  | { type: 'PING' };
```

**Behavior**:
- Update `last_heartbeat` timestamp for agent
- If agent has current task, update task progress
- Coordinator may include commands (e.g., shutdown for maintenance)

**Frequency**: Every 30 seconds when idle, every 10 seconds when busy

---

### 3. CLAIM

Agent requests a task matching its capabilities.

**Request**:
```typescript
interface ClaimRequest {
  operation: 'CLAIM';
  agentId: string;
  filter?: {
    skills?: string[];        // Only tasks requiring these skills
    priorities?: Priority[];  // Only these priority levels
    types?: TaskType[];       // Only these task types
    excludeIds?: string[];    // Don't claim these (previously failed)
    maxMinutes?: number;      // Estimated time limit
  };
}
```

**Response**:
```typescript
interface ClaimResponse {
  success: boolean;
  task?: Task;
  reason?: string;  // If no task: 'no_matching_tasks' | 'all_tasks_claimed'
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'claimed';
  priority: Priority;
  type: TaskType;

  // Requirements
  requiredSkills: string[];
  estimatedMinutes?: number;

  // Context
  files?: string[];           // Files likely to be modified
  dependencies?: string[];    // Task IDs that must complete first

  // For retry tracking
  retryCount: number;
  previousAgents?: string[];  // Agents that previously failed this task
  lastError?: string;

  // Branch context
  branch?: string;

  // Timestamps
  createdAt: string;
  claimedAt: string;
}
```

**Claim Algorithm**:
```sql
-- Atomic claim query
UPDATE tasks
SET status = 'claimed',
    assigned_agent = :agentId,
    claimed_at = CURRENT_TIMESTAMP
WHERE id = (
  SELECT id FROM tasks
  WHERE status = 'ready'
    AND (required_skills IS NULL OR :agentSkills LIKE '%' || required_skills || '%')
    AND id NOT IN (:excludeIds)
    -- Check dependencies are complete
    AND NOT EXISTS (
      SELECT 1 FROM json_each(dependencies) AS dep
      WHERE dep.value IN (
        SELECT id FROM tasks WHERE status != 'completed'
      )
    )
  ORDER BY
    CASE priority
      WHEN 'critical' THEN 0
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 3
    END,
    created_at ASC
  LIMIT 1
)
RETURNING *;
```

**Behavior**:
- Query returns one task atomically claimed to this agent
- If no matching tasks, return `success: false` with reason
- Agent should wait before retrying (30 seconds recommended)

---

### 4. PROGRESS

Agent reports progress on current task.

**Request**:
```typescript
interface ProgressRequest {
  operation: 'PROGRESS';
  agentId: string;
  taskId: string;
  progress: {
    phase: TaskPhase;     // 'analyzing' | 'planning' | 'implementing' | 'testing' | 'reviewing'
    percentComplete: number;
    description: string;  // Human-readable status
    filesModified?: string[];
  };
}

type TaskPhase =
  | 'analyzing'     // Reading code, understanding requirements
  | 'planning'      // Designing solution
  | 'implementing'  // Writing code
  | 'testing'       // Running tests
  | 'reviewing';    // Final checks
```

**Response**:
```typescript
interface ProgressResponse {
  success: boolean;
  continue: boolean;  // If false, agent should abort task
  reason?: string;
}
```

**Behavior**:
- Update task progress in database
- Broadcast progress event to dashboards
- If task was reassigned (timeout recovery), return `continue: false`

---

### 5. COMPLETE

Agent marks task as successfully completed.

**Request**:
```typescript
interface CompleteRequest {
  operation: 'COMPLETE';
  agentId: string;
  taskId: string;
  result: {
    filesCreated: string[];
    filesModified: string[];
    filesDeleted: string[];
    summary: string;        // What was accomplished
    learnings?: string[];   // Insights for memory
  };
  qualityMetrics?: {
    testsRan: number;
    testsPassed: number;
    lintErrors: number;
    typeErrors: number;
    buildSuccess: boolean;
  };
}
```

**Response**:
```typescript
interface CompleteResponse {
  success: boolean;
  qualityGatePassed: boolean;
  regressions?: Regression[];
  nextAction?: 'proceed' | 'fix_regressions' | 'manual_review';
}
```

**Behavior**:
1. Record quality metrics snapshot
2. Run regression detection against baseline
3. If regressions found, task may be marked as needs_review instead of completed
4. Update task status to `completed`
5. Release any file leases held by agent for this task
6. Broadcast completion event
7. Store learnings in memory (CASS)

---

### 6. FAIL

Agent marks task as failed.

**Request**:
```typescript
interface FailRequest {
  operation: 'FAIL';
  agentId: string;
  taskId: string;
  failure: {
    type: FailureType;
    message: string;
    details?: string;       // Stack trace, logs, etc.
    recoverable: boolean;   // Can another agent retry?
    suggestedAction?: string;
  };
}

type FailureType =
  | 'task_error'        // Task threw an error during execution
  | 'task_timeout'      // Task exceeded time limit
  | 'dependency_error'  // Required dependency missing/failed
  | 'quality_failure'   // Quality gates not met
  | 'resource_error'    // File locked, permission denied, etc.
  | 'agent_crash';      // Agent itself had issues
```

**Response**:
```typescript
interface FailResponse {
  success: boolean;
  willRetry: boolean;
  nextAgent?: string;     // If being reassigned
  retryAfter?: number;    // Milliseconds until retry
}
```

**Behavior**:
1. Record failure details
2. Increment retry count
3. If under max retries and recoverable:
   - Add current agent to `previousAgents` list
   - Set status to `pending_retry`
   - Calculate backoff: `min(30s * 2^retryCount, 5m)`
4. If over max retries or not recoverable:
   - Set status to `failed`
5. Release file leases
6. Broadcast failure event

---

### 7. SEND_MESSAGE

Agent sends a message to another agent or broadcasts.

**Request**:
```typescript
interface SendMessageRequest {
  operation: 'SEND_MESSAGE';
  agentId: string;
  message: {
    to?: string;          // Target agent ID, or null for broadcast
    type: MessageType;
    payload: unknown;
    ackRequired?: boolean;
    expiresIn?: number;   // Milliseconds
  };
}

type MessageType =
  | 'task.help_needed'    // Agent needs assistance
  | 'task.handoff'        // Transfer task to another agent
  | 'file.lock_request'   // Request to access locked file
  | 'coordination.sync'   // Coordination message
  | 'info.discovery'      // Share discovered information
  | 'custom';             // Custom message type
```

**Response**:
```typescript
interface SendMessageResponse {
  success: boolean;
  messageId: string;
}
```

---

### 8. RECEIVE_MESSAGES

Agent retrieves pending messages.

**Request**:
```typescript
interface ReceiveMessagesRequest {
  operation: 'RECEIVE_MESSAGES';
  agentId: string;
  since?: string;         // Only messages after this timestamp
  types?: MessageType[];  // Filter by type
  limit?: number;         // Max messages to return
}
```

**Response**:
```typescript
interface ReceiveMessagesResponse {
  success: boolean;
  messages: Message[];
}

interface Message {
  id: string;
  from: string;
  to: string | null;
  type: MessageType;
  payload: unknown;
  ackRequired: boolean;
  createdAt: string;
}
```

**Behavior**:
- Return messages directed to this agent OR broadcasts
- Order by creation time ascending
- Mark as delivered (but not acknowledged)

---

### 9. ACQUIRE_LEASE

Agent requests exclusive access to a file.

**Request**:
```typescript
interface AcquireLeaseRequest {
  operation: 'ACQUIRE_LEASE';
  agentId: string;
  taskId: string;
  filePath: string;
  durationMs: number;     // How long to hold lease
}
```

**Response**:
```typescript
interface AcquireLeaseResponse {
  success: boolean;
  lease?: {
    filePath: string;
    expiresAt: string;
  };
  heldBy?: string;        // If failed, who holds it
  heldUntil?: string;     // When their lease expires
}
```

**Behavior**:
- If file not leased, grant lease
- If file leased by same agent, extend lease
- If file leased by different agent and not expired, reject
- If file leased but expired, grant (previous agent presumed dead)

---

### 10. RELEASE_LEASE

Agent releases a file lock.

**Request**:
```typescript
interface ReleaseLeaseRequest {
  operation: 'RELEASE_LEASE';
  agentId: string;
  filePath: string;
}
```

**Response**:
```typescript
interface ReleaseLeaseResponse {
  success: boolean;
}
```

---

## Protocol Transports

### Direct Database Access

Agents connect directly to SQLite/Turso and execute operations:

```typescript
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.JETPACK_DB_URL,
  authToken: process.env.JETPACK_DB_TOKEN,
});

// Claim task
const task = await db.execute({
  sql: `UPDATE tasks SET ... WHERE ... RETURNING *`,
  args: [agentId],
});
```

**Pros**: Lowest latency, simplest setup
**Cons**: Requires DB access from agent machine

### HTTP API

Coordinator exposes REST API implementing all operations:

```
POST /api/v1/agents/register
POST /api/v1/agents/:id/heartbeat
POST /api/v1/tasks/claim
POST /api/v1/tasks/:id/progress
POST /api/v1/tasks/:id/complete
POST /api/v1/tasks/:id/fail
POST /api/v1/messages
GET  /api/v1/messages
POST /api/v1/leases/acquire
POST /api/v1/leases/release
```

**Pros**: Works through firewalls, coordinator handles DB
**Cons**: Additional latency, coordinator must be running

### File-Based (Fallback)

For environments where neither is available:

```
.jetpack/
├── protocol/
│   ├── requests/           # Agents write request files
│   │   ├── agent-001-claim.json
│   │   └── agent-002-complete.json
│   └── responses/          # Coordinator writes responses
│       ├── agent-001-claim-response.json
│       └── agent-002-complete-response.json
```

**Pros**: Works anywhere with shared filesystem
**Cons**: Higher latency, requires polling

---

## Error Handling

### Transient Errors

Agents should retry with exponential backoff:

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(baseDelay * Math.pow(2, i));
    }
  }
  throw new Error('Max retries exceeded');
}
```

### Permanent Errors

If operation fails with permanent error:

| Error | Agent Action |
|-------|--------------|
| `agent_not_registered` | Re-register |
| `task_not_found` | Claim new task |
| `task_already_claimed` | Claim new task |
| `invalid_operation` | Log error, continue |
| `db_unavailable` | Wait and retry |

---

## Security Considerations

### Agent Authentication

In production, agents should authenticate:

```typescript
interface AuthenticatedRequest {
  agentId: string;
  signature: string;      // HMAC of request body
  timestamp: string;      // Prevent replay attacks
}
```

### Rate Limiting

Coordinator should rate limit operations:

| Operation | Limit |
|-----------|-------|
| REGISTER | 10/minute per IP |
| HEARTBEAT | 12/minute per agent |
| CLAIM | 30/minute per agent |
| Other | 60/minute per agent |

### Lease Security

Leases should be validated:
- Agent can only release their own leases
- Lease duration capped (e.g., max 1 hour)
- Coordinator auto-releases expired leases

---

## Implementation Checklist

### Agent Implementation

- [ ] Generate unique agent ID on start
- [ ] Register with capabilities
- [ ] Start heartbeat loop (30s interval)
- [ ] Implement work loop (claim -> execute -> complete/fail)
- [ ] Handle graceful shutdown (release leases, deregister)
- [ ] Implement retry logic for transient errors
- [ ] Log all operations for debugging

### Coordinator Implementation

- [ ] Expose protocol operations (DB or API)
- [ ] Monitor agent health (stale heartbeats)
- [ ] Auto-release expired leases
- [ ] Run quality gates on completion
- [ ] Broadcast events to dashboards
- [ ] Clean up stale data periodically

---

## Versioning

Protocol version is included in all requests:

```typescript
interface ProtocolRequest {
  protocolVersion: '1.0';
  operation: string;
  // ...
}
```

Coordinator should reject requests with unsupported versions.

Future versions will maintain backward compatibility where possible.
