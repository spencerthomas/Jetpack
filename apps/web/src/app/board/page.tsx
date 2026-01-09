'use client';

import { useEffect, useState, useMemo } from 'react';
import KanbanBoard from '@/components/KanbanBoard';
import { Task } from '@jetpack/shared';
import { Plus, Scan, Loader2, CheckCircle2 } from 'lucide-react';
import { Button, LiveIndicator } from '@/components/ui';
import CreateTaskModal from '@/components/CreateTaskModal';

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
`;

type BoardPhase = 'idle' | 'scanning' | 'claiming' | 'executing';

// Phase config for status display
const PHASE_CONFIG: Record<BoardPhase, { label: string; color: string }> = {
  idle: { label: 'READY', color: 'text-[#8b8b8e]' },
  scanning: { label: 'SCANNING', color: 'text-[rgb(79,255,238)]' },
  claiming: { label: 'CLAIMING', color: 'text-[#eab308]' },
  executing: { label: 'EXECUTING', color: 'text-[#22c55e]' },
};

export default function BoardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [phase, setPhase] = useState<BoardPhase>('idle');
  const [isConnected, setIsConnected] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

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

        {/* Kanban Board */}
        <div className="flex-1 overflow-hidden relative">
          {/* Scan line overlay when scanning */}
          {phase === 'scanning' && (
            <div
              className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[rgb(79,255,238)] to-transparent opacity-50 z-10"
              style={{ animation: 'scanLine 2s ease-in-out infinite' }}
            />
          )}
          <KanbanBoard tasks={tasks} onUpdateTask={handleUpdateTask} />
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
