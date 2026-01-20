/**
 * Turso-Native Schema with Vector Support
 * 
 * Key differences from base schema:
 * 1. F32_BLOB columns for native vector search
 * 2. Unified memories table (replaces CASS)
 * 3. Branch metadata tracking
 * 4. Optimized indexes for vector similarity
 */

export const TURSO_NATIVE_SCHEMA = `
-- ============================================================================
-- TASKS
-- ============================================================================
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  type TEXT NOT NULL DEFAULT 'code',
  
  -- Assignment
  assigned_agent TEXT,
  claimed_at TEXT,
  
  -- Dependencies
  dependencies TEXT DEFAULT '[]',
  blockers TEXT DEFAULT '[]',
  
  -- Skills
  required_skills TEXT DEFAULT '[]',
  
  -- Files
  files TEXT DEFAULT '[]',
  
  -- Timing
  started_at TEXT,
  completed_at TEXT,
  estimated_minutes INTEGER,
  actual_minutes INTEGER,
  
  -- Retry
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 2,
  last_error TEXT,
  failure_type TEXT,
  next_retry_at TEXT,
  previous_agents TEXT DEFAULT '[]',
  
  -- Result
  result TEXT,
  
  -- Branching
  branch_id TEXT,
  parent_task_id TEXT,
  
  -- Quality
  quality_snapshot_id TEXT,
  
  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- Git branch for task isolation
  branch TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_agent);
CREATE INDEX IF NOT EXISTS idx_tasks_branch ON tasks(branch_id);

-- ============================================================================
-- AGENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'claude-code',
  status TEXT NOT NULL DEFAULT 'idle',
  
  -- Capabilities
  capabilities TEXT DEFAULT '{}',
  
  -- Current work
  current_task_id TEXT,
  current_task_progress REAL DEFAULT 0,
  current_task_phase TEXT,
  
  -- Stats
  tasks_completed INTEGER DEFAULT 0,
  tasks_failed INTEGER DEFAULT 0,
  total_runtime_minutes REAL DEFAULT 0,
  
  -- Machine info
  machine_id TEXT,
  machine_hostname TEXT,
  pid INTEGER,
  
  -- Timestamps
  registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  FOREIGN KEY (current_task_id) REFERENCES tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);

-- ============================================================================
-- MEMORIES (Replaces CASS - Native Vector Search!)
-- ============================================================================
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  
  -- Ownership
  agent_id TEXT,
  task_id TEXT,
  workspace_id TEXT,
  
  -- Content
  content TEXT NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'general',
  
  -- Metadata
  importance REAL DEFAULT 0.5,
  tags TEXT DEFAULT '[]',
  source TEXT,
  
  -- Vector embedding (BLOB for portability, F32_BLOB on Turso)
  embedding BLOB,
  
  -- Access tracking
  access_count INTEGER DEFAULT 0,
  last_accessed_at TEXT,
  expires_at TEXT,
  
  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Note: Vector similarity index is Turso-specific
-- CREATE INDEX IF NOT EXISTS idx_memories_vector ON memories(libsql_vector_idx(embedding));

CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id);
CREATE INDEX IF NOT EXISTS idx_memories_task ON memories(task_id);

-- ============================================================================
-- MESSAGES
-- ============================================================================
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  from_agent TEXT NOT NULL,
  to_agent TEXT,
  payload TEXT DEFAULT '{}',

  ack_required INTEGER DEFAULT 0,
  delivered_at TEXT,
  acknowledged_at TEXT,
  acknowledged_by TEXT,
  expires_at TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_agent);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);

-- ============================================================================
-- LEASES
-- ============================================================================
CREATE TABLE IF NOT EXISTS leases (
  file_path TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  task_id TEXT,
  acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  renewed_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_leases_agent ON leases(agent_id);
CREATE INDEX IF NOT EXISTS idx_leases_expires ON leases(expires_at);

-- ============================================================================
-- BRANCHES (Database branching metadata)
-- ============================================================================
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  
  parent_branch_id TEXT,
  parent_database_url TEXT,
  
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT,
  purpose TEXT,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  merged_at TEXT,
  deleted_at TEXT,
  
  FOREIGN KEY (parent_branch_id) REFERENCES branches(id)
);

CREATE INDEX IF NOT EXISTS idx_branches_status ON branches(status);

-- ============================================================================
-- QUALITY SNAPSHOTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS quality_snapshots (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  agent_id TEXT,
  branch_id TEXT,
  
  build_success INTEGER,
  build_time_ms INTEGER,
  type_errors INTEGER DEFAULT 0,
  lint_errors INTEGER DEFAULT 0,
  lint_warnings INTEGER DEFAULT 0,
  tests_passing INTEGER DEFAULT 0,
  tests_failing INTEGER DEFAULT 0,
  tests_skipped INTEGER DEFAULT 0,
  test_coverage REAL,
  test_time_ms INTEGER,
  
  browser_validation_passed INTEGER,
  browser_validation_errors INTEGER,
  
  build_output TEXT,
  type_output TEXT,
  lint_output TEXT,
  test_output TEXT,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE INDEX IF NOT EXISTS idx_quality_task ON quality_snapshots(task_id);
CREATE INDEX IF NOT EXISTS idx_quality_created ON quality_snapshots(created_at DESC);

-- ============================================================================
-- QUALITY BASELINE
-- ============================================================================
CREATE TABLE IF NOT EXISTS quality_baseline (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  branch_id TEXT,
  
  build_success INTEGER DEFAULT 1,
  type_errors INTEGER DEFAULT 0,
  lint_errors INTEGER DEFAULT 0,
  lint_warnings INTEGER DEFAULT 0,
  tests_passing INTEGER DEFAULT 0,
  tests_failing INTEGER DEFAULT 0,
  test_coverage REAL DEFAULT 0,
  
  set_by TEXT,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- SYNC METADATA
-- ============================================================================
CREATE TABLE IF NOT EXISTS sync_metadata (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_sync_at TEXT,
  sync_status TEXT DEFAULT 'synced',
  pending_changes INTEGER DEFAULT 0,
  last_error TEXT,
  remote_url TEXT,
  local_path TEXT
);

-- ============================================================================
-- WORKSPACE METADATA
-- ============================================================================
CREATE TABLE IF NOT EXISTS workspace (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  workspace_id TEXT NOT NULL,
  organization TEXT NOT NULL,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  settings TEXT DEFAULT '{}'
);
`;

export default TURSO_NATIVE_SCHEMA;
