# Jetpack: Getting Started Guide

> **Quick Start** - Get up and running in 5 minutes
>
> For comprehensive documentation, see [docs/JETPACK_COMPLETE_GUIDE.md](docs/JETPACK_COMPLETE_GUIDE.md)

## What is Jetpack?

Jetpack is a **multi-agent AI development system** that coordinates multiple AI agents to work on software development tasks in parallel. Think of it as having a team of AI developers that can:

- Work on multiple tasks simultaneously
- Learn from past work
- Coordinate to avoid conflicts
- Execute real code changes via Claude Code

## Prerequisites

Before starting, ensure you have:

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Claude Code CLI** installed (`npm install -g @anthropic-ai/claude-code`)
- **ANTHROPIC_API_KEY** environment variable set

## Installation

```bash
# Clone the repository
git clone https://github.com/spencerthomas/Jetpack.git
cd Jetpack

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Verify installation
pnpm jetpack --help
```

## Quick Start (5 minutes)

### Step 1: Initialize Your Project

Navigate to your project directory (or create a new one):

```bash
cd /path/to/your/project
jetpack init
```

This creates:
```
your-project/
├── .beads/           # Task storage (commit this!)
│   ├── tasks/        # Drop .md files here
│   └── processed/    # Completed task files
├── .cass/            # Agent memory (gitignored)
├── .jetpack/
│   ├── config.json   # Settings
│   └── mail/         # Agent communication
└── CLAUDE.md         # Updated with Jetpack instructions
```

### Step 2: Start Jetpack

```bash
jetpack start
```

Your browser opens to http://localhost:3002 with the Kanban board.

### Step 3: Create Your First Task

**Option A: Drop a file** (recommended for Claude Code users)

Create `.beads/tasks/my-first-task.md`:
```markdown
---
title: Add a hello world endpoint
priority: medium
skills: [typescript, backend]
---

Create a simple GET /hello endpoint that returns "Hello, World!"
```

**Option B: Use the CLI**
```bash
jetpack task -t "Add hello world endpoint" -p medium -s typescript,backend
```

**Option C: Use the Web UI**
Click "New Task" in the Kanban board.

### Step 4: Watch the Magic

Agents will automatically:
1. Detect your task
2. Claim it based on skills
3. Execute via Claude Code
4. Mark as complete

---

## Tips & Tricks

### 1. Skill-Based Task Assignment

Tasks are matched to agents by skills. Be specific:

```markdown
---
title: Fix React rendering bug
skills: [react, frontend, typescript]  # More specific = better matching
---
```

Available skills: `typescript`, `javascript`, `python`, `rust`, `go`, `react`, `vue`, `angular`, `svelte`, `backend`, `frontend`, `database`, `devops`, `testing`, `documentation`, `security`

### 2. Task Dependencies

Chain tasks that depend on each other:

```markdown
---
title: Write API tests
dependencies: [bd-abc123]  # Wait for API to be built first
---
```

### 3. Priority Levels

- `critical` - Drop everything, do this now
- `high` - Important, do soon
- `medium` - Normal priority (default)
- `low` - Nice to have

### 4. Using with Claude Code

When working in Claude Code, you can create tasks by simply writing to the tasks folder:

```bash
# In Claude Code, just create a file:
echo "---
title: Refactor auth module
priority: high
skills: [typescript, backend]
---
Refactor the authentication module to use JWT tokens.
" > .beads/tasks/refactor-auth.md
```

Jetpack's file watcher picks it up automatically!

### 5. Config Customization

Edit `.jetpack/config.json`:
```json
{
  "agents": 5,
  "port": 3005
}
```

### 6. Supervisor Mode for Complex Tasks

For large features, use the AI supervisor:

```bash
jetpack supervise "Build a complete user authentication system with login, logout, password reset, and email verification"
```

The supervisor will:
1. Break it into subtasks
2. Set up dependencies
3. Assign to agents
4. Monitor progress
5. Handle failures

### 7. Viewing Agent Activity

- **Web UI**: http://localhost:3002/agents - See what each agent is doing
- **CLI**: `jetpack status` - Quick overview
- **Console**: Watch the terminal where `jetpack start` is running

### 8. Task File Best Practices

```markdown
---
title: Clear, action-oriented title    # What to do
priority: high                          # How urgent
skills: [typescript, react]             # What expertise needed
estimate: 30                            # Minutes (helps planning)
---

## Context
Explain WHY this needs to be done.

## Requirements
- Specific requirement 1
- Specific requirement 2

## Acceptance Criteria
- [ ] Test passes
- [ ] No lint errors
```

---

## Common Workflows

### Workflow 1: Bug Fix Sprint

```bash
# Start with 5 agents
jetpack start -a 5

# Create bug fix tasks
jetpack task -t "Fix login timeout issue" -p critical -s backend
jetpack task -t "Fix mobile layout bug" -p high -s react,frontend
jetpack task -t "Fix API rate limiting" -p high -s backend
```

### Workflow 2: Feature Development

