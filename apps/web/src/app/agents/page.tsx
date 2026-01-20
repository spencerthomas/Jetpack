'use client';

import { useEffect, useState } from 'react';

interface Agent {
  id: string;
  name: string;
  type: string;
  status: string;
  skills: string[];
  currentTaskId?: string;
  tasksCompleted: number;
  tasksFailed: number;
  lastHeartbeat?: string;
  createdAt: string;
}

function AgentCard({ agent }: { agent: Agent }) {
  const statusColors: Record<string, string> = {
    idle: 'bg-green-500',
    busy: 'bg-yellow-500',
    error: 'bg-red-500',
    offline: 'bg-zinc-500',
  };

  return (
    <div className="card card-hover">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold">{agent.name}</h3>
          <p className="text-xs text-zinc-500">{agent.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${statusColors[agent.status] || 'bg-zinc-500'}`}
          />
          <span className={`text-sm agent-${agent.status}`}>{agent.status}</span>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs text-zinc-500 mb-1">Type</p>
        <p className="text-sm text-zinc-300">{agent.type}</p>
      </div>

      <div className="mt-3">
        <p className="text-xs text-zinc-500 mb-1">Skills</p>
        <div className="flex flex-wrap gap-1">
          {agent.skills.length > 0 ? (
            agent.skills.map((skill) => (
              <span
                key={skill}
                className="text-xs px-2 py-0.5 bg-zinc-800 rounded text-cyan-400"
              >
                {skill}
              </span>
            ))
          ) : (
            <span className="text-xs text-zinc-600">No skills</span>
          )}
        </div>
      </div>

      {agent.currentTaskId && (
        <div className="mt-3">
          <p className="text-xs text-zinc-500 mb-1">Current Task</p>
          <p className="text-sm text-cyan-400 font-mono">{agent.currentTaskId}</p>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between">
        <div>
          <span className="text-xs text-zinc-500">Completed: </span>
          <span className="text-sm text-green-500">{agent.tasksCompleted}</span>
        </div>
        <div>
          <span className="text-xs text-zinc-500">Failed: </span>
          <span className="text-sm text-red-500">{agent.tasksFailed}</span>
        </div>
      </div>

      {agent.lastHeartbeat && (
        <div className="mt-2 text-xs text-zinc-600">
          Last heartbeat: {new Date(agent.lastHeartbeat).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch('/api/agents');
        if (!res.ok) throw new Error('Failed to fetch agents');
        const data = await res.json();
        setAgents(data.agents);
        setError(null);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchAgents();
    const interval = setInterval(fetchAgents, 2000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-zinc-500">Loading agents...</div>
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

  const agentsByStatus = {
    idle: agents.filter((a) => a.status === 'idle'),
    busy: agents.filter((a) => a.status === 'busy'),
    error: agents.filter((a) => a.status === 'error'),
    offline: agents.filter((a) => a.status === 'offline'),
  };

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Agents</h1>
        <p className="text-zinc-500 text-sm mt-1">
          {agents.length} registered agents
        </p>
      </header>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="card">
          <div className="text-xs text-zinc-500 uppercase">Total</div>
          <div className="text-2xl font-bold">{agents.length}</div>
        </div>
        <div className="card">
          <div className="text-xs text-zinc-500 uppercase">Idle</div>
          <div className="text-2xl font-bold text-green-500">
            {agentsByStatus.idle.length}
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-zinc-500 uppercase">Busy</div>
          <div className="text-2xl font-bold text-yellow-500">
            {agentsByStatus.busy.length}
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-zinc-500 uppercase">Offline/Error</div>
          <div className="text-2xl font-bold text-red-500">
            {agentsByStatus.error.length + agentsByStatus.offline.length}
          </div>
        </div>
      </div>

      {/* Agent Grid */}
      {agents.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-zinc-500">No agents registered</p>
          <p className="text-xs text-zinc-600 mt-2">
            Start agents with: <code className="text-cyan-400">swarm start</code>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
