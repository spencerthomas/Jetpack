'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import KanbanBoard from '@/components/KanbanBoard';
import StatusDashboard from '@/components/StatusDashboard';
import ActivityFeed from '@/components/ActivityFeed';
import QueueDisplay from '@/components/QueueDisplay';
import { Task } from '@jetpack-agent/shared';
import { Plus, Scan, CheckCircle2, X, LayoutGrid, Clock, Tag, User, Link2, AlertCircle, ExternalLink, ChevronRight, ChevronDown, GitBranch, Box, Terminal } from 'lucide-react';
import { Button } from '@/components/ui';
import CreateTaskModal from '@/components/CreateTaskModal';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

// Agent type for status dashboard
interface Agent {
  id: string;
  name: string;
  status: 'idle' | 'busy' | 'offline' | 'error';
  skills: string[];
  currentTask: string | null;
}

// Animation styles for the board
const boardAnimationStyles = `
  @keyframes scanLine {
    0% { opacity: 0; transform: translateY(-100%); }
    10% { opacity: 1; }
    90% { opacity: 1; }
    100% { opacity: 0; transform: translateY(100%); }
  }
  @keyframes pulseGlow {
    0%, 100% { box-shadow: 0 0 0 0 rgba(79, 255, 238, 0.4); }
    50% { box-shadow: 0 0 15px 3px rgba(79, 255, 238, 0.2); }
  }
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes fadeInRow {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes statusPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  @keyframes depthLine {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes progressGrow {
    from { height: 0%; }
    to { height: var(--progress-height); }
  }
  @keyframes claimPulse {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; }
  }
`;

type BoardPhase = 'idle' | 'scanning' | 'claiming' | 'executing' | 'done';
type ViewMode = 'kanban' | 'table';

