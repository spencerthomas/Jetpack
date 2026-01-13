'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  GitBranch,
  ArrowLeft,
  Edit2,
  Trash2,
  Clock,
  Tag,
  Save,
  X,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui';
import { PlanView } from '@/components/PlanView';
import { usePlanProgress } from '@/hooks';
import type { Plan, PlanStatus } from '@jetpack/shared';

const STATUS_BADGES: Record<
  PlanStatus,
  { variant: 'default' | 'primary' | 'success' | 'warning' | 'error'; label: string }
> = {
  draft: { variant: 'default', label: 'Draft' },
  approved: { variant: 'primary', label: 'Approved' },
  executing: { variant: 'warning', label: 'Executing' },
  completed: { variant: 'success', label: 'Completed' },
  failed: { variant: 'error', label: 'Failed' },
  paused: { variant: 'default', label: 'Paused' },
};

export default function PlanDetailPage() {
  const router = useRouter();
  const params = useParams();
  const planId = params.id as string;

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editedPlan, setEditedPlan] = useState<Plan | null>(null);

  const fetchPlan = useCallback(async () => {
    try {
      const res = await fetch(`/api/plans/${planId}`);
      if (!res.ok) {
        router.push('/plans');
        return;
      }
      const data = await res.json();
      setPlan(data.plan);
      setEditedPlan(data.plan);
    } catch (error) {
      console.error('Failed to fetch plan:', error);
    } finally {
      setLoading(false);
    }
  }, [planId, router]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  // Subscribe to real-time progress when executing
  const { connected } = usePlanProgress({
    planId,
    enabled: plan?.status === 'executing',
    onProgress: () => {
      // Refresh plan data when progress events come in
      fetchPlan();
    },
    onComplete: () => {
      fetchPlan();
    },
  });

  const handleConvert = useCallback(
    async (itemIds: string[]) => {
      if (!plan) return;

      const res = await fetch(`/api/plans/${planId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds, preserveDependencies: true }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to convert items');
      }

      // Refresh plan to show updated status
      await fetchPlan();
    },
    [plan, planId, fetchPlan]
  );

  const handleSave = async () => {
    if (!editedPlan) return;

    try {
      const res = await fetch(`/api/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editedPlan.title,
          description: editedPlan.description,
          tags: editedPlan.tags,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPlan(data.plan);
        setEditing(false);
      }
    } catch (error) {
      console.error('Failed to save plan:', error);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this plan?')) return;

    try {
      const res = await fetch(`/api/plans/${planId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        router.push('/plans');
      }
    } catch (error) {
      console.error('Failed to delete plan:', error);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0d0d0f]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[rgb(79,255,238)] border-t-transparent"></div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0d0d0f]">
        <p className="text-[#8b8b8e]">Plan not found</p>
      </div>
    );
  }

  const currentPlan = editing ? editedPlan! : plan;
  const statusBadge = STATUS_BADGES[plan.status];

  return (
    <div className="flex flex-col h-full bg-[#0d0d0f]">
      {/* Header */}
      <div className="border-b border-[#26262a] bg-[#16161a]/50 backdrop-blur-sm shrink-0">
        <div className="h-14 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link
              href="/plans"
              className="p-2 rounded-lg hover:bg-[#26262a] text-[#8b8b8e] hover:text-[#f7f8f8] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-[rgb(79,255,238)]" />
              {editing ? (
                <input
                  type="text"
                  value={editedPlan?.title || ''}
                  onChange={(e) =>
                    setEditedPlan((p) => (p ? { ...p, title: e.target.value } : null))
                  }
                  className="bg-transparent border-b border-[rgb(79,255,238)] text-[#f7f8f8] font-semibold outline-none"
                />
              ) : (
                <h1 className="text-[#f7f8f8] font-semibold">{plan.title}</h1>
              )}
            </div>
            <Badge variant={statusBadge.variant} size="sm" dot>
              {statusBadge.label}
            </Badge>
            {connected && plan.status === 'executing' && (
              <span className="flex items-center gap-1.5 text-xs text-[#22c55e]">
                <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => {
                    setEditing(false);
                    setEditedPlan(plan);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[#8b8b8e] hover:text-[#f7f8f8] hover:bg-[#26262a] transition-colors"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgb(79,255,238)] text-black text-sm font-medium hover:bg-[rgb(79,255,238)]/90 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Save
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={fetchPlan}
                  className="p-2 rounded-lg text-[#8b8b8e] hover:text-[#f7f8f8] hover:bg-[#26262a] transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[#ff6467] hover:bg-[#ff6467]/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[#8b8b8e] hover:text-[#f7f8f8] hover:bg-[#26262a] transition-colors"
                  disabled={plan.status === 'executing'}
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6 space-y-6">
          {/* Plan Info */}
          <div className="rounded-xl bg-[#16161a]/50 border border-[#26262a] p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs text-[#8b8b8e] mb-2 uppercase tracking-wide">
                  User Request
                </label>
                <p className="text-[#f7f8f8] text-sm leading-relaxed">{plan.userRequest}</p>
              </div>
              <div>
                <label className="block text-xs text-[#8b8b8e] mb-2 uppercase tracking-wide">
                  Description
                </label>
                {editing ? (
                  <textarea
                    value={editedPlan?.description || ''}
                    onChange={(e) =>
                      setEditedPlan((p) => (p ? { ...p, description: e.target.value } : null))
                    }
                    className="w-full bg-[#0d0d0f] border border-[#26262a] rounded-lg p-3 text-[#f7f8f8] text-sm resize-none"
                    rows={3}
                    placeholder="Add a description..."
                  />
                ) : (
                  <p className="text-[#f7f8f8] text-sm leading-relaxed">
                    {plan.description || <span className="text-[#8b8b8e]">No description</span>}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-[#26262a]">
              <div>
                <div className="flex items-center gap-1.5 text-[#8b8b8e] text-xs mb-1">
                  <Clock className="w-3.5 h-3.5" />
                  Created
                </div>
                <p className="text-[#f7f8f8] font-medium text-sm">{formatDate(plan.createdAt)}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-[#8b8b8e] text-xs mb-1">
                  <Clock className="w-3.5 h-3.5" />
                  Updated
                </div>
                <p className="text-[#f7f8f8] font-medium text-sm">{formatDate(plan.updatedAt)}</p>
              </div>
            </div>

            {/* Tags */}
            {(plan.tags.length > 0 || editing) && (
              <div className="mt-4 pt-4 border-t border-[#26262a]">
                <div className="flex items-center gap-2 flex-wrap">
                  {currentPlan.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-[#26262a] text-[#8b8b8e]"
                    >
                      <Tag className="w-3 h-3" />
                      {tag}
                      {editing && (
                        <button
                          onClick={() =>
                            setEditedPlan((p) =>
                              p ? { ...p, tags: p.tags.filter((_, i) => i !== idx) } : null
                            )
                          }
                          className="ml-1 hover:text-[#ff6467]"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                  {editing && (
                    <button
                      onClick={() => {
                        const tag = prompt('Enter tag name:');
                        if (tag) {
                          setEditedPlan((p) => (p ? { ...p, tags: [...p.tags, tag] } : null));
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-dashed border-[#26262a] text-[#8b8b8e] hover:border-[rgb(79,255,238)] hover:text-[rgb(79,255,238)]"
                    >
                      <Plus className="w-3 h-3" />
                      Add tag
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Plan View (tree with checkboxes and progress) */}
          <PlanView plan={plan} onConvert={handleConvert} onRefresh={fetchPlan} />
        </div>
      </div>
    </div>
  );
}
