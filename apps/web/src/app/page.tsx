'use client';

import { useEffect, useState } from 'react';

interface SwarmStatus {
  workDir: { path: string; source: string };
  swarm: {
    tasks: {
      total: number;
      pending: number;
      ready: number;
      claimed: number;
      inProgress: number;
      completed: number;
      failed: number;
      blocked: number;
    };
    agents: {
      total: number;
      idle: number;
      busy: number;
      error: number;
      offline: number;
    };
    swarm: {
      status: string;
      dataLayerType: string;
      uptime: number;
    };
  };
  timestamp: string;
}

function StatCard({
  label,
  value,
  color = 'text-white',
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="card">
      <div className="text-xs text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export default function Dashboard() {
  const [status, setStatus] = useState<SwarmStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) throw new Error('Failed to fetch status');
        const data = await res.json();
        setStatus(data);
        setError(null);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-zinc-500">Loading...</div>
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

  if (!status) return null;

  const { swarm, workDir } = status;

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Working directory: <code className="text-zinc-400">{workDir.path}</code>
          <span className="text-zinc-600"> ({workDir.source})</span>
        </p>
      </header>

      {/* System Status */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4 text-zinc-400">System</h2>
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="Status"
            value={swarm.swarm.status}
            color="text-green-500"
          />
          <StatCard
            label="Data Layer"
            value={swarm.swarm.dataLayerType}
            color="text-cyan-400"
          />
          <StatCard
            label="Uptime"
            value={formatUptime(swarm.swarm.uptime)}
          />
          <StatCard
            label="Last Updated"
            value={new Date(status.timestamp).toLocaleTimeString()}
            color="text-zinc-400"
          />
        </div>
      </section>

      {/* Task Stats */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4 text-zinc-400">Tasks</h2>
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Total" value={swarm.tasks.total} />
          <StatCard label="Pending" value={swarm.tasks.pending} color="status-pending" />
          <StatCard label="Ready" value={swarm.tasks.ready} color="status-ready" />
          <StatCard label="In Progress" value={swarm.tasks.inProgress} color="status-in_progress" />
          <StatCard label="Completed" value={swarm.tasks.completed} color="status-completed" />
          <StatCard label="Failed" value={swarm.tasks.failed} color="status-failed" />
          <StatCard label="Blocked" value={swarm.tasks.blocked} color="status-blocked" />
          <StatCard label="Claimed" value={swarm.tasks.claimed} color="status-claimed" />
        </div>
      </section>

      {/* Agent Stats */}
      <section>
        <h2 className="text-lg font-semibold mb-4 text-zinc-400">Agents</h2>
        <div className="grid grid-cols-5 gap-4">
          <StatCard label="Total" value={swarm.agents.total} />
          <StatCard label="Idle" value={swarm.agents.idle} color="agent-idle" />
          <StatCard label="Busy" value={swarm.agents.busy} color="agent-busy" />
          <StatCard label="Error" value={swarm.agents.error} color="agent-error" />
          <StatCard label="Offline" value={swarm.agents.offline} color="agent-offline" />
        </div>
      </section>
    </div>
  );
}
