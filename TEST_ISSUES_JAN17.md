# Jetpack Test Issues - January 17, 2026

**Test Project:** `/Users/tomspencer/dev/jetpack-test-linear`

---

## Issue 1: Deprecated Claude Model (CRITICAL) - FIXED ✅

**Error:**
```
The model 'claude-3-5-sonnet-20241022' is deprecated and will reach end-of-life on October 22, 2025
```

**Fix Applied:** Updated default model to `claude-sonnet-4-20250514` in:
- `apps/cli/src/index.ts` (supervise, start, config commands)

---

## Issue 2: State Reducer Error on Planner Failure (MEDIUM) - FIXED ✅

**Error:**
```
TypeError: newIds is not iterable
```

**Fix Applied:** Added null safety to state reducers in `packages/supervisor/src/graph/state.ts`

---

## Issue 3: Agent-Supervisor Timing (CRITICAL) - FIXED ✅

**Behavior:**
- MonitorNode loops too fast (no delay between checks)
- Hits recursion limit of 25 iterations before agents can complete tasks

**Fixes Applied:**
1. Added delay between monitor iterations using `pollIntervalMs` (now actually used!)
2. Increased default `pollIntervalMs` from 2000ms to 15000ms (15 seconds)
3. Set `recursionLimit = maxIterations * 3` to allow full run
4. Monitor now waits between progress checks

**Files Changed:**
- `packages/supervisor/src/graph/nodes/MonitorNode.ts` - Added wait
- `packages/supervisor/src/SupervisorAgent.ts` - Set recursionLimit and increased pollInterval

---

## Issue 4: AssignerNode Sets Status to 'claimed' (CRITICAL) - FIXED ✅

**Behavior:**
- AssignerNode was setting `status: 'claimed'` when assigning tasks
- `getReadyTasks()` only returns tasks with status 'pending' or 'ready'
- AgentControllers couldn't see the tasks because they were 'claimed'

**Fix Applied:**
- Removed `status: 'claimed'` from AssignerNode's updateTask call
- AssignerNode now only sets `assignedAgent`, leaves status as 'ready'
- The actual AgentController will change status to 'claimed' when it picks up the task

**File Changed:** `packages/supervisor/src/graph/nodes/AssignerNode.ts`

---

## Issue 5: Agents Not Receiving Task Notifications (CRITICAL) - FIXED ✅

**Behavior:**
- Supervisor creates tasks and assigns them to agents
- Agents never start working (0/N tasks completed forever)
- MonitorNode loops showing no progress

**Root Causes Found:**

1. **Agent mail stored by name, looked up by ID:**
   - `JetpackOrchestrator.startAgents()` stored mail adapters in `agentMails` map with key `agent-1` (name)
   - `createSupervisor()` looks up with `getAgentMail(agentId)` where agentId is `agent-6ff3b3bd` (hash)
   - Result: `getAgentMail()` always returned `undefined`, so `task.assigned` messages were never sent

2. **Agents not subscribed to `task.assigned`:**
   - AssignerNode publishes `task.assigned` messages
   - AgentController only subscribed to `task.created` and `task.updated`
   - Even if messages were sent, agents wouldn't receive them

**Fixes Applied:**
1. Store agent mail adapters by ID (not name) in `JetpackOrchestrator.ts`
2. Add `task.assigned` subscription and handler in `AgentController.ts`

**Files Changed:**
- `packages/orchestrator/src/JetpackOrchestrator.ts` - Store mail by agent ID
- `packages/orchestrator/src/AgentController.ts` - Subscribe to task.assigned

---

## Issue 6: Null Reference in Final Report Generation (MINOR) - FIXED ✅

**Error:**
```
TypeError: Cannot read properties of undefined (reading 'length')
at SupervisorAgent.execute
```

**Root Cause:**
- `finalState` from LangGraph may have undefined array fields even with defaults
- Direct access to `finalState.completedTaskIds.length` etc. fails

**Fix Applied:**
- Added null safety to `execute()` and `generateFinalReport()` in SupervisorAgent.ts
- All array accesses now use `|| []` fallback

**File Changed:** `packages/supervisor/src/SupervisorAgent.ts`

---

## Status

- [x] Fix Issue 1: Update Claude model names
- [x] Fix Issue 2: Add null safety to state reducer
- [x] Fix Issue 3: Agent-Supervisor timing (added poll delay)
- [x] Fix Issue 4: AssignerNode status bug
- [x] Fix Issue 5: Agents not receiving task notifications
- [x] Fix Issue 6: Null reference in final report generation
