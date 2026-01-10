'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  GitBranch,
  ArrowLeft,
  Play,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  ChevronDown,
  ChevronRight,
  Tag,
  Timer,
  Save,
  X,
  GripVertical,
  Plus,
} from 'lucide-react';
import { Badge } from '@/components/ui';

type PlanStatus = 'draft' | 'approved' | 'executing' | 'completed' | 'failed';

interface PlannedTask {
  id: string;
  title: string;
  description: string;
  requiredSkills: string[];
  estimatedMinutes: number;
  dependsOn: string[];
}

interface ExecutionRecord {
  id: string;
  planId: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed';
  taskResults: Record<string, {
    status: 'pending' | 'completed' | 'failed';
    assignedAgent?: string;
    completedAt?: string;
    error?: string;
  }>;
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
  executionHistory: ExecutionRecord[];
  tags: string[];
  isTemplate: boolean;
}

const STATUS_BADGES: Record<PlanStatus, { variant: 'default' | 'primary' | 'success' | 'warning' | 'error'; label: string }> = {
  draft: { variant: 'default', label: 'Draft' },
  approved: { variant: 'primary', label: 'Approved' },
  executing: { variant: 'warning', label: 'Executing' },
  completed: { variant: 'success', label: 'Completed' },
  failed: { variant: 'error', label: 'Failed' },
};

