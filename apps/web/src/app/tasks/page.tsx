'use client';

import { useEffect, useState } from 'react';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  type: string;
  requiredSkills: string[];
  assignedAgent?: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_ORDER = ['pending', 'ready', 'claimed', 'in_progress', 'completed', 'failed'];

function TaskCard({ task }: { task: Task }) {
  return (
    <div className="card card-hover mb-2">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-medium text-sm">{task.title}</h3>
          <p className="text-xs text-zinc-500 mt-1">{task.id}</p>
        </div>
        <span className={`text-xs font-medium priority-${task.priority}`}>
          {task.priority}
        </span>
      </div>
      {task.description && (
        <p className="text-xs text-zinc-400 mt-2 line-clamp-2">{task.description}</p>
      )}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {task.requiredSkills.map((skill) => (
          <span
            key={skill}
            className="text-xs px-2 py-0.5 bg-zinc-800 rounded text-zinc-400"
          >
            {skill}
          </span>
        ))}
      </div>
      {task.assignedAgent && (
        <p className="text-xs text-cyan-400 mt-2">
          Assigned: {task.assignedAgent}
        </p>
      )}
    </div>
  );
}

function KanbanColumn({
  status,
  tasks,
}: {
  status: string;
  tasks: Task[];
}) {
  const statusLabels: Record<string, string> = {
    pending: 'Pending',
    ready: 'Ready',
    claimed: 'Claimed',
    in_progress: 'In Progress',
    completed: 'Completed',
    failed: 'Failed',
  };

  return (
    <div className="flex-1 min-w-[250px] max-w-[300px]">
      <div className="flex items-center gap-2 mb-3">
        <h2 className={`font-semibold status-${status}`}>
          {statusLabels[status] || status}
        </h2>
        <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">
          {tasks.length}
        </span>
      </div>
      <div className="space-y-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
        {tasks.length === 0 && (
          <p className="text-xs text-zinc-600 text-center py-4">No tasks</p>
        )}
      </div>
    </div>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
      if (!res.ok) throw new Error('Failed to fetch tasks');
      const data = await res.json();
      setTasks(data.tasks);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, []);

  const tasksByStatus = STATUS_ORDER.reduce(
    (acc, status) => {
      acc[status] = tasks.filter((t) => t.status === status);
      return acc;
    },
    {} as Record<string, Task[]>
  );

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-zinc-500">Loading tasks...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="card border-red-900 bg-red-950">
          <h2 className="text-red-500 font-bold">Error</h2>
          <p className="text-red-400 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {tasks.length} total tasks
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-md text-sm font-medium transition-colors"
        >
          Create Task
        </button>
      </header>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUS_ORDER.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={tasksByStatus[status] || []}
          />
        ))}
      </div>

      {showCreateModal && (
        <CreateTaskModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            fetchTasks();
          }}
        />
      )}
    </div>
  );
}

function CreateTaskModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [skills, setSkills] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          requiredSkills: skills
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });

      if (!res.ok) throw new Error('Failed to create task');
      onCreated();
    } catch (err) {
      alert('Error creating task: ' + String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-md p-6">
        <h2 className="text-lg font-bold mb-4">Create Task</h2>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
                placeholder="Task title"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:border-cyan-500 h-20 resize-none"
                placeholder="Task description"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">
                Required Skills (comma-separated)
              </label>
              <input
                type="text"
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
                placeholder="typescript, react, nodejs"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-zinc-400 hover:text-white text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-zinc-700 text-white rounded text-sm font-medium"
            >
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
