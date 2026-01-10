'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  GitBranch,
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Tag,
  X,
  Sparkles,
} from 'lucide-react';

interface PlannedTask {
  id: string;
  title: string;
  description: string;
  requiredSkills: string[];
  estimatedMinutes: number;
  dependsOn: string[];
}

const SKILL_OPTIONS = [
  'typescript',
  'javascript',
  'react',
  'nextjs',
  'python',
  'node',
  'api',
  'database',
  'testing',
  'devops',
];

export default function NewPlanPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [userRequest, setUserRequest] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tasks, setTasks] = useState<PlannedTask[]>([]);

  const addTask = () => {
    const newTask: PlannedTask = {
      id: `task-${Date.now()}`,
      title: '',
      description: '',
      requiredSkills: [],
      estimatedMinutes: 15,
      dependsOn: [],
    };
    setTasks([...tasks, newTask]);
  };

  const updateTask = (index: number, updates: Partial<PlannedTask>) => {
    const newTasks = [...tasks];
    newTasks[index] = { ...newTasks[index], ...updates };
    setTasks(newTasks);
  };

  const removeTask = (index: number) => {
    setTasks(tasks.filter((_, i) => i !== index));
  };

  const toggleSkill = (taskIndex: number, skill: string) => {
    const task = tasks[taskIndex];
    const skills = task.requiredSkills.includes(skill)
      ? task.requiredSkills.filter((s) => s !== skill)
      : [...task.requiredSkills, skill];
    updateTask(taskIndex, { requiredSkills: skills });
  };

  const addTag = () => {
    const tag = prompt('Enter tag name:');
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !userRequest.trim() || tasks.length === 0) {
      alert('Please fill in the plan name, user request, and add at least one task.');
      return;
    }

    // Validate tasks have titles
    const invalidTasks = tasks.filter((t) => !t.title.trim());
    if (invalidTasks.length > 0) {
      alert('All tasks must have a title.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          userRequest,
          plannedTasks: tasks,
          tags,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/plans/${data.plan.id}`);
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to create plan');
      }
    } catch (error) {
      console.error('Failed to create plan:', error);
      alert('Failed to create plan');
    } finally {
      setSaving(false);
    }
  };

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
              <h1 className="text-[#f7f8f8] font-semibold">New Plan</h1>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[rgb(79,255,238)] text-black text-sm font-medium hover:bg-[rgb(79,255,238)]/90 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Creating...' : 'Create Plan'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          {/* Basic Info */}
          <div className="rounded-xl bg-[#16161a]/50 border border-[#26262a] p-6 space-y-4">
            <div>
              <label className="block text-xs text-[#8b8b8e] mb-2 uppercase tracking-wide">
                Plan Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., User Authentication System"
                className="w-full bg-[#0d0d0f] border border-[#26262a] rounded-lg px-4 py-3 text-[#f7f8f8] placeholder-[#8b8b8e]/50 focus:border-[rgb(79,255,238)] focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs text-[#8b8b8e] mb-2 uppercase tracking-wide">
                User Request *
              </label>
              <textarea
                value={userRequest}
                onChange={(e) => setUserRequest(e.target.value)}
                placeholder="Describe what you want to build... e.g., Build a complete user authentication system with login, registration, and password reset functionality."
                rows={3}
                className="w-full bg-[#0d0d0f] border border-[#26262a] rounded-lg px-4 py-3 text-[#f7f8f8] placeholder-[#8b8b8e]/50 focus:border-[rgb(79,255,238)] focus:outline-none transition-colors resize-none"
              />
            </div>

            <div>
              <label className="block text-xs text-[#8b8b8e] mb-2 uppercase tracking-wide">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional additional context or notes..."
                rows={2}
                className="w-full bg-[#0d0d0f] border border-[#26262a] rounded-lg px-4 py-3 text-[#f7f8f8] placeholder-[#8b8b8e]/50 focus:border-[rgb(79,255,238)] focus:outline-none transition-colors resize-none"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block text-xs text-[#8b8b8e] mb-2 uppercase tracking-wide">
                Tags
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-[#26262a] text-[#8b8b8e]"
                  >
                    <Tag className="w-3 h-3" />
                    {tag}
                    <button
                      onClick={() => setTags(tags.filter((_, i) => i !== idx))}
                      className="ml-1 hover:text-[#ff6467]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <button
                  onClick={addTag}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-dashed border-[#26262a] text-[#8b8b8e] hover:border-[rgb(79,255,238)] hover:text-[rgb(79,255,238)]"
                >
                  <Plus className="w-3 h-3" />
                  Add tag
                </button>
              </div>
            </div>
          </div>

          {/* Tasks */}
          <div className="rounded-xl bg-[#16161a]/50 border border-[#26262a] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#26262a] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[rgb(79,255,238)]" />
                <h2 className="text-[#f7f8f8] font-semibold">Tasks</h2>
                <span className="text-xs text-[#8b8b8e]">({tasks.length})</span>
              </div>
              <button
                onClick={addTask}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-[rgb(79,255,238)] hover:bg-[rgb(79,255,238)]/10 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Task
              </button>
            </div>

            {tasks.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-[#2a2a30] flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-[#8b8b8e]" />
                </div>
                <p className="text-[#f7f8f8] font-medium">No tasks yet</p>
                <p className="text-sm text-[#8b8b8e] mt-1">
                  Add tasks that agents will work on
                </p>
                <button
                  onClick={addTask}
                  className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-[rgb(79,255,238)] text-black text-sm font-medium hover:bg-[rgb(79,255,238)]/90 transition-colors mx-auto"
                >
                  <Plus className="w-4 h-4" />
                  Add first task
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[#26262a]">
                {tasks.map((task, index) => (
                  <div key={task.id} className="p-6 space-y-4">
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-[#26262a] flex items-center justify-center text-sm text-[#8b8b8e] shrink-0">
                        {index + 1}
                      </div>
                      <div className="flex-1 space-y-4">
                        <div>
                          <label className="block text-xs text-[#8b8b8e] mb-1">Task Title *</label>
                          <input
                            type="text"
                            value={task.title}
                            onChange={(e) => updateTask(index, { title: e.target.value })}
                            placeholder="e.g., Create user model and schema"
                            className="w-full bg-[#0d0d0f] border border-[#26262a] rounded-lg px-3 py-2 text-[#f7f8f8] placeholder-[#8b8b8e]/50 focus:border-[rgb(79,255,238)] focus:outline-none transition-colors text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-[#8b8b8e] mb-1">Description</label>
                          <textarea
                            value={task.description}
                            onChange={(e) => updateTask(index, { description: e.target.value })}
                            placeholder="Detailed instructions for the agent..."
                            rows={2}
                            className="w-full bg-[#0d0d0f] border border-[#26262a] rounded-lg px-3 py-2 text-[#f7f8f8] placeholder-[#8b8b8e]/50 focus:border-[rgb(79,255,238)] focus:outline-none transition-colors text-sm resize-none"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs text-[#8b8b8e] mb-2">
                              Required Skills
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                              {SKILL_OPTIONS.map((skill) => (
                                <button
                                  key={skill}
                                  onClick={() => toggleSkill(index, skill)}
                                  className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                                    task.requiredSkills.includes(skill)
                                      ? 'border-[rgb(79,255,238)] text-[rgb(79,255,238)] bg-[rgb(79,255,238)]/10'
                                      : 'border-[#26262a] text-[#8b8b8e] hover:border-[#8b8b8e]'
                                  }`}
                                >
                                  {skill}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs text-[#8b8b8e] mb-2">
                              Estimated Time (minutes)
                            </label>
                            <input
                              type="number"
                              value={task.estimatedMinutes}
                              onChange={(e) =>
                                updateTask(index, {
                                  estimatedMinutes: parseInt(e.target.value) || 15,
                                })
                              }
                              min={1}
                              className="w-24 bg-[#0d0d0f] border border-[#26262a] rounded-lg px-3 py-2 text-[#f7f8f8] focus:border-[rgb(79,255,238)] focus:outline-none transition-colors text-sm"
                            />
                          </div>
                        </div>

                        {index > 0 && (
                          <div>
                            <label className="block text-xs text-[#8b8b8e] mb-2">
                              Depends On
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                              {tasks.slice(0, index).map((depTask) => (
                                <button
                                  key={depTask.id}
                                  onClick={() => {
                                    const depends = task.dependsOn.includes(depTask.id)
                                      ? task.dependsOn.filter((d) => d !== depTask.id)
                                      : [...task.dependsOn, depTask.id];
                                    updateTask(index, { dependsOn: depends });
                                  }}
                                  className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                                    task.dependsOn.includes(depTask.id)
                                      ? 'border-[#f59e0b] text-[#f59e0b] bg-[#f59e0b]/10'
                                      : 'border-[#26262a] text-[#8b8b8e] hover:border-[#8b8b8e]'
                                  }`}
                                >
                                  {depTask.title || `Task ${tasks.indexOf(depTask) + 1}`}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => removeTask(index)}
                        className="p-2 text-[#8b8b8e] hover:text-[#ff6467] hover:bg-[#ff6467]/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