export default function PlanDetailPage() {
  const router = useRouter();
  const params = useParams();
  const planId = params.id as string;

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
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

  const handleExecute = async () => {
    if (!plan || executing) return;

    setExecuting(true);
    try {
      const res = await fetch(`/api/plans/${planId}/execute`, {
        method: 'POST',
      });

      if (res.ok) {
        // Refresh plan to show executing status
        await fetchPlan();
        // Optionally navigate to board to see tasks
        router.push('/board');
      }
    } catch (error) {
      console.error('Failed to execute plan:', error);
    } finally {
      setExecuting(false);
    }
  };

  const handleSave = async () => {
    if (!editedPlan) return;

    try {
      const res = await fetch(`/api/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editedPlan.name,
          description: editedPlan.description,
          plannedTasks: editedPlan.plannedTasks,
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

  const toggleTaskExpanded = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
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
                  value={editedPlan?.name || ''}
                  onChange={(e) =>
                    setEditedPlan((p) => (p ? { ...p, name: e.target.value } : null))
                  }
                  className="bg-transparent border-b border-[rgb(79,255,238)] text-[#f7f8f8] font-semibold outline-none"
                />
              ) : (
                <h1 className="text-[#f7f8f8] font-semibold">{plan.name}</h1>
              )}
            </div>
            <Badge variant={statusBadge.variant} size="sm" dot>
              {statusBadge.label}
            </Badge>
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
                {(plan.status === 'draft' || plan.status === 'approved') && (
                  <button
                    onClick={handleExecute}
                    disabled={executing}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[rgb(79,255,238)] text-black text-sm font-medium hover:bg-[rgb(79,255,238)]/90 transition-colors disabled:opacity-50"
                  >
                    <Play className="w-4 h-4" />
                    {executing ? 'Starting...' : 'Execute Plan'}
                  </button>
                )}
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
                  <Layers className="w-3.5 h-3.5" />
                  Tasks
                </div>
                <p className="text-[#f7f8f8] font-medium">{plan.plannedTasks.length}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-[#8b8b8e] text-xs mb-1">
                  <Timer className="w-3.5 h-3.5" />
                  Estimated
                </div>
                <p className="text-[#f7f8f8] font-medium">
                  {plan.estimatedDuration ? formatDuration(plan.estimatedDuration) : '-'}
                </p>
              </div>
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

          {/* Tasks */}
          <div className="rounded-xl bg-[#16161a]/50 border border-[#26262a] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#26262a] flex items-center justify-between">
              <h2 className="text-[#f7f8f8] font-semibold flex items-center gap-2">
                <Layers className="w-5 h-5 text-[rgb(79,255,238)]" />
                Planned Tasks
              </h2>
              {editing && (
                <button
                  onClick={() => {
                    const newTask: PlannedTask = {
                      id: `task-${Date.now()}`,
                      title: 'New Task',
                      description: '',
                      requiredSkills: [],
                      estimatedMinutes: 15,
                      dependsOn: [],
                    };
                    setEditedPlan((p) =>
                      p ? { ...p, plannedTasks: [...p.plannedTasks, newTask] } : null
                    );
                    setExpandedTasks((prev) => new Set([...prev, newTask.id]));
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-[rgb(79,255,238)] hover:bg-[rgb(79,255,238)]/10 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Task
                </button>
              )}
            </div>

            <div className="divide-y divide-[#26262a]">
              {currentPlan.plannedTasks.map((task, index) => {
                const isExpanded = expandedTasks.has(task.id);
                const executionStatus = plan.executionHistory[0]?.taskResults?.[task.id];

                return (
                  <div key={task.id} className="group">
                    <div
                      className="px-6 py-4 flex items-center gap-4 hover:bg-[#1f1f24]/50 cursor-pointer"
                      onClick={() => toggleTaskExpanded(task.id)}
                    >
                      {editing && (
                        <GripVertical className="w-4 h-4 text-[#8b8b8e] opacity-0 group-hover:opacity-100" />
                      )}
                      <div className="w-6 h-6 rounded-full bg-[#26262a] flex items-center justify-center text-xs text-[#8b8b8e]">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        {editing ? (
                          <input
                            type="text"
                            value={task.title}
                            onChange={(e) => {
                              setEditedPlan((p) => {
                                if (!p) return null;
                                const tasks = [...p.plannedTasks];
                                tasks[index] = { ...tasks[index], title: e.target.value };
                                return { ...p, plannedTasks: tasks };
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full bg-transparent border-b border-[#26262a] focus:border-[rgb(79,255,238)] text-[#f7f8f8] outline-none"
                          />
                        ) : (
                          <p className="text-[#f7f8f8] font-medium truncate">{task.title}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-[#8b8b8e]">
                            ~{task.estimatedMinutes} min
                          </span>
                          {task.requiredSkills.length > 0 && (
                            <div className="flex items-center gap-1">
                              {task.requiredSkills.slice(0, 2).map((skill) => (
                                <span
                                  key={skill}
                                  className="px-1.5 py-0.5 text-[10px] rounded bg-[#26262a] text-[#8b8b8e]"
                                >
                                  {skill}
                                </span>
                              ))}
                              {task.requiredSkills.length > 2 && (
                                <span className="text-[10px] text-[#8b8b8e]">
                                  +{task.requiredSkills.length - 2}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      {executionStatus && (
                        <Badge
                          variant={
                            executionStatus.status === 'completed'
                              ? 'success'
                              : executionStatus.status === 'failed'
                              ? 'error'
                              : 'default'
                          }
                          size="sm"
                        >
                          {executionStatus.status}
                        </Badge>
                      )}
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-[#8b8b8e]" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-[#8b8b8e]" />
                      )}
                    </div>

                    {isExpanded && (
                      <div className="px-6 py-4 bg-[#0d0d0f]/50 border-t border-[#26262a]">
                        <div className="pl-10 space-y-4">
                          <div>
                            <label className="block text-xs text-[#8b8b8e] mb-1">Description</label>
                            {editing ? (
                              <textarea
                                value={task.description}
                                onChange={(e) => {
                                  setEditedPlan((p) => {
                                    if (!p) return null;
                                    const tasks = [...p.plannedTasks];
                                    tasks[index] = { ...tasks[index], description: e.target.value };
                                    return { ...p, plannedTasks: tasks };
                                  });
                                }}
                                className="w-full bg-[#16161a] border border-[#26262a] rounded-lg p-2 text-[#f7f8f8] text-sm resize-none"
                                rows={2}
                              />
                            ) : (
                              <p className="text-[#f7f8f8] text-sm">
                                {task.description || (
                                  <span className="text-[#8b8b8e]">No description</span>
                                )}
                              </p>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs text-[#8b8b8e] mb-1">
                                Required Skills
                              </label>
                              <div className="flex flex-wrap gap-1">
                                {task.requiredSkills.map((skill) => (
                                  <span
                                    key={skill}
                                    className="px-2 py-0.5 text-xs rounded border border-[#26262a] text-[#8b8b8e]"
                                  >
                                    {skill}
                                  </span>
                                ))}
                                {task.requiredSkills.length === 0 && (
                                  <span className="text-xs text-[#8b8b8e]">Any agent</span>
                                )}
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs text-[#8b8b8e] mb-1">
                                Dependencies
                              </label>
                              {task.dependsOn.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {task.dependsOn.map((depId) => {
                                    const depTask = currentPlan.plannedTasks.find(
                                      (t) => t.id === depId
                                    );
                                    return (
                                      <span
                                        key={depId}
                                        className="px-2 py-0.5 text-xs rounded border border-[#26262a] text-[#8b8b8e]"
                                      >
                                        {depTask?.title || depId}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-xs text-[#8b8b8e]">None</span>
                              )}
                            </div>
                          </div>

                          {editing && (
                            <div className="flex justify-end">
                              <button
                                onClick={() => {
                                  setEditedPlan((p) => {
                                    if (!p) return null;
                                    return {
                                      ...p,
                                      plannedTasks: p.plannedTasks.filter((_, i) => i !== index),
                                    };
                                  });
                                }}
                                className="flex items-center gap-1 px-2 py-1 text-xs text-[#ff6467] hover:bg-[#ff6467]/10 rounded transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                                Remove Task
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Execution History */}
          {plan.executionHistory.length > 0 && (
            <div className="rounded-xl bg-[#16161a]/50 border border-[#26262a] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#26262a]">
                <h2 className="text-[#f7f8f8] font-semibold flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[rgb(79,255,238)]" />
                  Execution History
                </h2>
              </div>
              <div className="divide-y divide-[#26262a]">
                {plan.executionHistory.map((exec) => (
                  <div key={exec.id} className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {exec.status === 'completed' ? (
                          <CheckCircle2 className="w-5 h-5 text-[#22c55e]" />
                        ) : exec.status === 'failed' ? (
                          <AlertCircle className="w-5 h-5 text-[#ff6467]" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-[#f59e0b] border-t-transparent animate-spin" />
                        )}
                        <div>
                          <p className="text-[#f7f8f8] text-sm font-medium">
                            Execution {exec.id.slice(-6)}
                          </p>
                          <p className="text-xs text-[#8b8b8e]">{formatDate(exec.startedAt)}</p>
                        </div>
                      </div>
                      <Badge
                        variant={
                          exec.status === 'completed'
                            ? 'success'
                            : exec.status === 'failed'
                            ? 'error'
                            : 'warning'
                        }
                      >
                        {exec.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
