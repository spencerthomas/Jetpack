# Jetpack Feedback Report

## Project Context

**Project**: JaroLoan LOS (Loan Origination System)
**Goal**: Validate Jetpack's ability to autonomously build professional-grade software with multiple agents
**Task Count**: 277 tasks defined
**Completed**: 75 tasks (27%)
**Timeline**: Multiple sessions over 2 days

---

## Executive Summary

Jetpack successfully demonstrated the ability to coordinate multiple Claude Code agents working on a complex codebase. However, several critical issues prevented full autonomous completion:

1. **Memory Management** - OOM crashes terminated sessions repeatedly
2. **Task File Corruption** - Lost progress when processes crashed
3. **Schema Validation** - Missing required fields caused early failures
4. **No Multi-Provider Support** - Cannot run Codex + Claude Code together
5. **Recovery Limitations** - No automatic recovery from crash states

---

## Critical Issues

### 1. Out-of-Memory (OOM) Crashes

**Severity**: Critical (Session-ending)

**Observed Behavior**:
- With 8 agents: OOM at ~16GB heap after ~10-15 minutes
- With 4 agents: OOM at ~16GB heap after ~25-30 minutes
- Even with `NODE_OPTIONS="--max-old-space-size=16384"`, crashes occurred

**Error Output**:
```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

**Impact**:
- Complete session termination
- All in-progress tasks left in corrupted state
- Required manual intervention to restart

**Recommendations**:
- Implement memory monitoring with proactive agent termination before OOM
- Add agent rotation/recycling to release memory periodically
- Consider spawning agents as separate processes with individual memory limits
- Add graceful degradation (reduce agent count when memory pressure detected)
- Implement checkpoint/resume functionality

---

### 2. Task File Corruption

**Severity**: Critical (Data Loss)

**Observed Behavior**:
- When OOM crash occurred, `.beads/tasks.jsonl` was sometimes:
  - Completely emptied (0 bytes)
  - Partially written (corrupted JSON)
  - Missing recent status updates

**Impact**:
- Lost record of completed tasks
- Had to restore from backup repeatedly
- Progress tracking became unreliable

**Recommendations**:
- Use atomic file writes (write to temp file, then rename)
- Maintain automatic rolling backups (not just single `.backup`)
- Use file locking during writes
- Consider SQLite or proper database for task state
- Add checksum validation on file reads

---

### 3. BeadsAdapter Schema Requirements

**Severity**: High (Session-ending)

**Observed Behavior**:
```
TypeError: Cannot read properties of undefined (reading 'length')
    at BeadsAdapter.getReadyTasks (BeadsAdapter.js:237)
