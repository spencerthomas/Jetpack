/**
 * Jetpack Swarm v2 Database Schema
 * Embedded as TypeScript for bundler compatibility
 */

export const SCHEMA_SQL = `
-- Jetpack Swarm v2 Database Schema
-- Version: 1.0.0

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- ============================================================================
-- TASKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,

  -- Status workflow
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'claimed', 'in_progress', 'completed', 'failed', 'pending_retry', 'blocked')),

  -- Priority for ordering
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  priority_order INTEGER GENERATED ALWAYS AS (
    CASE priority
      WHEN 'critical' THEN 0
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 3
    END
  ) STORED,

  -- Task type
  type TEXT NOT NULL DEFAULT 'code'
    CHECK (type IN ('code', 'test', 'browser_test', 'documentation', 'review', 'custom')),

  -- Assignment
  assigned_agent TEXT,
  claimed_at TEXT,

  -- Dependencies (JSON array of task IDs)
  dependencies TEXT DEFAULT '[]',
  blockers TEXT DEFAULT '[]',

  -- Required skills (JSON array)
  required_skills TEXT DEFAULT '[]',

  -- Files to modify (JSON array)
  files TEXT DEFAULT '[]',

  -- Execution tracking
  started_at TEXT,
  completed_at TEXT,
  estimated_minutes INTEGER,
  actual_minutes INTEGER,

  -- Retry handling
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 2,
  last_error TEXT,
  failure_type TEXT CHECK (failure_type IS NULL OR failure_type IN ('task_error', 'task_timeout', 'dependency_error', 'quality_failure', 'resource_error', 'agent_crash')),
  next_retry_at TEXT,
  previous_agents TEXT DEFAULT '[]',

  -- Result data (JSON)
  result TEXT,

  -- Git context
  branch TEXT,

  -- Quality
  quality_snapshot_id TEXT,

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (assigned_agent) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY (quality_snapshot_id) REFERENCES quality_snapshots(id) ON DELETE SET NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority_order, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_agent);
CREATE INDEX IF NOT EXISTS idx_tasks_branch ON tasks(branch);
CREATE INDEX IF NOT EXISTS idx_tasks_ready ON tasks(status, priority_order, created_at)
  WHERE status = 'ready';
CREATE INDEX IF NOT EXISTS idx_tasks_retry ON tasks(status, next_retry_at)
  WHERE status = 'pending_retry';

-- ============================================================================
-- AGENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,

  -- Agent type
  type TEXT NOT NULL
    CHECK (type IN ('claude-code', 'codex', 'gemini', 'browser', 'custom')),

  -- Status
  status TEXT NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'busy', 'error', 'offline', 'shutting_down')),

  -- Capabilities (JSON)
  skills TEXT DEFAULT '[]',
  max_task_minutes INTEGER DEFAULT 60,
  can_run_tests INTEGER DEFAULT 1,
  can_run_build INTEGER DEFAULT 1,
  can_access_browser INTEGER DEFAULT 0,

  -- Health tracking
  last_heartbeat TEXT,
  heartbeat_count INTEGER DEFAULT 0,

  -- Current work
  current_task_id TEXT,
  current_task_started_at TEXT,
  current_task_progress INTEGER DEFAULT 0,
  current_task_phase TEXT,

  -- Statistics
  tasks_completed INTEGER DEFAULT 0,
  tasks_failed INTEGER DEFAULT 0,
  total_runtime_minutes INTEGER DEFAULT 0,

  -- Machine info (for distributed setups)
  machine_id TEXT,
  machine_hostname TEXT,
  pid INTEGER,

  -- Timestamps
  registered_at TEXT DEFAULT (datetime('now')),
  last_active_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (current_task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);
CREATE INDEX IF NOT EXISTS idx_agents_heartbeat ON agents(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_agents_idle ON agents(status, type) WHERE status = 'idle';

-- ============================================================================
-- MESSAGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,

  -- Message type
  type TEXT NOT NULL,

  -- Routing
  from_agent TEXT NOT NULL,
  to_agent TEXT,

  -- Payload (JSON)
  payload TEXT,

  -- Delivery tracking
  ack_required INTEGER DEFAULT 0,
  acknowledged_at TEXT,
  acknowledged_by TEXT,
  delivered_at TEXT,

  -- Expiration
  expires_at TEXT,

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (from_agent) REFERENCES agents(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_agent, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(to_agent, delivered_at)
  WHERE delivered_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_unacked ON messages(ack_required, acknowledged_at)
  WHERE ack_required = 1 AND acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_expires ON messages(expires_at)
  WHERE expires_at IS NOT NULL;

-- ============================================================================
-- FILE LEASES
-- ============================================================================

CREATE TABLE IF NOT EXISTS leases (
  file_path TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  task_id TEXT,

  -- Lease timing
  acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  renewed_count INTEGER DEFAULT 0,

  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

-- Index for finding expired leases
CREATE INDEX IF NOT EXISTS idx_leases_expires ON leases(expires_at);
CREATE INDEX IF NOT EXISTS idx_leases_agent ON leases(agent_id);

-- ============================================================================
-- QUALITY SNAPSHOTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS quality_snapshots (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  agent_id TEXT,

  -- Metrics
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

  -- Raw output (for debugging)
  build_output TEXT,
  type_output TEXT,
  lint_output TEXT,
  test_output TEXT,

  -- Timestamps
  recorded_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quality_task ON quality_snapshots(task_id);
CREATE INDEX IF NOT EXISTS idx_quality_time ON quality_snapshots(recorded_at);

-- ============================================================================
-- QUALITY BASELINE (Singleton)
-- ============================================================================

CREATE TABLE IF NOT EXISTS quality_baseline (
  id INTEGER PRIMARY KEY CHECK (id = 1),

  build_success INTEGER NOT NULL DEFAULT 1,
  type_errors INTEGER NOT NULL DEFAULT 0,
  lint_errors INTEGER NOT NULL DEFAULT 0,
  lint_warnings INTEGER NOT NULL DEFAULT 0,
  tests_passing INTEGER NOT NULL DEFAULT 0,
  tests_failing INTEGER NOT NULL DEFAULT 0,
  test_coverage REAL NOT NULL DEFAULT 0,

  -- Who set the baseline
  set_by TEXT,

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================================
-- MIGRATIONS TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================================
-- SWARM METADATA
-- ============================================================================

CREATE TABLE IF NOT EXISTS swarm_metadata (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert default metadata
INSERT OR IGNORE INTO swarm_metadata (key, value) VALUES
  ('schema_version', '1'),
  ('created_at', datetime('now'));

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at on tasks
CREATE TRIGGER IF NOT EXISTS tasks_updated_at
  AFTER UPDATE ON tasks
  FOR EACH ROW
BEGIN
  UPDATE tasks SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- Auto-update updated_at on quality_baseline
CREATE TRIGGER IF NOT EXISTS baseline_updated_at
  AFTER UPDATE ON quality_baseline
  FOR EACH ROW
BEGIN
  UPDATE quality_baseline SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- Auto-update swarm_metadata updated_at
CREATE TRIGGER IF NOT EXISTS metadata_updated_at
  AFTER UPDATE ON swarm_metadata
  FOR EACH ROW
BEGIN
  UPDATE swarm_metadata SET updated_at = datetime('now') WHERE key = OLD.key;
END;
`;

export default SCHEMA_SQL;