// Phase config for status display
const PHASE_CONFIG: Record<BoardPhase, { label: string; color: string }> = {
  idle: { label: 'READY', color: 'text-[#8b8b8e]' },
  scanning: { label: 'SCANNING', color: 'text-[rgb(79,255,238)]' },
  claiming: { label: 'CLAIMING', color: 'text-[#eab308]' },
  executing: { label: 'IN-PROGRESS', color: 'text-[rgb(79,255,238)]' },
  done: { label: 'DONE', color: 'text-[#22c55e]' },
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-[#8b8b8e]/20 text-[#8b8b8e] border border-[#8b8b8e]/30',
  ready: 'bg-[rgb(79,255,238)]/10 text-[rgb(79,255,238)] border border-[rgb(79,255,238)]/30',
  claimed: 'bg-[#a855f7]/10 text-[#a855f7] border border-[#a855f7]/30',
  in_progress: 'bg-[rgb(79,255,238)]/10 text-[rgb(79,255,238)] border border-[rgb(79,255,238)]/30',
  completed: 'bg-transparent text-[#8b8b8e]/70',
  failed: 'bg-[#ef4444]/20 text-[#ef4444] border border-[#ef4444]/30',
};

const STATUS_CIRCLE_COLORS: Record<string, string> = {
  pending: 'bg-[#8b8b8e]',
  ready: 'bg-[rgb(79,255,238)]',
  claimed: 'bg-[rgb(79,255,238)]',
  in_progress: 'bg-[rgb(79,255,238)]',
  completed: 'bg-[#8b8b8e]',
  failed: 'bg-[#ef4444]',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-[#8b8b8e]/20 text-[#8b8b8e]',
  medium: 'bg-[#3b82f6]/20 text-[#3b82f6]',
  high: 'bg-[#f97316]/20 text-[#f97316]',
  critical: 'bg-[#ef4444]/20 text-[#ef4444]',
};

// Task type colors for hierarchy levels
type TaskType = 'Epic' | 'Task' | 'Sub-task' | 'Leaf';

const TASK_TYPE_COLORS: Record<TaskType, string> = {
  'Epic': 'text-[#a855f7]',      // Purple
  'Task': 'text-[#3b82f6]',      // Blue
  'Sub-task': 'text-[#8b8b8e]',  // Gray
  'Leaf': 'text-[#22c55e]',      // Green
};

const TASK_TYPE_BG: Record<TaskType, string> = {
  'Epic': 'bg-[#a855f7]/10',
  'Task': 'bg-[#3b82f6]/10',
  'Sub-task': 'bg-[#8b8b8e]/10',
  'Leaf': 'bg-[#22c55e]/10',
};

// Get task type based on depth and children
const getTaskType = (depth: number, hasChildren: boolean): TaskType => {
  if (depth === 0) return 'Epic';
  if (depth === 1) return hasChildren ? 'Task' : 'Leaf';
  if (depth === 2) return hasChildren ? 'Sub-task' : 'Leaf';
  return 'Leaf';
};

// Hierarchical task node for tree view
interface TaskNode {
  task: Task;
  hierarchicalId: string;
  depth: number;
  children: TaskNode[];
  isLast: boolean;
  parentPath: boolean[]; // Track which parents are "last" for tree lines
  progress: number; // 0-100 completion percentage
}

export default function BoardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [phase, setPhase] = useState<BoardPhase>('idle');
  const [isConnected, setIsConnected] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [lastCommand, setLastCommand] = useState<string>('beads.list()');

  // Suppress unused variable warnings (used for future SSE/status features)
  void isConnected;
  void lastUpdate;

  // Compute task statistics
  const taskStats = useMemo(() => {
    const completed = tasks.filter(t => t.status === 'completed').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const pending = tasks.filter(t => t.status === 'pending' || t.status === 'ready').length;
    const claimed = tasks.filter(t => t.status === 'claimed').length;
    return { completed, inProgress, pending, claimed, total: tasks.length };
  }, [tasks]);

  // Determine current phase based on task states
  useEffect(() => {
    const hasInProgress = tasks.some(t => t.status === 'in_progress');
    const hasClaimed = tasks.some(t => t.status === 'claimed');
    const hasPending = tasks.some(t => t.status === 'pending' || t.status === 'ready');
    const allComplete = tasks.length > 0 && tasks.every(t => t.status === 'completed' || t.status === 'failed');

    if (allComplete && tasks.length > 0) {
      setPhase('done');
      setLastCommand('task completed ✓');
    } else if (hasInProgress) {
      setPhase('executing');
    } else if (hasClaimed) {
      setPhase('claiming');
      const claimedTask = tasks.find(t => t.status === 'claimed');
      if (claimedTask) {
        setLastCommand(`beads.claimTask("${claimedTask.id.slice(0, 12)}")`);
      }
    } else if (hasPending) {
      setPhase('scanning');
      setLastCommand('beads.list()');
    } else {
      setPhase('idle');
      setLastCommand('beads.list()');
    }
  }, [tasks]);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch tasks and agents in parallel
        const [tasksRes, agentsRes] = await Promise.all([
          fetch('/api/tasks'),
          fetch('/api/agents'),
        ]);

        const tasksData = await tasksRes.json();
        const agentsData = await agentsRes.json();

        setTasks(tasksData.tasks || []);
        setAgents(agentsData.agents || []);
        setIsConnected(true);
        setLastUpdate(new Date());
      } catch (error) {
        console.error('Failed to fetch data:', error);
        setIsConnected(false);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  // Auto-expand all root tasks on initial load
  useEffect(() => {
    if (tasks.length > 0 && expandedTasks.size === 0) {
      const taskMap = new Map(tasks.map(t => [t.id, t]));
      const roots = tasks.filter(t =>
        t.dependencies.length === 0 ||
        !t.dependencies.some(dep => taskMap.has(dep))
      );
      setExpandedTasks(new Set(roots.map(t => t.id)));
    }
  }, [tasks, expandedTasks.size]);

  const handleCreateTask = async (taskData: {
    title: string;
    description?: string;
    priority: string;
    requiredSkills: string[];
  }) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData),
      });

      if (res.ok) {
        const newTask = await res.json();
        setTasks([...tasks, newTask.task]);
        setShowCreateModal(false);
      }
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  const handleUpdateTask = async (taskId: string, updates: Partial<Task>) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        const updated = await res.json();
        setTasks(tasks.map(t => t.id === taskId ? updated.task : t));
      }
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const toggleExpanded = useCallback((taskId: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0d0d0f]">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-[rgb(79,255,238)] border-t-transparent mx-auto"></div>
            <Scan className="absolute inset-0 m-auto w-5 h-5 text-[rgb(79,255,238)] animate-pulse" />
          </div>
          <p className="mt-4 text-sm text-[#8b8b8e] font-mono">Loading task tree...</p>
        </div>
      </div>
    );
  }

  const phaseConfig = PHASE_CONFIG[phase];

  return (
    <>
      <style>{boardAnimationStyles}</style>
      <div className="flex flex-col h-full bg-[#0d0d0f]">
        {/* Terminal-style Header */}
        <div className="border-b border-[#26262a] bg-[#16161a]/50 backdrop-blur-sm shrink-0">
          {/* Command output bar */}
          <div className="h-12 flex items-center justify-between px-6 text-sm font-mono">
            <div className="flex items-center gap-3">
              <span className="text-[#8b8b8e]">beads.list()</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[#f7f8f8]">
                {taskStats.completed}/{taskStats.total} complete
              </span>
              <span className={clsx('font-semibold tracking-wide', phaseConfig.color)}>
                {phaseConfig.label}
              </span>
            </div>
          </div>
        </div>

        {/* Status Dashboard */}
        <StatusDashboard tasks={tasks} agents={agents} />

        {/* Queue Display - show pending/blocked tasks */}
        <QueueDisplay
          tasks={tasks}
          onTaskClick={(taskId) => {
            const task = tasks.find(t => t.id === taskId);
            if (task) setSelectedTask(task);
          }}
        />

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden relative flex">
          {/* Scan line overlay when scanning */}
          {phase === 'scanning' && (
            <div
              className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[rgb(79,255,238)] to-transparent opacity-50 z-10"
              style={{ animation: 'scanLine 2s ease-in-out infinite' }}
            />
          )}

          {/* Board/Table View */}
          <div className={clsx(
            'flex-1 overflow-hidden transition-all duration-300',
            selectedTask ? 'mr-[400px]' : ''
          )}>
            {viewMode === 'kanban' ? (
              <KanbanBoard tasks={tasks} onUpdateTask={handleUpdateTask} onTaskClick={setSelectedTask} />
            ) : (
              <HierarchicalBeadsView
                tasks={tasks}
                onTaskClick={setSelectedTask}
                selectedTaskId={selectedTask?.id}
                expandedTasks={expandedTasks}
                onToggleExpand={toggleExpanded}
              />
            )}
          </div>

          {/* Task Detail Panel */}
          {selectedTask && (
            <TaskDetailPanel task={selectedTask} onClose={() => setSelectedTask(null)} allTasks={tasks} />
          )}
        </div>

        {/* Activity Feed */}
        <ActivityFeed maxEvents={30} defaultExpanded={false} />

        {/* CLI Command Footer */}
        <div className="border-t border-[#26262a] bg-[#0d0d0f] px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-mono">
            <span className="text-[#8b8b8e]">$</span>
            <span className={clsx(
              phase === 'done' ? 'text-[#22c55e]' : 'text-[#f7f8f8]'
            )}>
              {lastCommand}
            </span>
            {phase === 'done' && <CheckCircle2 className="w-4 h-4 text-[#22c55e]" />}
          </div>
          <div className="flex items-center gap-4">
            {/* View Toggle */}
            <div className="flex items-center bg-[#1a1a1e] rounded-lg p-0.5 border border-[#26262a]">
              <button
                onClick={() => setViewMode('table')}
                className={clsx(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                  viewMode === 'table'
                    ? 'bg-[#26262a] text-[#f7f8f8]'
                    : 'text-[#8b8b8e] hover:text-[#f7f8f8]'
                )}
              >
                <Terminal className="w-3.5 h-3.5" />
                Tree
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={clsx(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                  viewMode === 'kanban'
                    ? 'bg-[#26262a] text-[#f7f8f8]'
                    : 'text-[#8b8b8e] hover:text-[#f7f8f8]'
                )}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Board
              </button>
            </div>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setShowCreateModal(true)}
            >
              New Task
            </Button>
          </div>
        </div>

        {/* Create Task Modal */}
        {showCreateModal && (
          <CreateTaskModal
            onClose={() => setShowCreateModal(false)}
            onCreate={handleCreateTask}
          />
        )}
      </div>
    </>
  );
}

