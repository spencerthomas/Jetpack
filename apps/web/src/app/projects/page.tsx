'use client';

import { useEffect, useState } from 'react';
import { FolderKanban, Plus, ArrowRight, Loader2 } from 'lucide-react';
import { Button, Badge, LiveIndicator } from '@/components/ui';
import Link from 'next/link';

interface Plan {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'approved' | 'executing' | 'completed' | 'failed';
  plannedTasks: Array<{
    id: string;
    title: string;
    status?: string;
  }>;
  executionHistory: Array<{
    status: string;
    taskResults?: Record<string, { status: string }>;
  }>;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

const statusVariants = {
  draft: 'default',
  approved: 'info',
  executing: 'warning',
  completed: 'success',
  failed: 'error',
} as const;

export default function ProjectsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    async function fetchPlans() {
      try {
        const res = await fetch('/api/plans');
        const data = await res.json();
        setPlans(data.plans || []);
        setIsConnected(true);
      } catch (error) {
        console.error('Failed to fetch plans:', error);
        setIsConnected(false);
      } finally {
        setLoading(false);
      }
    }

    fetchPlans();
    const interval = setInterval(fetchPlans, 5000);
    return () => clearInterval(interval);
  }, []);

  // Calculate completed tasks for a plan
  const getCompletedCount = (plan: Plan): number => {
    const latestExecution = plan.executionHistory[plan.executionHistory.length - 1];
    if (!latestExecution?.taskResults) return 0;
    return Object.values(latestExecution.taskResults).filter(r => r.status === 'completed').length;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[rgb(79,255,238)] mx-auto" />
          <p className="mt-4 text-sm text-[#8b8b8e]">Loading projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0d0d0f]">
      {/* Page Header */}
      <div className="h-14 flex items-center justify-between px-6 border-b border-[#26262a] shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[#8b8b8e]">[</span>
            <span className="text-[#f7f8f8] tracking-widest text-sm font-semibold">PROJECTS</span>
            <span className="text-[#8b8b8e]">]</span>
          </div>
          <LiveIndicator
            label={isConnected ? 'CONNECTED' : 'OFFLINE'}
            variant={isConnected ? 'success' : 'error'}
          />
        </div>
        <Link href="/plans">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
          >
            New Project
          </Button>
        </Link>
      </div>

      {/* Stats Bar */}
      <div className="h-10 flex items-center px-6 border-b border-[#26262a]/50 bg-[#16161a]/30 text-xs font-mono">
        <span className="text-[#8b8b8e]/50 mr-2">$</span>
        <span className="text-[#8b8b8e]">projects.list()</span>
        <span className="text-[#26262a] mx-2">→</span>
        <span className="text-[#f7f8f8]">{plans.length} project{plans.length !== 1 ? 's' : ''}</span>
        <span className="mx-4 text-[#26262a]">|</span>
        <span className="text-[#22c55e]">{plans.filter(p => p.status === 'completed').length} completed</span>
        <span className="mx-2 text-[#26262a]">•</span>
        <span className="text-[#eab308]">{plans.filter(p => p.status === 'executing').length} executing</span>
        <span className="mx-2 text-[#26262a]">•</span>
        <span className="text-[#8b8b8e]">{plans.filter(p => p.status === 'draft').length} draft</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {plans.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FolderKanban className="w-16 h-16 text-[#8b8b8e]/50 mb-4" />
            <p className="text-[#f7f8f8] font-medium">No projects yet</p>
            <p className="text-sm text-[#8b8b8e] mt-1">
              Create a plan to start a new project
            </p>
            <Link href="/plans">
              <Button
                variant="primary"
                size="sm"
                className="mt-4"
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Create Project
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const completedCount = getCompletedCount(plan);
              const taskCount = plan.plannedTasks.length;

              return (
                <Link
                  key={plan.id}
                  href={`/plans/${plan.id}`}
                  className="group p-5 rounded-lg bg-[#16161a] border border-[#26262a] hover:border-[rgb(79,255,238)]/50 transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-[rgb(79,255,238)]/10 text-[rgb(79,255,238)] flex items-center justify-center">
                      <FolderKanban className="w-5 h-5" />
                    </div>
                    <Badge variant={statusVariants[plan.status]} size="sm">
                      {plan.status}
                    </Badge>
                  </div>

                  <h3 className="font-medium text-[#f7f8f8] mb-1 group-hover:text-[rgb(79,255,238)] transition-colors">
                    {plan.name}
                  </h3>
                  <p className="text-sm text-[#8b8b8e] line-clamp-2 mb-4">
                    {plan.description}
                  </p>

                  {/* Tags */}
                  {plan.tags && plan.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {plan.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-2xs bg-[#26262a] text-[#8b8b8e] px-1.5 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Progress */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-[#8b8b8e]">Progress</span>
                      <span className="text-[#f7f8f8]">
                        {completedCount}/{taskCount} tasks
                      </span>
                    </div>
                    <div className="h-1.5 bg-[#26262a] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#22c55e] rounded-full transition-all"
                        style={{
                          width: `${taskCount > 0 ? (completedCount / taskCount) * 100 : 0}%`
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8b8b8e]">
                      {taskCount} task{taskCount !== 1 ? 's' : ''}
                    </span>
                    <ArrowRight className="w-4 h-4 text-[#8b8b8e] group-hover:text-[rgb(79,255,238)] group-hover:translate-x-0.5 transition-all" />
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
