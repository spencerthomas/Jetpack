'use client';

import { useMemo } from 'react';
import { CheckCircle2, Clock, AlertCircle, Users, Activity, Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface Task {
  id: string;
  status: string;
  title?: string;
}

interface Agent {
  id: string;
  name: string;
  status: 'idle' | 'busy' | 'offline' | 'error';
  currentTask?: string | null;
}

interface StatusDashboardProps {
  tasks: Task[];
  agents: Agent[];
  className?: string;
}

interface StatItemProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
  pulse?: boolean;
}

function StatItem({ icon, label, value, color, pulse }: StatItemProps) {
  return (
    <div className="flex items-center gap-2">
      <div className={clsx(
        'flex items-center justify-center w-5 h-5',
        color,
        pulse && 'animate-pulse'
      )}>
        {icon}
      </div>
      <span className="text-[#8b8b8e] text-xs">{label}</span>
      <span className={clsx('font-mono text-sm font-medium', color)}>{value}</span>
    </div>
  );
}

export default function StatusDashboard({ tasks, agents, className }: StatusDashboardProps) {
  const stats = useMemo(() => {
    // Task stats
    const completed = tasks.filter(t => t.status === 'completed').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress' || t.status === 'claimed').length;
    const pending = tasks.filter(t => t.status === 'pending' || t.status === 'ready').length;
    const failed = tasks.filter(t => t.status === 'failed').length;

    // Agent stats
    const idle = agents.filter(a => a.status === 'idle').length;
    const busy = agents.filter(a => a.status === 'busy').length;
    const total = agents.length;

    // Active task (first in_progress or claimed)
    const activeTask = tasks.find(t => t.status === 'in_progress' || t.status === 'claimed');

    return {
      completed,
      inProgress,
      pending,
      failed,
      agents: { idle, busy, total },
      activeTask,
    };
  }, [tasks, agents]);

  return (
    <div className={clsx(
      'flex items-center gap-6 px-6 py-2.5 bg-[#0d0d0f] border-b border-[#26262a]',
      'text-sm font-mono',
      className
    )}>
      {/* Task Stats */}
      <div className="flex items-center gap-6">
        <StatItem
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="completed"
          value={stats.completed}
          color="text-[#22c55e]"
        />
        <StatItem
          icon={<Loader2 className="w-4 h-4" />}
          label="in-progress"
          value={stats.inProgress}
          color="text-[rgb(79,255,238)]"
          pulse={stats.inProgress > 0}
        />
        <StatItem
          icon={<Clock className="w-4 h-4" />}
          label="queued"
          value={stats.pending}
          color="text-[#8b8b8e]"
        />
        {stats.failed > 0 && (
          <StatItem
            icon={<AlertCircle className="w-4 h-4" />}
            label="failed"
            value={stats.failed}
            color="text-[#ef4444]"
          />
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-[#26262a]" />

      {/* Agent Stats */}
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-[#8b8b8e]" />
        <span className="text-[#8b8b8e] text-xs">agents</span>
        <span className="font-mono text-sm">
          <span className="text-[#22c55e]">{stats.agents.idle}</span>
          <span className="text-[#8b8b8e]"> idle</span>
          {stats.agents.busy > 0 && (
            <>
              <span className="text-[#8b8b8e]"> / </span>
              <span className="text-[rgb(79,255,238)]">{stats.agents.busy}</span>
              <span className="text-[#8b8b8e]"> busy</span>
            </>
          )}
        </span>
      </div>

      {/* Active Task Indicator */}
      {stats.activeTask && (
        <>
          <div className="w-px h-4 bg-[#26262a]" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Activity className="w-4 h-4 text-[rgb(79,255,238)] animate-pulse flex-shrink-0" />
            <span className="text-[#8b8b8e] text-xs flex-shrink-0">active:</span>
            <span className="text-[#f7f8f8] text-xs truncate">
              {stats.activeTask.title || stats.activeTask.id}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
