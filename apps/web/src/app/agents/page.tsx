'use client';

import { useEffect, useState } from 'react';
import { Agent, Task } from '@jetpack/shared';
import { Sparkles, Cpu, Clock, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [agentsRes, tasksRes] = await Promise.all([
          fetch('/api/agents'),
          fetch('/api/tasks'),
        ]);

        const agentsData = await agentsRes.json();
        const tasksData = await tasksRes.json();

        setAgents(agentsData.agents || []);
        setTasks(tasksData.tasks || []);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  const getAgentTasks = (agentId: string) => {
    return tasks.filter(t => t.assignedAgent === agentId);
  };

  const getAgentCurrentTask = (agentId: string) => {
    return tasks.find(t => t.assignedAgent === agentId && t.status === 'in_progress');
  };

  const getAgentCompletedCount = (agentId: string) => {
    return tasks.filter(t => t.assignedAgent === agentId && t.status === 'completed').length;
  };

  const statusColors: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info'> = {
    idle: 'default',
    busy: 'warning',
    error: 'error',
    offline: 'default',
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent-purple border-t-transparent mx-auto"></div>
          <p className="mt-3 text-sm text-secondary">Loading agents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="h-14 flex items-center justify-between px-6 border-b border-subtle shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-primary">Agents</h1>
          <Badge variant="primary" size="sm">{agents.length} active</Badge>
        </div>
      </div>

      {/* Agent Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Sparkles className="w-16 h-16 text-muted mb-4" />
            <p className="text-secondary font-medium">No agents running</p>
            <p className="text-sm text-muted mt-1">
              Start the CLI to spawn agents
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => {
              const currentTask = getAgentCurrentTask(agent.id);
              const completedCount = getAgentCompletedCount(agent.id);

              return (
                <div
                  key={agent.id}
                  className="p-5 rounded-lg bg-surface border border-subtle hover:border-default transition-colors"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-accent-purple/20 text-accent-purple flex items-center justify-center">
                        <Cpu className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-medium text-primary">{agent.name}</h3>
                        <p className="text-xs text-muted font-mono">{agent.id}</p>
                      </div>
                    </div>
                    <Badge
                      variant={statusColors[agent.status] || 'default'}
                      size="sm"
                      dot
                    >
                      {agent.status}
                    </Badge>
                  </div>

                  {/* Skills */}
                  <div className="mb-4">
                    <p className="text-xs text-muted mb-2">Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {agent.skills.map((skill) => (
                        <span
                          key={skill}
                          className="px-2 py-0.5 text-xs rounded bg-hover text-secondary"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Current Task */}
                  {currentTask && (
                    <div className="mb-4 p-3 rounded-md bg-accent-yellow/10 border border-accent-yellow/20">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-3.5 h-3.5 text-accent-yellow" />
                        <span className="text-xs font-medium text-accent-yellow">Working on</span>
                      </div>
                      <p className="text-sm text-primary truncate">{currentTask.title}</p>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1.5 text-muted">
                      <CheckCircle2 className="w-4 h-4 text-accent-green" />
                      <span>{completedCount} completed</span>
                    </div>
                    <span className="text-muted">
                      {getAgentTasks(agent.id).length} total
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
