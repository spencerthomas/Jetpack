# OOM Crash Logs from Jetpack Sessions

## Crash 1: 8 Agents Session

```
<--- Last few GCs --->

[51480:0x158008000]  1587500 ms: Scavenge (reduce) 15965.6 (16430.6) -> 15965.5 (16431.6) MB, 39.38 / 0.00 ms  (average mu = 0.137, current mu = 0.000) allocation failure;
[51480:0x158008000]  1596196 ms: Mark-Compact (reduce) 15966.6 (16431.8) -> 15949.1 (16431.8) MB, 8691.12 / 1.33 ms  (average mu = 0.172, current mu = 0.200) allocation failure; scavenge might not succeed


<--- JS stacktrace --->

FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
----- Native stack trace -----

 1: 0x104493eb8 node::OOMErrorHandler(char const*, v8::OOMDetails const&) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
 2: 0x10462262c v8::internal::V8::FatalProcessOutOfMemory(v8::internal::Isolate*, char const*, v8::OOMDetails const&) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
 3: 0x1047f6d00 v8::internal::Heap::GarbageCollectionReasonToString(v8::internal::GarbageCollectionReason) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
 4: 0x1047fabb4 v8::internal::Heap::CollectGarbageShared(v8::internal::LocalHeap*, v8::internal::GarbageCollectionReason) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
 5: 0x1047f7618 v8::internal::Heap::PerformGarbageCollection(v8::internal::GarbageCollector, v8::internal::GarbageCollectionReason, char const*) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
 6: 0x1047f53a0 v8::internal::Heap::CollectGarbage(v8::internal::AllocationSpace, v8::internal::GarbageCollectionReason, v8::GCCallbackFlags) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
 7: 0x1047ebff4 v8::internal::HeapAllocator::AllocateRawWithLightRetrySlowPath(int, v8::internal::AllocationType, v8::internal::AllocationOrigin, v8::internal::AllocationAlignment) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
 8: 0x1047ec854 v8::internal::HeapAllocator::AllocateRawWithRetryOrFailSlowPath(int, v8::internal::AllocationType, v8::internal::AllocationOrigin, v8::internal::AllocationAlignment) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
 9: 0x1047d1188 v8::internal::Factory::AllocateRaw(int, v8::internal::AllocationType, v8::internal::AllocationAlignment) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
10: 0x1047c77c0 v8::internal::MaybeHandle<v8::internal::SeqOneByteString> v8::internal::FactoryBase<v8::internal::Factory>::NewRawStringWithMap<v8::internal::SeqOneByteString>(int, v8::internal::Map, v8::internal::AllocationType) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
11: 0x1047d3590 v8::internal::Factory::NewStringFromUtf8(v8::base::Vector<unsigned char const> const&, unibrow::Utf8Variant, v8::internal::AllocationType) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
12: 0x1047d3710 v8::internal::Factory::NewStringFromUtf8(v8::base::Vector<char const> const&, v8::internal::AllocationType) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
13: 0x104644890 v8::String::NewFromUtf8(v8::Isolate*, char const*, v8::NewStringType, int) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
14: 0x1045692fc node::StringBytes::Encode(v8::Isolate*, char const*, unsigned long, node::encoding, v8::Local<v8::Value>*) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
15: 0x10449af10 node::fs::AfterScanDir(uv_fs_s*) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
16: 0x10448dd44 node::MakeLibuvRequestCallback<uv_fs_s, void (*)(uv_fs_s*)>::Wrapper(uv_fs_s*) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
17: 0x104e6a0e0 uv__work_done [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
18: 0x104e6db30 uv__async_io [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
19: 0x104e7fc08 uv__io_poll [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
20: 0x104e6e0f4 uv_run [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
21: 0x1043bd6f0 node::SpinEventLoopInternal(node::Environment*) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
22: 0x1044d3b64 node::NodeMainInstance::Run(node::ExitCode*, node::Environment*) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
23: 0x1044d3878 node::NodeMainInstance::Run() [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
24: 0x10445b654 node::Start(int, char**) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
25: 0x19f475d54 start [/usr/lib/dyld]
```

**Context**:
- Running with `NODE_OPTIONS="--max-old-space-size=16384"` (16GB heap)
- 8 Claude Code agents running in parallel
- Heap reached ~15.9GB before crash
- Crash occurred during file system operations (AfterScanDir)

---

## Crash 2: 4 Agents Session

```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
----- Native stack trace -----

 1: 0x1049ebeb8 node::OOMErrorHandler(char const*, v8::OOMDetails const&) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
 2: 0x104b7a62c v8::internal::V8::FatalProcessOutOfMemory(v8::internal::Isolate*, char const*, v8::OOMDetails const&) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
 3: 0x104d4ed00 v8::internal::Heap::GarbageCollectionReasonToString(v8::internal::GarbageCollectionReason) [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
...
10: 0x1053c5b30 uv__async_io [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
11: 0x1053d7c08 uv__io_poll [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
12: 0x1053c60f4 uv_run [/Users/tomspencer/.nvm/versions/node/v20.18.0/bin/node]
```

**Context**:
- Reduced to 4 agents after first crash
- Still hit 16GB heap limit
- Crash occurred during MinorGCJob

---

## BeadsAdapter Schema Error

```
TypeError: Cannot read properties of undefined (reading 'length')
    at BeadsAdapter.getReadyTasks (BeadsAdapter.js:237)
```

**Context**:
- Tasks were missing required `blockers` field
- BeadsAdapter.js line 237 expected `task.blockers.length`
- Fix required adding `blockers: []` to all 277 tasks

---

## Session End States

### Session 1
```json
{
  "cycleCount": 33,
  "startedAt": "2026-01-19T01:19:30.947Z",
  "lastWorkAt": "2026-01-19T01:38:20.772Z",
  "tasksCompleted": 12,
  "tasksFailed": 3,
  "endState": "max_failures_reached"
}
```

### Session 2
```json
{
  "cycleCount": 17,
  "startedAt": "2026-01-19T07:02:37.372Z",
  "lastWorkAt": "2026-01-19T07:17:11.864Z",
  "tasksCompleted": 14,
  "tasksFailed": 3,
  "endState": "max_failures_reached"
}
```

**Note**: Both sessions ended with "max_failures_reached" after only 3 consecutive failures, even though 200+ tasks remained.

---

## Task File Corruption Evidence

After OOM crashes, the task file was found in these states:

1. **Empty file** (0 bytes)
2. **Partial JSON** (truncated mid-line)
3. **Missing status updates** (tasks shown as "in_progress" but agents crashed)

Required manual restoration from backup each time:
```bash
cp .beads/tasks.jsonl.backup .beads/tasks.jsonl
```
