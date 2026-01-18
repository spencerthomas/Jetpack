-- Jetpack D1 Initial Schema
-- Creates tables for tasks and memories

-- ============================================================================
-- Tasks Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  dependencies TEXT,          -- JSON array of task IDs
  blockers TEXT,              -- JSON array of blocker descriptions
  required_skills TEXT,       -- JSON array of skill strings
  estimated_minutes INTEGER,
  actual_minutes INTEGER,
  tags TEXT,                  -- JSON array of tags
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 2,
  branch TEXT,
  origin_branch TEXT,
  target_branches TEXT,       -- JSON array of branch names
  assigned_agent TEXT,
  last_error TEXT,
  failure_type TEXT,
  last_attempt_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(assigned_agent);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

-- ============================================================================
-- Memories Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  importance REAL NOT NULL DEFAULT 0.5,
  metadata TEXT,              -- JSON object
  has_embedding INTEGER DEFAULT 0,  -- 1 if embedding exists in Vectorize
  created_at INTEGER NOT NULL,
  last_accessed INTEGER NOT NULL,
  access_count INTEGER DEFAULT 0
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);
CREATE INDEX IF NOT EXISTS idx_memories_last_accessed ON memories(last_accessed);
CREATE INDEX IF NOT EXISTS idx_memories_has_embedding ON memories(has_embedding);