// Hierarchical Beads View - Terminal-style tree view
function HierarchicalBeadsView({
  tasks,
  onTaskClick,
  selectedTaskId,
  expandedTasks,
  onToggleExpand,
}: {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  selectedTaskId?: string;
  expandedTasks: Set<string>;
  onToggleExpand: (taskId: string) => void;
}) {
  // Build hierarchical tree structure
  const { flatList } = useMemo(() => {
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const childMap = new Map<string, Task[]>();

    // Group tasks by their dependencies (parent)
    tasks.forEach(task => {
      if (task.dependencies.length > 0) {
        const parentId = task.dependencies[0];
        if (taskMap.has(parentId)) {
          if (!childMap.has(parentId)) {
            childMap.set(parentId, []);
          }
          childMap.get(parentId)!.push(task);
        }
      }
    });

    // Find root tasks
    const roots = tasks.filter(t =>
      t.dependencies.length === 0 ||
      !t.dependencies.some(dep => taskMap.has(dep))
    );

    // Generate hierarchical IDs and build tree
    const generateHierarchicalId = (baseId: string, index: number): string => {
      return `${baseId}.${index + 1}`;
    };

    // Calculate progress for a task (recursive)
    const calculateProgress = (task: Task, visited = new Set<string>()): number => {
      if (visited.has(task.id)) return 0;
      visited.add(task.id);

      const children = childMap.get(task.id) || [];
      if (children.length === 0) {
        // Leaf node - progress based on status
        switch (task.status) {
          case 'completed': return 100;
          case 'in_progress': return 66;
          case 'claimed': return 50;
          case 'ready': return 33;
          default: return 15;
        }
      }

      // Parent node - average of children
      const childProgress = children.reduce((sum, child) =>
        sum + calculateProgress(child, visited), 0
      );
      return Math.round(childProgress / children.length);
    };

    const buildNode = (
      task: Task,
      hierarchicalId: string,
      depth: number,
      parentPath: boolean[],
      isLast: boolean
    ): TaskNode => {
      const children = childMap.get(task.id) || [];
      const sortedChildren = children.sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      return {
        task,
        hierarchicalId,
        depth,
        isLast,
        parentPath,
        progress: calculateProgress(task),
        children: sortedChildren.map((child, idx) =>
          buildNode(
            child,
            generateHierarchicalId(hierarchicalId, idx),
            depth + 1,
            [...parentPath, !isLast],
            idx === sortedChildren.length - 1
          )
        ),
      };
    };

    // Build tree from roots
    const sortedRoots = roots.sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const tree = sortedRoots.map((root, idx) => {
      // Generate base hierarchical ID from task ID (bd-XXXX format)
      const baseId = root.id.startsWith('bd-') ? root.id.slice(0, 7) : `bd-${root.id.slice(0, 4)}`;
      return buildNode(root, baseId, 0, [], idx === sortedRoots.length - 1);
    });

    // Flatten tree for rendering (respecting expanded state)
    const flatten = (nodes: TaskNode[], expanded: Set<string>): TaskNode[] => {
      const result: TaskNode[] = [];
      nodes.forEach(node => {
        result.push(node);
        if (expanded.has(node.task.id) && node.children.length > 0) {
          result.push(...flatten(node.children, expanded));
        }
      });
      return result;
    };

    // Return both for potential future use (tree visualization)
    void tree; // taskTree available for tree diagram rendering
    return {
      flatList: flatten(tree, expandedTasks),
    };
  }, [tasks, expandedTasks]);

  return (
    <div className="h-full overflow-auto bg-[#0d0d0f] font-mono text-sm">
      {/* Rows */}
      <div className="min-w-[600px]">
        {flatList.map((node, index) => (
          <BeadRow
            key={node.task.id}
            node={node}
            index={index}
            isSelected={selectedTaskId === node.task.id}
            isExpanded={expandedTasks.has(node.task.id)}
            onClick={() => onTaskClick(node.task)}
            onToggleExpand={() => onToggleExpand(node.task.id)}
          />
        ))}
      </div>

      {flatList.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-[#8b8b8e]">
          <Box className="w-12 h-12 mb-3 text-[#26262a]" />
          <p className="text-sm">No tasks found</p>
          <p className="text-xs text-[#8b8b8e]/50 mt-1 font-sans">Create a task to get started</p>
        </div>
      )}
    </div>
  );
}

