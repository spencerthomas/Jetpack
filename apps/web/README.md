# Jetpack Web UI

Modern Kanban board interface for visualizing and managing multi-agent task execution.

## Features

### 📊 Kanban Board
- **6 Status Columns**: Pending, Ready, Claimed, In Progress, Completed, Failed
- **Drag & Drop**: Move tasks between columns to update status
- **Task Cards**: Show priority, skills, dependencies, assigned agent, and more
- **Real-time Updates**: Auto-refreshes every 2 seconds

### 🤖 Agent Panel
- **Live Status**: See which agents are idle, busy, or offline
- **Current Tasks**: View what each agent is working on
- **Skills Display**: See agent capabilities at a glance
- **Activity Timestamps**: Last active time for each agent

### 📬 MCP Mail Inbox
- **Real-time Messages**: View inter-agent communication
- **Message Types**: Task created, claimed, completed, agent started, etc.
- **Payload Details**: See full message content
- **Agent Attribution**: Know which agent sent each message

### ✨ Header Controls
- **Create Task**: Modal form for creating new tasks
- **Stats Display**: Active agents, in-progress tasks, completed count
- **Inbox Toggle**: Show/hide the message inbox panel

## Getting Started

### Development

```bash
# From the root of Jetpack
cd apps/web

# Install dependencies (done via root pnpm install)
pnpm install

# Run development server
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000)

### Production Build

```bash
# Build for production
pnpm build

# Start production server
pnpm start
```

## Usage

### 1. Start Jetpack Backend

First, start the Jetpack orchestrator with agents:

```bash
# From root directory
jetpack start --agents 5
```

### 2. Launch Web UI

```bash
# From root directory
cd apps/web
pnpm dev
```

### 3. Create Tasks

Use the "New Task" button in the header to create tasks. Agents will automatically claim and execute them.

### 4. Monitor Progress

- **Kanban Board**: Watch tasks move through columns
- **Agent Panel**: See which agents are working
- **Inbox**: View agent communication in real-time

## Architecture

### API Routes

- `GET /api/tasks` - List all tasks
- `POST /api/tasks` - Create new task
- `PATCH /api/tasks/[id]` - Update task
- `DELETE /api/tasks/[id]` - Delete task
- `GET /api/agents` - List all agents
- `GET /api/messages` - List MCP Mail messages
- `GET /api/status` - Get system status

### Components

```
src/
├── app/
│   ├── api/            # Next.js API routes
│   │   ├── tasks/
│   │   ├── agents/
│   │   ├── messages/
│   │   └── status/
│   ├── layout.tsx      # Root layout
│   ├── page.tsx        # Main page
│   └── globals.css     # Global styles
└── components/
    ├── KanbanBoard.tsx     # Main board with drag-drop
    ├── KanbanColumn.tsx    # Status column
    ├── TaskCard.tsx        # Individual task card
    ├── Header.tsx          # Top navigation
    ├── AgentPanel.tsx      # Right sidebar with agents
    ├── InboxPanel.tsx      # MCP Mail inbox viewer
    └── CreateTaskModal.tsx # Task creation form
```

### Real-time Updates

The UI polls the API every 2 seconds to fetch:
- Latest task statuses
- Agent activity
- New MCP Mail messages

This ensures the UI stays synchronized with agent actions.

## Drag & Drop

Tasks can be dragged between columns to update their status:

- **Pending** → Ready (manually mark as ready)
- **Ready** → Claimed (agents auto-claim)
- **Claimed** → In Progress (agent starts work)
- **In Progress** → Completed (task finished)
- **Any** → Failed (manual override)

## Task Card Details

Each task card displays:

- **Title** and **ID** (bd-XXXX format)
- **Description** (if provided)
- **Priority** badge (low, medium, high, critical)
- **Assigned Agent** (if claimed)
- **Estimated Time** (if provided)
- **Required Skills** (tags)
- **Dependencies** count (if any)
- **Blockers** count (if any)
- **Created** timestamp

## MCP Mail Inbox

The inbox shows agent-to-agent messages:

### Message Types

- 🔔 **task.created** - New task broadcast
- ⚡ **task.claimed** - Agent claimed a task
- ✅ **task.completed** - Task finished successfully
- ❌ **task.failed** - Task failed with error
- 🤖 **agent.started** - Agent came online
- 🔒 **file.lock** - File leasing
- 📨 **coordination.*** - Agent coordination

### Features

- **Color-coded** by message type
- **Agent names** instead of IDs
- **Payload preview** with smart formatting
- **Timestamp** relative to now
- **Auto-scroll** to latest messages

## Styling

Built with **Tailwind CSS** for:
- Responsive design
- Consistent spacing
- Color themes
- Animations

### Color Scheme

- **Primary**: Blue gradient (#0ea5e9)
- **Status Colors**:
  - Pending: Gray
  - Ready: Blue
  - Claimed: Yellow
  - In Progress: Purple
  - Completed: Green
  - Failed: Red

## Performance

- **Server-side rendering** with Next.js App Router
- **API route caching** for faster responses
- **Optimized polling** (2s interval)
- **Lazy loading** for large task lists

## Troubleshooting

### No tasks showing

Make sure:
1. Jetpack backend is running
2. Tasks have been created (via CLI or UI)
3. `.beads/` directory exists with `tasks.jsonl`

### No agents showing

Ensure:
1. Agents were started with `jetpack start --agents N`
2. Check agent status with `jetpack status`

### Inbox empty

Verify:
1. `.jetpack/mail/outbox/` directory exists
2. Agents are communicating
3. Messages are recent (only shows last 50)

## Future Enhancements

- [ ] WebSocket support for true real-time updates
- [ ] Task filtering and search
- [ ] Agent performance metrics
- [ ] Task dependency graph visualization
- [ ] Dark mode support
- [ ] Mobile responsive design improvements
- [ ] Task editing inline
- [ ] Bulk task operations
- [ ] Export task reports

## Tech Stack

- **Next.js 15** - React framework
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **@dnd-kit** - Drag and drop
- **Lucide React** - Icons
- **date-fns** - Date formatting

## License

MIT
