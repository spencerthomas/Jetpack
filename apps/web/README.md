# Jetpack Web UI

Modern dark-themed interface for multi-agent orchestration and task management.

## Features Overview

- **8 Pages**: Board, Inbox, Agents, Plans, Projects, Memory, Supervisor, Settings
- **Dark Theme**: Default dark mode with cyan accent (`rgb(79, 255, 238)`)
- **Real-time Updates**: Auto-refresh every 2 seconds
- **Responsive Design**: Optimized for desktop with sidebar navigation

## Pages

### Board (/board)

Dual-view task management interface with Kanban and hierarchical tree views.

**Kanban View:**
- 6 status columns: Pending, Ready, Claimed, In Progress, Completed, Failed
- Drag-and-drop between columns to update task status
- Priority badges (low/medium/high/critical) with color coding
- Skill tags for task requirements

**Tree View:**
- Hierarchical task display with ASCII connectors (│├└)
- Task type labels with colors:
  - **Epic** (purple) - Top-level parent tasks
  - **Task** (blue) - Mid-level tasks with children
  - **Sub-task** (gray) - Nested tasks
  - **Leaf** (green) - Bottom-level tasks without children
- Progress bars with completion percentages
- Expand/collapse subtask hierarchies
- Hierarchical IDs (e.g., `bd-a1b2.1.1`)

---

### Inbox (/inbox)

3-panel mail interface for agent communication.

**Left Panel - Categories:**
- All messages
- Unread only
- Task events (created, claimed, completed, failed)
- Agent status (started, stopped, heartbeat)
- Coordination messages
- Threads (grouped conversations)

**Middle Panel - Message List:**
- Type badges: Completed (green), Failed (red), Claimed (yellow), Started (blue)
- Agent attribution with avatar initials
- Relative timestamps (e.g., "2m ago")
- Full-text search functionality
- Read/unread state tracking

**Right Panel - Message Detail:**
- Full message content and metadata
- JSON payload viewer with formatting
- Reply and archive actions
- Correlation ID for thread tracking

---

### Agents (/agents)

Agent lifecycle visualization and management.

**Agent Cards:**
- Status indicators: idle (gray), busy (cyan), offline (red), error (orange)
- Current task display with ID and title
- Skills badges (typescript, react, backend, etc.)
- Tasks completed counter
- Last heartbeat timestamp

**Lifecycle Phases:**
```
idle → looking → claiming → retrieving → executing → storing → publishing → complete
```
- Visual phase progress bar
- Terminal-style execution logs
- Real-time phase updates

**Agent Spawning:**
- Harness selection: Claude Code, Codex CLI, Gemini CLI
- Skills configuration checkboxes
- Real-time spawn feedback

---

### Plans (/plans)

Plan creation, template management, and workflow execution.

**Features:**
- Plan list with status filters (all/active/templates)
- Create new plans with task breakdown
- Set dependencies between planned tasks
- Estimated duration calculations
- Tag-based organization
- Template system for reusable workflows
- Execute plans to create actual tasks

**Plan Statuses:**
- `draft` - Plan being created
- `approved` - Ready for execution
- `executing` - Tasks being created
- `completed` - All tasks finished
- `failed` - Execution error

---

### Projects (/projects)

Project overview and progress tracking.

**Features:**
- Project cards with status badges
- Task completion progress bars
- Link to associated plans
- Connection status indicator

---

### Memory (/memory)

CASS memory system dashboard for viewing and managing agent memories.

**Statistics Cards:**
- Total entries count
- Type distribution breakdown (bar chart)
- Average importance score (0-1)
- Total access count
- Embedding coverage percentage

**Memory Types (with colors):**
- `codebase_knowledge` (cyan) - Project structure understanding
- `agent_learning` (green) - Patterns from completed tasks
- `pattern_recognition` (purple) - Recognized code patterns
- `conversation_history` (blue) - Past interactions
- `decision_rationale` (orange) - Why choices were made

**Actions:**
- **Backfill Embeddings**: Generate vector embeddings for entries without them
- **Compact Memory**: Remove low-importance entries below threshold