// Individual bead row component
function BeadRow({
  node,
  index,
  isSelected,
  isExpanded,
  onClick,
  onToggleExpand,
}: {
  node: TaskNode;
  index: number;
  isSelected: boolean;
  isExpanded: boolean;
  onClick: () => void;
  onToggleExpand: () => void;
}) {
  const { task, hierarchicalId, depth, parentPath, progress, children } = node;
  const hasChildren = children.length > 0;
  const isActive = task.status === 'in_progress' || task.status === 'claimed';
  const isCompleted = task.status === 'completed';

  // Calculate progress bar segments (3 bars like in the design)
  const progressBars = Math.ceil(progress / 33.34);

  return (
    <div
      onClick={onClick}
      className={clsx(
        'flex items-center px-4 py-2.5 cursor-pointer transition-all duration-150 group border-l-2',
        isSelected
          ? 'bg-[rgb(79,255,238)]/5 border-[rgb(79,255,238)]'
          : 'hover:bg-[#1a1a1e]/50 border-transparent',
        isActive && 'bg-[#16161a]',
        isCompleted && 'opacity-60'
      )}
      style={{
        animation: `fadeInRow 0.2s ease-out ${index * 0.02}s both`,
      }}
    >
      {/* Tree connectors - proper ASCII tree lines */}
      <div className="flex items-center mr-2 text-[#3a3a3f]" style={{ minWidth: `${depth * 20 + 8}px` }}>
        {/* Parent path vertical lines */}
        {parentPath.map((showLine, i) => (
          <span
            key={i}
            className="inline-block w-5 text-left"
          >
            {showLine ? '│' : ' '}
          </span>
        ))}

        {/* Current level connector */}
        {depth > 0 && (
          <span className="inline-block w-5 text-left whitespace-pre">
            {node.isLast ? '└─' : '├─'}
          </span>
        )}
      </div>

      {/* Expand/collapse button */}
      <div className="w-6 flex items-center justify-center mr-1">
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="p-0.5 hover:bg-[#26262a] rounded transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#8b8b8e]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#8b8b8e]" />
            )}
          </button>
        ) : null}
      </div>

      {/* Status circle */}
      <div className="relative mr-3 flex-shrink-0">
        <div
          className={clsx(
            'w-2.5 h-2.5 rounded-full',
            STATUS_CIRCLE_COLORS[task.status]
          )}
        />
        {isActive && (
          <div
            className={clsx(
              'absolute inset-0 w-2.5 h-2.5 rounded-full',
              STATUS_CIRCLE_COLORS[task.status]
            )}
            style={{ animation: 'statusPulse 1.5s ease-in-out infinite' }}
          />
        )}
      </div>

      {/* Hierarchical ID */}
      <span className={clsx(
        'w-28 flex-shrink-0 mr-2',
        isActive ? 'text-[#f7f8f8]' : 'text-[#8b8b8e]',
        isCompleted && 'text-[#8b8b8e]/60'
      )}>
        {hierarchicalId}
      </span>

      {/* Task Type Label */}
      {(() => {
        const taskType = getTaskType(depth, hasChildren);
        return (
          <span className={clsx(
            'w-16 flex-shrink-0 mr-3 px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider text-center',
            TASK_TYPE_COLORS[taskType],
            TASK_TYPE_BG[taskType]
          )}>
            {taskType}
          </span>
        );
      })()}

      {/* Title */}
      <span className={clsx(
        'flex-1 truncate mr-4',
        isActive ? 'text-[#f7f8f8]' : 'text-[#f7f8f8]/80',
        isCompleted && 'text-[#8b8b8e]/60'
      )}>
        {task.title}
      </span>

      {/* Status badge */}
      <span className={clsx(
        'px-2.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider mr-4 w-24 text-center',
        STATUS_COLORS[task.status]
      )}>
        {task.status.replace('_', '-')}
      </span>

      {/* Progress bars with percentage */}
      <div className="flex items-center gap-1.5 w-20 justify-end">
        <div className="flex items-center gap-0.5">
          {[1, 2, 3].map((barIndex) => (
            <div
              key={barIndex}
              className={clsx(
                'w-1.5 h-4 rounded-sm transition-all duration-300',
                barIndex <= progressBars
                  ? 'bg-[rgb(79,255,238)]'
                  : 'bg-[#26262a]'
              )}
              style={{
                opacity: barIndex <= progressBars ? 1 : 0.3,
              }}
            />
          ))}
        </div>
        <span className={clsx(
          'text-[10px] w-8 text-right tabular-nums',
          progress === 100 ? 'text-[#22c55e]' : 'text-[#8b8b8e]'
        )}>
          {progress}%
        </span>
      </div>
    </div>
  );
}

