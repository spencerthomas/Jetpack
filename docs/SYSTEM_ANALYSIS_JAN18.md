# Jetpack System Analysis - January 18, 2026

## Executive Summary

Jetpack is a multi-agent orchestration system that coordinates AI agents to execute complex software development tasks. After extensive stress testing and architecture work, the system is functional but has several areas requiring attention before production readiness.

---

## Current System State

### Packages (16 total)

| Package | Purpose | Status |
|---------|---------|--------|
| `orchestrator` | AgentController, ClaudeCodeExecutor, JetpackOrchestrator | ⚠️ Memory leaks identified |
| `supervisor` | LangGraph-based task planning and assignment | ✅ Working |
| `beads-adapter` | Local SQLite task storage | ✅ Working |
| `cass-adapter` | Local SQLite memory/knowledge storage | ⚠️ Performance issues |
| `mcp-mail-adapter` | Local file-based messaging | ✅ Working |
| `shared` | Types, interfaces, utilities | ✅ Complete |
| `cf-beads-adapter` | Cloudflare D1 task storage | ✅ Complete |
| `cf-mail-adapter` | Cloudflare DO messaging | ✅ Complete |
| `cf-cass-adapter` | Cloudflare D1+Vectorize memory | ✅ Complete |
| `worker-api` | Cloudflare Worker REST API | ✅ Deployed |
| `cli-tui` | Terminal UI | ✅ Working |
| `jetpack-agent` | Agent implementation | ✅ Working |
| `mcp-server` | MCP protocol server | ✅ Working |
| `quality-adapter` | Code quality checking | ✅ Working |
| `browser-validator` | Browser-based validation | ✅ Working |

### Infrastructure

| Component | Location | Status |
|-----------|----------|--------|
| D1 Database | `jetpack-db` | ✅ Deployed |
| Vectorize Index | `jetpack-memories` | ✅ Deployed |
| Worker API | `jetpack-api.cbrohn.workers.dev` | ✅ Deployed & Tested |
| Durable Objects | MailboxDO, LeaseDO | ✅ Deployed |

---

## Completed Work

### Phase 1: Memory Leak Fixes ✅
- Bounded stdout/stderr concatenation in ClaudeCodeExecutor
- AgentOutputBuffer cleanup
- currentContext reference clearing
- Mail listener unsubscription
- CASS streaming search optimization

### Phase 2: Cloudflare Adapters ✅
- Created `cf-beads-adapter` (CloudflareTaskStore)
- Created `cf-mail-adapter` (CloudflareMailBus, MailboxDO, LeaseDO)
- Created `cf-cass-adapter` (CloudflareMemoryStore)
- Created `worker-api` with full REST API
- Deployed to Cloudflare with D1 + Vectorize + Durable Objects

### Bug Fixes (TEST_ISSUES_JAN17) ✅
- Issue 1: Updated deprecated Claude model
- Issue 2: State reducer null safety
- Issue 3: Agent-Supervisor timing (poll interval)
- Issue 4: AssignerNode status bug
- Issue 5: Agents not receiving task notifications
- Issue 6: Null reference in final report

---

## Outstanding Issues

### From Stress Test (STRESS_TEST_NOTES_JAN17)

| Bug | Severity | Status | Description |
|-----|----------|--------|-------------|
| BUG-1 | MEDIUM | ❌ Open | MaxListenersExceededWarning (memory leak potential) |
| BUG-2 | LOW | ❌ Open | No embedding generator for CASS |
| BUG-3 | MEDIUM | ❌ Open | Missing backend skill detection |
| BUG-5 | **HIGH** | ❌ Open | Agent underutilization (40-60% efficiency) |
| BUG-6 | MEDIUM | ❌ Open | 30-minute timeout too short for complex tasks |
| BUG-7 | MEDIUM | ❌ Open | Exit code 143 (SIGTERM) handling |

### Architecture Gaps

| Gap | Impact | Description |
|-----|--------|-------------|
| No hybrid mode config | HIGH | Can't switch between local/edge adapters |
| No local↔edge sync | HIGH | State doesn't sync between modes |
| Public API exposure | MEDIUM | Worker API is publicly accessible |
| No proactive work polling | HIGH | Agents wait for messages, don't poll for work |

---

## Recommended Phases

### Phase 3: Agent Reliability (HIGH PRIORITY)

**Goal:** Fix the 40-60% agent utilization problem identified in stress testing.

