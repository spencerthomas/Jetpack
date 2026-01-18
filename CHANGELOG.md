# Changelog

All notable changes to Jetpack will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.3.0] - 2026-01-17

### Added - Long-Running Autonomous Operation & Quality Infrastructure

#### Runtime Modes
- **Infinite mode** - Run continuously, never stops
- **Idle-pause mode** - Pause when no work available, resume on new tasks
- **Objective-based mode** - Run until specific objective achieved (LLM-evaluated)
- **Iteration-limit mode** - Original behavior with configurable max iterations

#### Bug Fixes from Stress Test
- **BUG-5 Fix**: Periodic work polling (30s default) prevents agents from idling when events are missed
- **BUG-6 Fix**: Dynamic timeout calculation (2x estimated time) for complex tasks
- **BUG-7 Fix**: Three-stage graceful shutdown (SIGINT -> SIGTERM -> SIGKILL)

#### New Packages
- **@jetpack/browser-validator** - Playwright-based browser validation for UI tasks
  - Automatic UI task detection based on skills and keywords
  - Extract validation checks from task descriptions
  - Screenshot capture and console error detection

#### Quality Infrastructure
- Wired up QualityMetricsAdapter and RegressionDetector
- Quality settings UI for build/test/lint checks
- Regression detection and failure escalation

#### TDD-Biased Agent Instructions
- Skill-specific testing guidance in agent prompts
- Emphasis on test-validated, verifiable code
- Pre-completion verification checklist

#### Settings UI Enhancements
- Runtime mode selection with conditional fields
- Agent execution settings (polling intervals, timeouts)
- Browser validation configuration
- Quality checks toggles

### Changed
- Supervisor failure escalation now includes DECOMPOSE action for breaking down complex failed tasks
- Agent system prompts include TDD guidance based on skills

## [0.2.0] - 2026-01-16

### Added - Interactive Config & Ollama Support

#### Interactive Config Wizard
- `jetpack init` now launches interactive wizard when no flags provided
- Guided setup for agents, port, and LLM provider selection
- Auto-detection of existing configuration

#### Ollama LLM Provider
- Local LLM support via Ollama
- `jetpack supervise "task" --llm ollama --model llama2`
- No API key required for local models

#### File Watching for External Tasks
- BeadsAdapter watches `.beads/tasks/` directory
- Drop `.md` files to create tasks automatically
- Files moved to `processed/` after conversion

### Changed
- Improved CLI help output with command reference
- Better error messages for missing API keys

## [0.1.0] - 2026-01-15

### Added - Architecture Enhancements

#### 12 Architecture Enhancements
1. Always-On Supervisor with background monitoring
2. Rich Agent Messaging with reasoning payloads
3. Dynamic Skills Marketplace - runtime skill acquisition
4. TUI Dashboard with tmux-style split panes
5. Smart Dependency Handling - parallel-first planning
6. Branch-Tagged Projects - branch-aware task filtering
7. Selective Plan Execution - choose which items to convert
8. Hierarchical Planning - Epic > Task > Subtask > Leaf
9. File Locking Integration - automatic lease acquisition
10. Semantic Search for CASS - vector embeddings
11. Quality Metrics Integration - regression detection
12. Message Acknowledgment - reliable delivery tracking

#### New Packages
- **@jetpack/quality-adapter** - Quality snapshots and regression detection
- **@jetpack/cli-tui** - Ink-based terminal UI dashboard

#### Web UI Features
- Plan management with create, execute, template workflows
- Memory dashboard with CASS stats and visualization
- Supervisor UI with LangGraph node visualization
- Agent spawning with multi-harness support
- Inbox redesign with 3-panel layout

### Fixed
- 11 critical bugs for JETPACK_WORK_DIR and schema consistency
- Agents demo mode and projects page fixes
- CASS work directory configuration

## [0.0.1] - 2026-01-10

### Added - Initial Release

#### Core System
- **JetpackOrchestrator** - Main coordination engine
- **BeadsAdapter** - Git-backed task management with dependency graphs
- **CASSAdapter** - SQLite-based persistent agent memory
- **MCPMailAdapter** - File-based inter-agent pub/sub messaging

#### CLI Commands
- `jetpack init` - Initialize Jetpack in a project
- `jetpack start` - Start orchestrator + agents + web UI
- `jetpack task` - Create tasks from command line
- `jetpack status` - Show system status
- `jetpack demo` - Run guided demo workflow
- `jetpack supervise` - AI-powered task breakdown
- `jetpack mcp` - Start MCP server for Claude Code

#### Agent System
- Skill-based task assignment
- File leasing for concurrent safety
- Heartbeat monitoring
- Claude Code CLI integration

#### Web UI
- Kanban board with drag-and-drop
- Hierarchical task tree view
- Agent status monitoring
- Real-time updates

#### LangGraph Supervisor
- Multi-LLM support (Claude, OpenAI)
- Task breakdown with dependency planning
- Skill-based agent matching
- Progress monitoring and conflict resolution

#### MCP Server Integration
- Bidirectional sync with Claude Code
- Plan and task management tools
- Todo synchronization

---

## Summary of Recent Development

### Stress Test Results (Jan 17, 2026)
- **10 agents** working in parallel on Node Banana project
- **9 tasks** completed in **1 hour**
- **0 failures** - 100% success rate
- Tasks included: 7 new node types, template gallery, undo/redo system

### Key Metrics
- ~8,159 lines of code generated
- All agents coordinated via MCP Mail
- File locking prevented conflicts
- Quality metrics captured per task

---

Built with [Claude Code](https://claude.ai/code)
