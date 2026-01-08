'use client';

import { useEffect, useState } from 'react';
import KanbanBoard from '@/components/KanbanBoard';
import AgentPanel from '@/components/AgentPanel';
import InboxPanel from '@/components/InboxPanel';
import Header from '@/components/Header';
import { Task, Agent, Message } from '@jetpack/shared';

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInbox, setShowInbox] = useState(false);

  // Fetch data from API
  useEffect(() => {
    async function fetchData() {
      try {
        const [tasksRes, agentsRes, messagesRes] = await Promise.all([
          fetch('/api/tasks'),
          fetch('/api/agents'),
          fetch('/api/messages'),
        ]);

        const tasksData = await tasksRes.json();
        const agentsData = await agentsRes.json();
        const messagesData = await messagesRes.json();

        setTasks(tasksData.tasks || []);
        setAgents(agentsData.agents || []);
        setMessages(messagesData.messages || []);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    // Poll for updates every 2 seconds
    const interval = setInterval(fetchData, 2000);

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading Jetpack...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        agents={agents}
        tasks={tasks}
        onCreateTask={handleCreateTask}
        onToggleInbox={() => setShowInbox(!showInbox)}
        showInbox={showInbox}
      />

      <div className="flex h-[calc(100vh-64px)]">
        <div className={`flex-1 transition-all duration-300 ${showInbox ? 'mr-96' : ''}`}>
          <KanbanBoard tasks={tasks} onUpdateTask={handleUpdateTask} />
        </div>

        <AgentPanel agents={agents} />

        {showInbox && (
          <InboxPanel messages={messages} agents={agents} />
        )}
      </div>
    </div>
  );
}