// Task Detail Panel Component
function TaskDetailPanel({ task, onClose, allTasks }: { task: Task; onClose: () => void; allTasks: Task[] }) {
  const createdAt = new Date(task.createdAt);

  // Find related tasks
  const dependencyTasks = allTasks.filter(t => task.dependencies.includes(t.id));
  const dependentTasks = allTasks.filter(t => t.dependencies.includes(task.id));

  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-[400px] bg-[#16161a] border-l border-[#26262a] overflow-y-auto"
      style={{ animation: 'slideIn 0.2s ease-out' }}
    >
      {/* Header */}
      <div className="sticky top-0 bg-[#16161a] border-b border-[#26262a] p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <span className="text-[#8b8b8e]">[</span>
          <span className="text-[#f7f8f8] tracking-widest text-xs font-semibold">TASK DETAIL</span>
          <span className="text-[#8b8b8e]">]</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-[#26262a] rounded transition-colors"
        >
          <X className="w-4 h-4 text-[#8b8b8e]" />
        </button>
      </div>

      <div className="p-4 space-y-6">
        {/* Title & Description */}
        <div>
          <h3 className="text-lg font-semibold text-[#f7f8f8] mb-2">{task.title}</h3>
          {task.description && (
            <p className="text-sm text-[#8b8b8e] leading-relaxed">{task.description}</p>
          )}
        </div>

        {/* Bead ID */}
        <div className="p-3 bg-[#0d0d0f] rounded-lg border border-[#26262a]">
          <div className="flex items-center gap-2 text-xs text-[#8b8b8e] mb-2">
            <Link2 className="w-3.5 h-3.5" />
            <span>Bead ID</span>
          </div>
          <code className="text-sm font-mono text-[rgb(79,255,238)] break-all">{task.id}</code>
          <a
            href={`/api/beads/${task.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center gap-1 text-xs text-[rgb(79,255,238)] hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            View raw file
          </a>
        </div>

        {/* Status & Priority */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-[#8b8b8e] mb-2">Status</div>
            <span className={clsx(
              'px-3 py-1.5 rounded text-sm font-medium',
              STATUS_COLORS[task.status] || STATUS_COLORS.pending
            )}>
              {task.status.replace('_', ' ')}
            </span>
          </div>
          <div>
            <div className="text-xs text-[#8b8b8e] mb-2">Priority</div>
            <span className={clsx(
              'px-3 py-1.5 rounded text-sm font-medium',
              PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium
            )}>
              {task.priority}
            </span>
          </div>
        </div>

        {/* Assigned Agent */}
        {task.assignedAgent && (
          <div>
            <div className="flex items-center gap-2 text-xs text-[#8b8b8e] mb-2">
              <User className="w-3.5 h-3.5" />
              <span>Assigned Agent</span>
            </div>
            <span className="text-sm text-[#f7f8f8] font-mono">{task.assignedAgent}</span>
          </div>
        )}

        {/* Required Skills */}
        {task.requiredSkills.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-xs text-[#8b8b8e] mb-2">
              <Tag className="w-3.5 h-3.5" />
              <span>Required Skills</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {task.requiredSkills.map(skill => (
                <span key={skill} className="text-xs bg-[#26262a] text-[#f7f8f8] px-2 py-1 rounded">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Dependencies (Parent Tasks) */}
        {dependencyTasks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-xs text-[#8b8b8e] mb-2">
              <GitBranch className="w-3.5 h-3.5 text-[#f97316]" />
              <span>Depends On ({dependencyTasks.length})</span>
            </div>
            <div className="space-y-1">
              {dependencyTasks.map(depTask => (
                <div key={depTask.id} className="flex items-center gap-2 text-xs bg-[#0d0d0f] px-2 py-1.5 rounded">
                  <div className={clsx('w-1.5 h-1.5 rounded-full', STATUS_CIRCLE_COLORS[depTask.status])} />
                  <span className="text-[#f7f8f8] truncate flex-1">{depTask.title}</span>
                  <span className="text-[#8b8b8e] font-mono">{depTask.id.slice(0, 6)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dependent Tasks (Children) */}
        {dependentTasks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-xs text-[#8b8b8e] mb-2">
              <GitBranch className="w-3.5 h-3.5 rotate-180 text-[rgb(79,255,238)]" />
              <span>Blocking ({dependentTasks.length})</span>
            </div>
            <div className="space-y-1">
              {dependentTasks.map(depTask => (
                <div key={depTask.id} className="flex items-center gap-2 text-xs bg-[#0d0d0f] px-2 py-1.5 rounded">
                  <div className={clsx('w-1.5 h-1.5 rounded-full', STATUS_CIRCLE_COLORS[depTask.status])} />
                  <span className="text-[#f7f8f8] truncate flex-1">{depTask.title}</span>
                  <span className="text-[#8b8b8e] font-mono">{depTask.id.slice(0, 6)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Blockers */}
        {task.blockers.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-xs text-[#8b8b8e] mb-2">
              <AlertCircle className="w-3.5 h-3.5 text-[#ef4444]" />
              <span>Blockers ({task.blockers.length})</span>
            </div>
            <div className="space-y-1">
              {task.blockers.map(blocker => (
                <div key={blocker} className="text-xs font-mono text-[#ef4444] bg-[#ef4444]/10 px-2 py-1 rounded">
                  {blocker}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Estimated Time */}
        {task.estimatedMinutes && (
          <div>
            <div className="flex items-center gap-2 text-xs text-[#8b8b8e] mb-2">
              <Clock className="w-3.5 h-3.5" />
              <span>Estimated Time</span>
            </div>
            <span className="text-sm text-[#f7f8f8]">{task.estimatedMinutes} minutes</span>
          </div>
        )}

        {/* Timestamps */}
        <div className="pt-4 border-t border-[#26262a] space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-[#8b8b8e]">Created</span>
            <span className="text-[#f7f8f8]">{createdAt.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8b8b8e]">Age</span>
            <span className="text-[#f7f8f8]">{formatDistanceToNow(createdAt, { addSuffix: true })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
