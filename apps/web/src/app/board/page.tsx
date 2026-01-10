'use client';

import { useEffect, useState, useMemo } from 'react';
import KanbanBoard from '@/components/KanbanBoard';
import { Task } from '@jetpack/shared';
import { Plus, Scan, Loader2, CheckCircle2, X, LayoutGrid, List, Clock, Tag, User, Link2, ChevronRight, AlertCircle, ExternalLink, Hash } from 'lucide-react';
import { Button, LiveIndicator, Badge } from '@/components/ui';
import CreateTaskModal from '@/components/CreateTaskModal';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

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
`;

type BoardPhase = 'idle' | 'scanning' | 'claiming' | 'executing';
type ViewMode = 'kanban' | 'table';

// Phase config for status display
const PHASE_CONFIG: Record<BoardPhase, { label: string; color: string }> = {
  idle: { label: 'READY', color: 'text-[#8b8b8e]' },
  scanning: { label: 'SCANNING', color: 'text-[rgb(79,255,238)]' },
  claiming: { label: 'CLAIMING', color: 'text-[#eab308]' },
  executing: { label: 'EXECUTING', color: 'text-[#22c55e]' },
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-[#8b8b8e]/20 text-[#8b8b8e]',
  ready: 'bg-[rgb(79,255,238)]/20 text-[rgb(79,255,238)]',
  claimed: 'bg-[#a855f7]/20 text-[#a855f7]',
  in_progress: 'bg-[#eab308]/20 text-[#eab308]',
  completed: 'bg-[#22c55e]/20 text-[#22c55e]',
  failed: 'bg-[#ef4444]/20 text-[#ef4444]',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-[#8b8b8e]/20 text-[#8b8b8e]',
  medium: 'bg-[#3b82f6]/20 text-[#3b82f6]',
  high: 'bg-[#f97316]/20 text-[#f97316]',
  critical: 'bg-[#ef4444]/20 text-[#ef4444]',
};

export default function BoardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [phase, setPhase] = useState<BoardPhase>('idle');
  const [isConnected, setIsConnected] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

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

    if (hasInProgress) {
      setPhase('executing');
    } else if (hasClaimed) {
      setPhase('claiming');
    } else if (hasPending) {
      setPhase('scanning');
    } else {
      setPhase('idle');
    }
  }, [tasks]);

  useEffect(() => {
    async function fetchTasks() {
      try {
        const res = await fetch('/api/tasks');
        const data = await res.json();
        setTasks(data.tasks || []);
        setIsConnected(true);
        setLastUpdate(new Date());
      } catch (error) {
        console.error('Failed to fetch tasks:', error);
        setIsConnected(false);
      } finally {
        setLoading(false);
      }
    }

    fetchTasks();
    const interval = setInterval(fetchTasks, 2000);
    return () => clearInterval(interval);
  }, []);

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
          {/* Main header row */}
          <div className="h-14 flex items-center justify-between px-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[#8b8b8e]">[</span>
                <span className="text-[#f7f8f8] tracking-widest text-sm font-semibold">BEADS</span>
                <span className="text-[#8b8b8e]">]</span>
              </div>
              <LiveIndicator
                label={isConnected ? 'SYNC' : 'OFFLINE'}
                variant={isConnected ? 'success' : 'error'}
              />
              <span className={`text-xs font-mono ${phaseConfig.color}`}>
                {phaseConfig.label}
                {phase !== 'idle' && <span className="animate-pulse">...</span>}
              </span>
            </div>
            <div className="flex items-center gap-4">
              {/* Task stats */}
              <div className="flex items-center gap-3 text-xs text-[#8b8b8e]">
                <span className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#8b8b8e]" />
                  {taskStats.pending}
                </span>
                <span className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#eab308]" />
                  {taskStats.claimed}
                </span>
                <span className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[rgb(79,255,238)]" />
                  {taskStats.inProgress}
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e]" />
                  {taskStats.completed}
                </span>
              </div>
              <div className="h-6 w-px bg-[#26262a]" />
              {/* View Toggle */}
              <div className="flex items-center bg-[#1a1a1e] rounded-lg p-0.5 border border-[#26262a]">
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
                <button
                  onClick={() => setViewMode('table')}
                  className={clsx(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                    viewMode === 'table'
                      ? 'bg-[#26262a] text-[#f7f8f8]'
                      : 'text-[#8b8b8e] hover:text-[#f7f8f8]'
                  )}
                >
                  <List className="w-3.5 h-3.5" />
                  Table
                </button>
              </div>
              <div className="h-6 w-px bg-[#26262a]" />
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

          {/* Command output bar */}
          <div className="h-8 flex items-center justify-between px-6 border-t border-[#26262a]/50 bg-[#0d0d0f]/50 text-xs font-mono">
            <div className="flex items-center">
              <span className="text-[#8b8b8e]/50 mr-2">$</span>
              <span className="text-[#8b8b8e]">beads.list()</span>
              <span className="text-[#26262a] mx-2">→</span>
              <span className="text-[#f7f8f8]">
                {taskStats.total} task{taskStats.total !== 1 ? 's' : ''} loaded
              </span>
              {phase === 'scanning' && (
                <span className="ml-4 text-[rgb(79,255,238)]">
                  <Scan className="w-3 h-3 inline animate-pulse mr-1" />
                  scanning for ready tasks...
                </span>
              )}
              {phase === 'executing' && (
                <span className="ml-4 text-[#22c55e]">
                  <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
                  {taskStats.inProgress} task{taskStats.inProgress !== 1 ? 's' : ''} executing
                </span>
              )}
            </div>
            <span className="text-[#8b8b8e]/50">
              synced {lastUpdate.toLocaleTimeString()}
            </span>
          </div>
        </div>

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
              <TableView tasks={tasks} onTaskClick={setSelectedTask} selectedTaskId={selectedTask?.id} />
            )}
          </div>

          {/* Task Detail Panel */}
          {selectedTask && (
            <TaskDetailPanel task={selectedTask} onClose={() => setSelectedTask(null)} />
          )}
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

// Table View Component
function TableView({
  tasks,
  onTaskClick,
  selectedTaskId
}: {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  selectedTaskId?: string;
}) {
  // Sort by sequence (creation order) - using createdAt as proxy for sequence
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateA - dateB;
    });
  }, [tasks]);

  return (
    <div className="h-full overflow-auto">
      <table className="w-full min-w-[900px]">
        <thead className="sticky top-0 bg-[#16161a] border-b border-[#26262a]">
          <tr className="text-left text-xs font-medium text-[#8b8b8e]">
            <th className="px-4 py-3 w-16">
              <Hash className="w-3.5 h-3.5" />
            </th>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3 w-28">Status</th>
            <th className="px-4 py-3 w-24">Priority</th>
            <th className="px-4 py-3 w-40">Skills</th>
            <th className="px-4 py-3 w-32">Bead ID</th>
            <th className="px-4 py-3 w-32">Agent</th>
            <th className="px-4 py-3 w-28">Created</th>
          </tr>
        </thead>
        <tbody>
          {sortedTasks.map((task, index) => (
            <tr
              key={task.id}
              onClick={() => onTaskClick(task)}
              className={clsx(
                'border-b border-[#26262a]/50 hover:bg-[#1a1a1e] cursor-pointer transition-colors',
                selectedTaskId === task.id && 'bg-[#1a1a1e]'
              )}
            >
              <td className="px-4 py-3 text-xs font-mono text-[#8b8b8e]">
                {index + 1}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                  <span className="text-sm text-[#f7f8f8] font-medium">{task.title}</span>
                  {task.description && (
                    <span className="text-xs text-[#8b8b8e] line-clamp-1">{task.description}</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <span className={clsx(
                  'px-2 py-1 rounded text-xs font-medium',
                  STATUS_COLORS[task.status] || STATUS_COLORS.pending
                )}>
                  {task.status.replace('_', ' ')}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={clsx(
                  'px-2 py-1 rounded text-xs font-medium',
                  PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium
                )}>
                  {task.priority}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {task.requiredSkills.slice(0, 2).map(skill => (
                    <span key={skill} className="text-2xs bg-[#26262a] text-[#8b8b8e] px-1.5 py-0.5 rounded">
                      {skill}
                    </span>
                  ))}
                  {task.requiredSkills.length > 2 && (
                    <span className="text-2xs text-[#8b8b8e]">+{task.requiredSkills.length - 2}</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <a
                  href={`/api/beads/${task.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-xs font-mono text-[rgb(79,255,238)] hover:underline"
                >
                  <Link2 className="w-3 h-3" />
                  {task.id.slice(0, 12)}...
                </a>
              </td>
              <td className="px-4 py-3 text-xs text-[#8b8b8e]">
                {task.assignedAgent || '—'}
              </td>
              <td className="px-4 py-3 text-xs text-[#8b8b8e]">
                {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sortedTasks.length === 0 && (
        <div className="flex items-center justify-center h-64 text-[#8b8b8e]">
          No tasks found
        </div>
      )}
    </div>
  );
}

// Task Detail Panel Component
function TaskDetailPanel({ task, onClose }: { task: Task; onClose: () => void }) {
  const createdAt = new Date(task.createdAt);

  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-[400px] bg-[#16161a] border-l border-[#26262a] overflow-y-auto"
      style={{ animation: 'slideIn 0.2s ease-out' }}
    >
      {/* Header */}
      <div className="sticky top-0 bg-[#16161a] border-b border-[#26262a] p-4 flex items-center justify-between">
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

        {/* Dependencies */}
        {task.dependencies.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-xs text-[#8b8b8e] mb-2">
              <AlertCircle className="w-3.5 h-3.5 text-[#f97316]" />
              <span>Dependencies ({task.dependencies.length})</span>
            </div>
            <div className="space-y-1">
              {task.dependencies.map(depId => (
                <div key={depId} className="text-xs font-mono text-[#8b8b8e] bg-[#0d0d0f] px-2 py-1 rounded">
                  {depId}
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