**Tasks:**
1. **Add periodic work polling** - Agents poll `getReadyTasks()` every 30s
2. **Batch task assignment** - AssignerNode assigns all ready tasks in one pass
3. **Configurable timeouts** - Per-task timeout based on `estimatedMinutes`
4. **Graceful shutdown** - SIGINT before SIGTERM, cleanup handlers
5. **MaxListeners fix** - Set `EventEmitter.defaultMaxListeners = 50`

**Files to modify:**
- `packages/orchestrator/src/AgentController.ts`
- `packages/supervisor/src/graph/nodes/AssignerNode.ts`
- `packages/orchestrator/src/ClaudeCodeExecutor.ts`
- `packages/orchestrator/src/JetpackOrchestrator.ts`

**Success criteria:**
- 5 agents achieve >80% utilization
- No stuck tasks (all assigned tasks execute)
- Clean shutdown without SIGTERM errors

---

### Phase 4: Hybrid Mode Configuration (MEDIUM PRIORITY)

**Goal:** Enable seamless switching between local and Cloudflare adapters.

**Tasks:**
1. **Create adapter factory** - `createAdapters(config: HybridAdapterConfig)`
2. **Add CLI flags** - `jetpack start --mode=hybrid --cloudflare-url=...`
3. **Environment config** - `.env` support for Cloudflare credentials
4. **Local development mode** - Use `wrangler dev --remote` for localhost access

**Files to create/modify:**
- `packages/shared/src/adapters/factory.ts` (new)
- `packages/orchestrator/src/JetpackOrchestrator.ts`
- `apps/cli/src/commands/start.ts`

**Success criteria:**
- `jetpack start --mode=local` uses SQLite adapters
- `jetpack start --mode=edge` uses Cloudflare adapters
- `jetpack start --mode=hybrid` uses mixed adapters

---

### Phase 5: Local↔Edge State Sync (MEDIUM PRIORITY)

**Goal:** Enable state synchronization between local and edge.

**Tasks:**
1. **Bidirectional sync** - Push local changes to edge, pull edge changes
2. **Conflict resolution** - Last-write-wins or merge strategy
3. **Offline support** - Queue changes when edge unavailable
4. **Incremental sync** - Only sync changed records

**Architecture decision needed:**
- Option A: HTTP polling (simple, higher latency)
- Option B: WebSocket real-time (complex, lower latency)
- Option C: Event sourcing (most complex, best consistency)

---

### Phase 6: Security Hardening (LOW PRIORITY until hybrid mode used)

**Goal:** Remove public API exposure, use bindings where possible.

**Tasks:**
1. **localhost-only API** - Run `wrangler dev` locally, no public endpoint
2. **API authentication** - Require API_TOKEN for production
3. **Rate limiting** - Prevent abuse
4. **Audit logging** - Track all state changes

---

### Phase 7: Observability (LOW PRIORITY)

**Goal:** Better monitoring and debugging.

**Tasks:**
1. **CASS embeddings** - Configure embedding provider
2. **Skill detection** - Recognize backend/testing skills
3. **Metrics export** - Prometheus/OpenTelemetry
4. **Dashboard** - Real-time agent status

---

## Recommended Execution Order

```
NOW ─────────────────────────────────────────────────────────────────────▶

Phase 3: Agent Reliability     ████████████████░░░░  (1-2 weeks)
  - Fix BUG-5 (underutilization)    [HIGH]
  - Fix BUG-6 (timeouts)            [MEDIUM]
  - Fix BUG-7 (SIGTERM)             [MEDIUM]
  - Fix BUG-1 (MaxListeners)        [MEDIUM]

Phase 4: Hybrid Mode Config    ░░░░░░░░████████████  (1 week)
  - Adapter factory
  - CLI flags
  - Environment config

Phase 5: State Sync            ░░░░░░░░░░░░░░░░████████  (2 weeks)
  - Bidirectional sync
  - Conflict resolution
  - Offline support

Phases 6-7: Security & Observability  (as needed)
```

---

## Immediate Action Items

1. **Start Phase 3** - Agent reliability is the highest-impact work
2. **Create beads issues** - Track each bug fix as a beads issue
3. **Set up memory profiling** - Validate memory leak fixes are holding
4. **Document hybrid architecture decision** - localhost vs public API

---

## Questions for Stakeholder

1. **Hybrid mode priority:** Is local→edge sync needed, or is edge-only acceptable?
2. **Security stance:** Is public API acceptable with auth, or must be localhost-only?
3. **Embedding provider:** OpenAI, Anthropic, or local model for CASS?
4. **Multi-user:** Will multiple developers share the same edge state?