**Memory Browser:**
- Filter by type with toggle buttons
- Selected memory detail view
- Content preview with full expansion
- Importance score, access count, timestamps

---

### Supervisor (/supervisor)

LangGraph supervisor execution monitor for intelligent orchestration.

**LangGraph Visualization:**
```
Planner → Assigner → Monitor → Coordinator (loop back)
```
- Node diagram with real-time highlighting
- Active node indicator during execution
- Feedback loop visualization for conflict resolution

**Request Queue:**
- Submit new requests with text input
- Priority selection: low, medium, high, critical
- Queue status display: pending/processing/completed/failed
- Execution history with timestamps

**Metrics Dashboard:**
- Current iteration count
- Tasks created/completed/failed
- Conflicts resolved
- Final report display

---

### Settings (/settings)

System configuration interface.

**CASS Embedding Configuration:**
- Auto-generate embeddings toggle (on/off)
- Embedding model selection:
  - `text-embedding-3-small` (default, fastest)
  - `text-embedding-3-large` (highest quality)
  - `text-embedding-ada-002` (legacy)
- OpenAI API key management (masked input)
- Dimensions configuration

**Memory Settings:**
- Compaction threshold (0.0-1.0 slider)
- Max entries limit
- **Hot Reload**: Changes apply immediately without restart

---

## API Routes

### Tasks
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/tasks` | List all tasks |
| POST | `/api/tasks` | Create new task |
| PATCH | `/api/tasks/[id]` | Update task |
| DELETE | `/api/tasks/[id]` | Delete task |

### Agents
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/agents` | List all agents |
| POST | `/api/agents/spawn` | Spawn new agent with config |

### Messages
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/messages` | List MCP Mail messages |
| POST | `/api/messages/[id]/ack` | Acknowledge message |
| POST | `/api/messages/broadcast` | Broadcast to all agents |
| GET | `/api/messages/stream` | SSE real-time updates |

### Plans
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/plans` | List plans |
| POST | `/api/plans` | Create plan |
| GET | `/api/plans/[id]` | Get plan details |
| PUT | `/api/plans/[id]` | Update plan |
| DELETE | `/api/plans/[id]` | Delete plan |
| POST | `/api/plans/[id]/execute` | Execute plan |
| POST | `/api/plans/[id]/complete` | Mark complete |

### Memory (CASS)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/cass/stats` | Memory statistics |
| GET | `/api/cass/memories` | List memories with filtering |
| POST | `/api/cass/reconfigure` | Hot reload config |
| POST | `/api/cass/backfill` | Generate embeddings |
| POST | `/api/cass/compact` | Remove low-importance entries |

### Settings
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/settings` | Get current settings |
| POST | `/api/settings` | Update settings |

### System
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/status` | Full system status |
| POST | `/api/supervisor` | Submit supervisor request |

---

## Color Scheme

**Theme:** Dark mode default with cyan accent

**Primary Colors:**
| Name | Value | Usage |
|------|-------|-------|
| Accent | `rgb(79, 255, 238)` | Primary actions, highlights |
| Background | `#09090b` | Page background |
| Card | `#18181b` | Card backgrounds |
| Border | `#27272a` | Borders, dividers |

**Task Type Colors:**
| Type | Color | Hex |
|------|-------|-----|
| Epic | Purple | `#a855f7` |
| Task | Blue | `#3b82f6` |
| Sub-task | Gray | `#8b8b8e` |
| Leaf | Green | `#22c55e` |

**Status Colors:**
| Status | Color |
|--------|-------|
| Pending | Gray |
| Ready | Blue |
| Claimed | Yellow |
| In Progress | Cyan |
| Completed | Green |
| Failed | Red |

---

## Getting Started

### With Jetpack CLI (Recommended)

```bash
# Start everything together (orchestrator + agents + web UI)
jetpack start

# Browser opens automatically to http://localhost:3002
```

### Development (Standalone)

```bash
# From the Jetpack root directory
cd apps/web

# Install dependencies (usually done via root pnpm install)
pnpm install

# Run development server (connects to Jetpack repo's own data)
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000)

### Working with External Projects

To use the web UI with a different project directory, set `JETPACK_WORK_DIR`:

```bash
# Point to your project (critical for correct data loading)
JETPACK_WORK_DIR=/path/to/your/project pnpm dev

