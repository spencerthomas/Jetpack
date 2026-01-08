'use client';

import { Agent, Task } from '@jetpack/shared';
import { Plus, Inbox, Activity } from 'lucide-react';
import { useState } from 'react';
import CreateTaskModal from './CreateTaskModal';
import clsx from 'clsx';

interface HeaderProps {
  agents: Agent[];
  tasks: Task[];
  onCreateTask: (taskData: any) => void;
  onToggleInbox: () => void;
  showInbox: boolean;
}

export default function Header({ agents, tasks, onCreateTask, onToggleInbox, showInbox }: HeaderProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);

  const busyAgents = agents.filter(a => a.status === 'busy').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress' || t.status === 'claimed').length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;

  return (
    <>
      <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
            🚀 Jetpack
          </h1>
          <div className="h-6 w-px bg-gray-300" />
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary-600" />
              <span className="font-medium">{busyAgents}/{agents.length}</span>
              <span className="text-gray-600">agents active</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="font-medium">{inProgressTasks}</span>
              <span className="text-gray-600">in progress</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="font-medium">{completedTasks}</span>
              <span className="text-gray-600">completed</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>

          <button
            onClick={onToggleInbox}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium',
              showInbox
                ? 'bg-primary-100 text-primary-700 border-2 border-primary-600'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            <Inbox className="w-4 h-4" />
            Inbox
          </button>
        </div>
      </header>

      {showCreateModal && (
        <CreateTaskModal
          onClose={() => setShowCreateModal(false)}
          onCreate={onCreateTask}
        />
      )}
    </>
  );
}