```bash
# Use supervisor for complex features
jetpack supervise "Add dark mode support to the entire application"

# Or break it down manually:
# 1. Create tasks with dependencies
# 2. Let agents work through the dependency graph
```

### Workflow 3: Code Review & Refactoring

```bash
jetpack supervise "Refactor the user service to follow clean architecture patterns"
```

### Workflow 4: Documentation Sprint

```bash
jetpack task -t "Document API endpoints" -p medium -s documentation
jetpack task -t "Add JSDoc to core modules" -p low -s documentation,typescript
```

---

## Web UI Pages

The web UI at http://localhost:3002 includes these pages:

### Board (/board)
Dual-view task management with Kanban columns and hierarchical tree view.
- **Kanban View**: Drag-and-drop across 6 status columns
- **Tree View**: Hierarchical display with ASCII connectors (│├└)
- **Task Types**: Epic (purple), Task (blue), Sub-task (gray), Leaf (green)
- **Progress**: Visual bars with completion percentages

### Inbox (/inbox)
3-panel mail interface for agent communication.
- **Categories**: All, Unread, Tasks, Agents, Coordination, Threads
- **Search**: Full-text search across messages
- **Threads**: Grouped conversations with correlation tracking

### Agents (/agents)
Agent lifecycle visualization and management.
- **Lifecycle Phases**: idle → looking → claiming → retrieving → executing → storing → publishing
- **Harness Selection**: Claude Code, Codex CLI, Gemini CLI
- **Status**: idle (gray), busy (cyan), offline (red), error (orange)

### Plans (/plans)
Plan creation, templates, and workflow execution.
- **Create**: Define task sequences with dependencies
- **Templates**: Save reusable plan workflows
- **Execute**: Convert plans into actual tasks

### Memory (/memory)
CASS memory system dashboard.
- **Stats**: Total entries, type distribution, embedding coverage
- **Actions**: Backfill embeddings, compact low-importance entries
- **Browse**: Filter by type, view details, access history

### Supervisor (/supervisor)
LangGraph supervisor monitor.
- **Visualization**: Planner → Assigner → Monitor → Coordinator nodes
- **Queue**: Submit requests with priority, track status
- **Metrics**: Iterations, tasks created, conflicts resolved

### Settings (/settings)
System configuration interface.
- **CASS Config**: Auto-generate embeddings, model selection, API keys
- **Thresholds**: Max entries, compaction threshold
- **Hot Reload**: Changes apply immediately

---

## Troubleshooting

### "Claude CLI not found"
```bash
npm install -g @anthropic-ai/claude-code
```

### "ANTHROPIC_API_KEY not set"
```bash
export ANTHROPIC_API_KEY=your_key_here
# Add to ~/.bashrc or ~/.zshrc for persistence
```

### "Port 3002 already in use"
```bash
jetpack start -p 3005  # Use different port
# Or kill existing process:
lsof -i :3002 | awk 'NR>1 {print $2}' | xargs kill
```

### Tasks not being picked up
1. Check agents are running: `jetpack status`
2. Check task skills match agent skills
3. Check for unmet dependencies

### Agents stuck
```bash
# Restart Jetpack
Ctrl+C
jetpack start
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  jetpack start                       │
├─────────────────────────────────────────────────────┤
│  Orchestrator                                        │
│  ├── Beads Adapter (task storage)                   │
│  ├── CASS Adapter (agent memory)                    │
│  ├── MCP Mail (agent communication)                 │
│  └── File Watcher (.beads/tasks/)                   │
├─────────────────────────────────────────────────────┤
│  Agents (1-N)                                        │
│  ├── Claim tasks based on skills                    │
│  ├── Execute via Claude Code CLI                    │
│  └── Store learnings in CASS                        │
├─────────────────────────────────────────────────────┤
│  Web UI (localhost:3002)                            │
│  ├── Board (Kanban + Tree view)                     │
│  ├── Inbox (3-panel mail interface)                 │
│  ├── Agents (lifecycle visualization)              │
│  ├── Plans (workflow management)                    │
│  ├── Memory (CASS dashboard)                        │
│  ├── Supervisor (LangGraph monitor)                 │
│  └── Settings (configuration)                       │
└─────────────────────────────────────────────────────┘
```

---

## Best Practices

1. **Start small** - Begin with 3 agents, scale up as needed
2. **Be specific** - Detailed task descriptions = better results
3. **Use dependencies** - Order matters for complex features
4. **Commit .beads/** - Track task history in git
5. **Don't commit .cass/** - Memory is environment-specific
6. **Monitor the first few runs** - Watch how agents interpret tasks
7. **Iterate on prompts** - If results aren't great, refine task descriptions

---

## Next Steps

1. Try the demo: `jetpack demo --agents 5`
2. Read the [Complete Reference Guide](docs/JETPACK_COMPLETE_GUIDE.md) for detailed documentation
3. Explore the web UI at http://localhost:3002
4. See [ARCHITECTURE.md](ARCHITECTURE.md) for system design details
5. Check [docs/HYBRID_ARCHITECTURE.md](docs/HYBRID_ARCHITECTURE.md) for Cloudflare hybrid mode