# Example
JETPACK_WORK_DIR=/Users/tom/dev/my-app pnpm dev -p 3002
```

**Important:** The `JETPACK_WORK_DIR` environment variable tells all API routes where to find:
- `.beads/tasks.jsonl` - Task storage
- `.cass/memory.db` - Agent memory database
- `.jetpack/plans/` - Plan files
- `.jetpack/mail/` - Agent messages

Without this variable, the web UI defaults to the Jetpack repository root, which may show stale or incorrect data when working on external projects.

### Production Build

```bash
pnpm build
pnpm start
```

---

## Tech Stack

- **Framework:** Next.js 15 with App Router
- **UI Library:** React 19
- **Styling:** Tailwind CSS with custom animations
- **Drag & Drop:** @dnd-kit/core, @dnd-kit/sortable
- **State:** Zustand
- **Icons:** lucide-react
- **Dates:** date-fns
- **TypeScript:** Strict mode

---

## Architecture

```
apps/web/
├── src/
│   ├── app/
│   │   ├── api/              # Next.js API routes
│   │   │   ├── tasks/
│   │   │   ├── agents/
│   │   │   ├── messages/
│   │   │   ├── plans/
│   │   │   ├── cass/
│   │   │   ├── settings/
│   │   │   └── status/
│   │   ├── board/            # Kanban + tree view
│   │   ├── inbox/            # 3-panel mail
│   │   ├── agents/           # Agent lifecycle
│   │   ├── plans/            # Plan management
│   │   ├── projects/         # Project overview
│   │   ├── memory/           # CASS dashboard
│   │   ├── supervisor/       # LangGraph monitor
│   │   ├── settings/         # Configuration
│   │   ├── layout.tsx        # Root layout with sidebar
│   │   └── globals.css       # Global styles
│   └── components/
│       └── ui/               # Shared UI components
├── public/
└── package.json
```

---

## Troubleshooting

### No tasks showing
1. Ensure Jetpack backend is running (`jetpack start`)
2. Check `.beads/tasks.jsonl` exists in target project
3. Verify API is accessible at `/api/tasks`
4. If using standalone mode, ensure `JETPACK_WORK_DIR` is set correctly

### No agents showing
1. Confirm agents started with `jetpack start --agents N`
2. Check agent status with `jetpack status`
3. Note: Agent page shows "Click 'Spawn Agent' to start" when no agents exist

### Inbox empty
1. Verify `.jetpack/mail/` directory exists in target project
2. Ensure agents are sending messages
3. Check for message type filters

### Memory page shows no data / shows wrong data
1. Confirm `.cass/memory.db` exists in target project
2. **Critical:** Set `JETPACK_WORK_DIR` if working on external project
3. Check if any memories have been stored with `jetpack status`
4. Restart the web server after changing `JETPACK_WORK_DIR`

### Plans not appearing
1. Check `.jetpack/plans/` directory exists
2. Verify plan JSON files have correct structure (see Plan Structure below)
3. Ensure `JETPACK_WORK_DIR` points to correct project

### Plan Structure

Plans stored in `.jetpack/plans/*.json` must have this structure:

```json
{
  "id": "plan-timestamp",
  "title": "Plan title",
  "description": "Optional description",
  "status": "draft",
  "createdAt": "ISO date",
  "items": [
    {
      "id": "item-1",
      "title": "Task title",
      "description": "Task description",
      "status": "pending",
      "priority": "high",
      "skills": ["typescript", "backend"],
      "dependencies": [],
      "estimatedMinutes": 30
    }
  ]
}
```

**Required item fields:** `id`, `title`, `status`, `priority`, `skills`, `dependencies`

---

## Future Enhancements

- [ ] WebSocket support for true real-time updates
- [ ] Task dependency graph visualization
- [ ] Agent performance metrics and leaderboards
- [ ] Mobile responsive design improvements
- [ ] Task editing inline
- [ ] Bulk task operations
- [ ] Export task reports

---

## License

MIT
