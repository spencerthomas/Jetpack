'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  GitBranch,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  FileText,
  Tag,
  ChevronRight,
  Layers,
  Timer,
} from 'lucide-react';
import { LiveIndicator } from '@/components/ui';

type PlanStatus = 'draft' | 'approved' | 'executing' | 'completed' | 'failed';

interface PlannedTask {
  id: string;
  title: string;
  description: string;
  requiredSkills: string[];
  estimatedMinutes: number;
  dependsOn: string[];
}

interface Plan {
  id: string;
  name: string;
  description?: string;
  userRequest: string;
  status: PlanStatus;
  plannedTasks: PlannedTask[];
  createdAt: string;
  updatedAt: string;
  estimatedDuration?: number;
  tags: string[];
  isTemplate: boolean;
}

const STATUS_CONFIG: Record<PlanStatus, { color: string; icon: React.ReactNode; label: string }> = {
  draft: {
    color: 'text-[#8b8b8e]',
    icon: <FileText className="w-3.5 h-3.5" />,
    label: 'Draft',
  },
  approved: {
    color: 'text-[rgb(79,255,238)]',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    label: 'Approved',
  },
  executing: {
    color: 'text-[#f59e0b]',
    icon: <Play className="w-3.5 h-3.5" />,
    label: 'Executing',
  },
  completed: {
    color: 'text-[#22c55e]',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    label: 'Completed',
  },
  failed: {
    color: 'text-[#ff6467]',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
    label: 'Failed',
  },
};

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'templates'>('all');

  useEffect(() => {
    async function fetchPlans() {
      try {
        const res = await fetch('/api/plans');
        const data = await res.json();
        setPlans(data.plans || []);
      } catch (error) {
        console.error('Failed to fetch plans:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchPlans();
  }, []);

  const filteredPlans = plans.filter((plan) => {
    if (filter === 'templates') return plan.isTemplate;
    if (filter === 'active') return ['draft', 'approved', 'executing'].includes(plan.status);
    return true;
  });

  const stats = {
    total: plans.length,
    draft: plans.filter((p) => p.status === 'draft').length,
    executing: plans.filter((p) => p.status === 'executing').length,
    completed: plans.filter((p) => p.status === 'completed').length,
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0d0d0f]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-[rgb(79,255,238)] border-t-transparent mx-auto"></div>
          <p className="mt-4 text-sm text-[#8b8b8e] font-mono">Loading plans...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0d0d0f]">
      {/* Header */}
      <div className="border-b border-[#26262a] bg-[#16161a]/50 backdrop-blur-sm shrink-0">
        <div className="h-14 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[#8b8b8e]">[</span>
              <span className="text-[#f7f8f8] tracking-widest text-sm font-semibold">PLANS</span>
              <span className="text-[#8b8b8e]">]</span>
            </div>
            <LiveIndicator label="CONNECTED" variant="success" />
          </div>
          <div className="flex items-center gap-4">
            {/* Stats */}
            <div className="flex items-center gap-3 text-xs text-[#8b8b8e]">
              <span>{stats.draft} draft</span>
              <span className="text-[#f59e0b]">{stats.executing} executing</span>
              <span className="text-[#22c55e]">{stats.completed} completed</span>
            </div>
            <div className="h-6 w-px bg-[#26262a]" />
            <Link
              href="/plans/new"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgb(79,255,238)] text-black text-sm font-medium hover:bg-[rgb(79,255,238)]/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Plan
            </Link>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="h-10 flex items-center px-6 border-t border-[#26262a]/50 bg-[#0d0d0f]/50">
          <div className="flex items-center gap-1">
            {(['all', 'active', 'templates'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  filter === tab
                    ? 'bg-[#26262a] text-[#f7f8f8]'
                    : 'text-[#8b8b8e] hover:text-[#f7f8f8]'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredPlans.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-full bg-[#2a2a30] flex items-center justify-center mb-4">
              <GitBranch className="w-10 h-10 text-[#8b8b8e]" />
            </div>
            <p className="text-[#f7f8f8] font-medium">No plans yet</p>
            <p className="text-sm text-[#8b8b8e] mt-1">
              Create a plan to orchestrate tasks for your agents
            </p>
            <Link
              href="/plans/new"
              className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-[rgb(79,255,238)] text-black text-sm font-medium hover:bg-[rgb(79,255,238)]/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create your first plan
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPlans.map((plan) => {
              const statusConfig = STATUS_CONFIG[plan.status];

              return (
                <Link
                  key={plan.id}
                  href={`/plans/${plan.id}`}
                  className="group rounded-xl bg-[#16161a]/50 border border-[#26262a] backdrop-blur-sm hover:border-[rgb(79,255,238)]/30 transition-all duration-300 overflow-hidden"
                >
                  {/* Header */}
                  <div className="p-5 border-b border-[#26262a]/50">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            plan.status === 'executing'
                              ? 'bg-[#f59e0b]/20 text-[#f59e0b]'
                              : plan.status === 'completed'
                              ? 'bg-[#22c55e]/20 text-[#22c55e]'
                              : plan.status === 'failed'
                              ? 'bg-[#ff6467]/20 text-[#ff6467]'
                              : 'bg-[#2a2a30] text-[#8b8b8e]'
                          }`}
                        >
                          <GitBranch className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-[#f7f8f8] truncate group-hover:text-[rgb(79,255,238)] transition-colors">
                            {plan.name}
                          </h3>
                          <p className="text-xs text-[#8b8b8e] font-mono">{plan.id}</p>
                        </div>
                      </div>
                      <div
                        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${statusConfig.color}`}
                      >
                        {statusConfig.icon}
                        <span>{statusConfig.label}</span>
                      </div>
                    </div>

                    {plan.description && (
                      <p className="text-sm text-[#8b8b8e] line-clamp-2">{plan.description}</p>
                    )}
                  </div>

                  {/* Tasks preview */}
                  <div className="px-5 py-3 border-b border-[#26262a]/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Layers className="w-3.5 h-3.5 text-[#8b8b8e]" />
                      <span className="text-xs text-[#8b8b8e]">
                        {plan.plannedTasks.length} task{plan.plannedTasks.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {plan.plannedTasks.slice(0, 3).map((task, idx) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-2 text-xs text-[#f7f8f8]/70"
                        >
                          <span className="text-[#8b8b8e]">{idx + 1}.</span>
                          <span className="truncate">{task.title}</span>
                        </div>
                      ))}
                      {plan.plannedTasks.length > 3 && (
                        <div className="text-xs text-[#8b8b8e]">
                          +{plan.plannedTasks.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tags */}
                  {plan.tags.length > 0 && (
                    <div className="px-5 py-2 border-b border-[#26262a]/50">
                      <div className="flex flex-wrap gap-1.5">
                        {plan.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-[#26262a] text-[#8b8b8e]"
                          >
                            <Tag className="w-3 h-3" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="px-5 py-3 flex items-center justify-between text-xs bg-[#16161a]/30">
                    <div className="flex items-center gap-1.5 text-[#8b8b8e]">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatDate(plan.updatedAt)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {plan.estimatedDuration && (
                        <div className="flex items-center gap-1.5 text-[#8b8b8e]">
                          <Timer className="w-3.5 h-3.5" />
                          <span>~{formatDuration(plan.estimatedDuration)}</span>
                        </div>
                      )}
                      <ChevronRight className="w-4 h-4 text-[#8b8b8e] group-hover:text-[rgb(79,255,238)] transition-colors" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
