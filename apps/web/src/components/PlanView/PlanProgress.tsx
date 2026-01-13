'use client';

import { CheckCircle2, Loader2, AlertCircle, Clock, Users } from 'lucide-react';
import type { Plan, PlanItem } from '@jetpack/shared';

interface PlanProgressProps {
  plan: Plan;
  stats?: {
    total: number;
    pending: number;
    converted: number;
    inProgress: number;
    completed: number;
    failed: number;
  };
}

interface ActiveAgent {
  id: string;
  name: string;
  taskTitle: string;
  elapsed?: number;
}

export function PlanProgress({ plan, stats }: PlanProgressProps) {
  // Calculate stats from plan items if not provided
  const calculatedStats = stats || calculateStats(plan.items);
  const { total, pending, converted, inProgress, completed, failed } = calculatedStats;

  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isExecuting = plan.status === 'executing';
  const isDone = plan.status === 'completed' || progressPercent === 100;
  const hasFailed = failed > 0;

  // Find active agents
  const activeAgents: ActiveAgent[] = [];
  function findActiveItems(items: PlanItem[]) {
    for (const item of items) {
      if (item.status === 'in_progress' && item.assignedAgent) {
        activeAgents.push({
          id: item.assignedAgent,
          name: item.assignedAgent,
          taskTitle: item.title,
          elapsed: item.startedAt
            ? Math.floor((Date.now() - new Date(item.startedAt).getTime()) / 1000)
            : undefined,
        });
      }
      if (item.children) {
        findActiveItems(item.children);
      }
    }
  }
  findActiveItems(plan.items);

  const formatElapsed = (seconds?: number) => {
    if (!seconds) return '';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-[#8b8b8e]">Progress</span>
            <span className="text-xs text-[#f7f8f8] font-mono">
              {completed}/{total} tasks
            </span>
          </div>
          <div className="h-2 bg-[#26262a] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                hasFailed
                  ? 'bg-gradient-to-r from-[#22c55e] to-[#ff6467]'
                  : isDone
                  ? 'bg-[#22c55e]'
                  : 'bg-gradient-to-r from-[rgb(79,255,238)] to-[rgb(79,255,238)]/50'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <div
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
            isDone
              ? 'bg-[#22c55e]/20 text-[#22c55e]'
              : hasFailed
              ? 'bg-[#ff6467]/20 text-[#ff6467]'
              : isExecuting
              ? 'bg-[#f59e0b]/20 text-[#f59e0b]'
              : 'bg-[#26262a] text-[#8b8b8e]'
          }`}
        >
          {progressPercent}%
        </div>
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-5 gap-2">
        <StatusCard
          icon={<Clock className="w-3.5 h-3.5" />}
          label="Pending"
          count={pending}
          color="text-[#8b8b8e]"
        />
        <StatusCard
          icon={<Clock className="w-3.5 h-3.5" />}
          label="Queued"
          count={converted}
          color="text-[rgb(79,255,238)]"
        />
        <StatusCard
          icon={<Loader2 className="w-3.5 h-3.5 animate-spin" />}
          label="Running"
          count={inProgress}
          color="text-[#f59e0b]"
        />
        <StatusCard
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
          label="Done"
          count={completed}
          color="text-[#22c55e]"
        />
        <StatusCard
          icon={<AlertCircle className="w-3.5 h-3.5" />}
          label="Failed"
          count={failed}
          color="text-[#ff6467]"
        />
      </div>

      {/* Active agents */}
      {activeAgents.length > 0 && (
        <div className="pt-4 border-t border-[#26262a]">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-[#f59e0b]" />
            <span className="text-xs text-[#8b8b8e] uppercase tracking-wide">
              Active Agents
            </span>
          </div>
          <div className="space-y-2">
            {activeAgents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#1a1a1e]/50 border border-[#26262a]"
              >
                <div className="w-8 h-8 rounded-full bg-[#f59e0b]/20 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-[#f59e0b] animate-spin" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#f7f8f8] truncate">{agent.taskTitle}</p>
                  <p className="text-xs text-[#8b8b8e]">
                    {agent.name}
                    {agent.elapsed && (
                      <span className="ml-2 text-[#f59e0b]">
                        {formatElapsed(agent.elapsed)}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusCard({
  icon,
  label,
  count,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-2 px-1 rounded-lg bg-[#1a1a1e]/50">
      <div className={`${color} mb-1`}>{icon}</div>
      <span className="text-lg font-semibold text-[#f7f8f8]">{count}</span>
      <span className="text-[10px] text-[#8b8b8e]">{label}</span>
    </div>
  );
}

function calculateStats(items: PlanItem[]): {
  total: number;
  pending: number;
  converted: number;
  inProgress: number;
  completed: number;
  failed: number;
} {
  const stats = {
    total: 0,
    pending: 0,
    converted: 0,
    inProgress: 0,
    completed: 0,
    failed: 0,
  };

  function countItems(items: PlanItem[]) {
    for (const item of items) {
      stats.total++;
      switch (item.status) {
        case 'pending':
          stats.pending++;
          break;
        case 'converted':
          stats.converted++;
          break;
        case 'in_progress':
          stats.inProgress++;
          break;
        case 'completed':
          stats.completed++;
          break;
        case 'failed':
          stats.failed++;
          break;
      }
      if (item.children) {
        countItems(item.children);
      }
    }
  }

  countItems(items);
  return stats;
}