```

**Root Cause**:
Tasks were missing the `blockers` field. The BeadsAdapter expected:
```json
{
  "id": "TASK-1",
  "status": "ready",
  "blockers": [],      // REQUIRED - was missing
  "dependencies": []   // REQUIRED - was missing
}
```

**Impact**:
- Had to manually fix 277 tasks with a script
- Session wouldn't start until all tasks had required fields

**Recommendations**:
- Add schema validation with helpful error messages on startup
- Provide default values for optional fields
- Document required task schema clearly
- Add `jetpack validate-tasks` command
- Auto-fix missing fields with sensible defaults

---

### 4. End State: max_failures_reached

**Severity**: Medium (Premature termination)

**Observed Behavior**:
```json
{
  "endState": "max_failures_reached",
  "tasksCompleted": 14,
  "tasksFailed": 3
}
```

Sessions ended after only 3 consecutive failures, leaving 200+ tasks unprocessed.

**Impact**:
- Required manual restart
- Lost momentum on autonomous execution

**Recommendations**:
- Make `maxConsecutiveFailures` configurable (currently seems hardcoded low)
- Add exponential backoff instead of hard stop
- Distinguish between "task failed" vs "infrastructure failed"
- Add automatic retry with different agent
- Continue with other tasks when one fails (don't count as consecutive)

---

### 5. No Multi-Provider Support

**Severity**: Medium (Feature gap)

**Observed Behavior**:
- Only `ClaudeCodeExecutor` available
- No way to configure Codex, GPT-4, or other agents
- Had to create custom `codex-worker.ts` script

**Impact**:
- Cannot leverage multiple AI providers for cost/speed optimization
- Cannot use specialized models for specific task types

**Recommendations**:
- Add pluggable executor interface
- Support Codex, GPT-4, Gemini executors
- Allow mixed agent pools (e.g., 2 Claude + 2 Codex)
- Add executor selection based on task tags/skills

---

## Medium Priority Issues

### 6. Lack of Progress Visibility

**Problem**: No real-time dashboard or status endpoint

**Observed**: Had to repeatedly run:
```bash
cat .beads/tasks.jsonl | grep -c '"status":"completed"'
```

**Recommendation**:
- Add HTTP status endpoint
- Provide real-time progress in TUI
- Add webhook notifications for milestones

---

### 7. Task Retry Logic

**Problem**: Failed tasks weren't automatically retried effectively

**Observed**: 31 tasks in "failed" status, many could likely succeed on retry

**Recommendation**:
- Add configurable retry with backoff
- Rotate failed tasks to different agents
- Track failure reasons for analysis

---

### 8. No Graceful Crash Recovery

**Problem**: After OOM, manual intervention required

**Observed Steps Required**:
1. Restore tasks.jsonl from backup
2. Reset in_progress tasks to ready
3. Manually restart Jetpack

**Recommendation**:
- Add `jetpack recover` command
- Auto-detect crash state on startup
- Prompt user to recover or start fresh

---

### 9. Agent Communication (MCP Mail)

**Problem**: Unclear if agent-to-agent communication worked

**Observed**:
```
[INFO] [MCPMail[agent-xxx]] Initializing MCP Mail adapter
[INFO] [MCPMail[agent-xxx]] MCP Mail adapter initialized
```

But no evidence of agents actually communicating/coordinating.

**Recommendation**:
- Document agent mail usage patterns
- Add examples of effective agent coordination
- Show mail activity in logs/TUI

---

## Feature Requests

### 1. Checkpoint/Resume System

```typescript
// Desired API
await orchestrator.checkpoint('checkpoint-001');
// After crash:
await orchestrator.resumeFrom('checkpoint-001');
```

### 2. Task Dependencies Visualization

```bash
jetpack deps --graph  # Show dependency tree
jetpack deps --critical-path  # Show blocking tasks
```

### 3. Cost Tracking

```typescript
config.costTracking = {
  enabled: true,
  budgetLimit: 100.00,  // USD
  alertThreshold: 0.8,
  provider: 'anthropic'
};
```

### 4. Quality Gates

```typescript
config.qualityGates = {
  minTestCoverage: 0.7,
  maxLintErrors: 0,
  requiredChecks: ['build', 'typecheck'],
  blockOnRegression: true
};
```

### 5. Parallel Task Limits by Type

```typescript
config.taskLimits = {
  'test': 1,      // Only 1 test task at a time
  'api': 4,       // Up to 4 API tasks parallel
  'ui': 2,        // Up to 2 UI tasks parallel
};
```

---

## What Worked Well

### 1. Task Schema (JSONL)
- Simple, human-readable format
- Easy to manually inspect/edit
- Good support for priorities, tags, dependencies

### 2. File Locking
- Prevented conflicts between agents
- Lease system worked as expected

### 3. Skill Detection
- Correctly identified project skills (typescript, react, nextjs, etc.)
- Helped with task routing

### 4. TUI Mode
- Good visibility into agent activity
- Helpful for debugging

### 5. Code Quality
- Generated code was generally high quality
- Followed existing patterns in codebase
- Good TypeScript types

---

## Session Statistics

| Metric | Value |
|--------|-------|
| Total Tasks | 277 |
| Completed | 75 (27%) |
| Failed | 31 (11%) |
| Remaining | 171 (62%) |
| Sessions Run | ~8 |
| OOM Crashes | 5 |
| Manual Interventions | 10+ |
| Code Generated | ~500K lines |
| Files Created/Modified | 712 |

---

## Configuration Used

```typescript
const config: JetpackConfig = {
  workDir: WORK_DIR,
  numAgents: 4,  // Reduced from 8 due to OOM
  autoStart: true,
  enableTuiMode: true,

  supervisor: {
    enabled: true,
    taskRefillThreshold: 3,
    monitorInterval: 30000,
    enableAgentMail: true,
  },

  fileLocking: {
    enabled: true,
    lockTimeout: 300000,
    retryAttempts: 3,
    retryDelay: 5000,
  },

  runtimeLimits: {
    maxTotalMinutes: 480,
    maxTaskMinutes: 60,
    maxConsecutiveFailures: 3,
  },

  qualitySettings: {
    enabled: true,
    checkBuild: true,
    checkTests: true,
    checkLint: true,
    detectRegressions: true,
  },
};
```

---

## Workarounds Created

### 1. Task Schema Fixer
```javascript
// scripts/reset-tasks.js
const fs = require('fs');
const content = fs.readFileSync('.beads/tasks.jsonl', 'utf8');
const lines = content.split('\n').filter(l => l.trim());
const fixed = lines.map(line => {
  const task = JSON.parse(line);
  if (!task.blockers) task.blockers = [];
  if (!task.dependencies) task.dependencies = [];
  return JSON.stringify(task);
});
fs.writeFileSync('.beads/tasks.jsonl', fixed.join('\n') + '\n');
```

### 2. Codex Worker Script
Created `scripts/codex-worker.ts` to run Codex agents alongside Jetpack since no native Codex support exists.

### 3. Manual Backup Strategy
```bash
cp .beads/tasks.jsonl .beads/tasks.jsonl.backup
# Run before each session
```

---

## Recommendations Summary

### Must Fix (P0)
1. OOM crash handling and prevention
2. Atomic task file writes to prevent corruption
3. Schema validation with clear error messages
4. Crash recovery mechanism

### Should Fix (P1)
1. Configurable failure thresholds
2. Multi-provider executor support
3. Better retry logic for failed tasks
4. Progress visibility/dashboard

### Nice to Have (P2)
1. Checkpoint/resume system
2. Cost tracking
3. Task dependency visualization
4. Quality gates

---

## Conclusion

Jetpack shows strong potential for autonomous multi-agent software development. The core concept works - multiple agents can coordinate to build real software. However, stability issues (OOM, file corruption) and the lack of crash recovery made it impossible to run truly autonomously for extended periods.

With the fixes outlined above, Jetpack could realistically run overnight builds of large projects without human intervention. The current state requires an operator monitoring for crashes and manually recovering.

**Recommendation**: Focus on stability and recovery before adding new features. A system that runs for 8 hours without crashing is more valuable than one with more features that crashes every 30 minutes.

---

*Report generated: 2026-01-19*
*Project: jetpack-jaro-los*
*Jetpack Version: jetpack-agent (npm)*
