'use client';

import { useEffect, useState, useMemo } from 'react';
import { Agent, Task } from '@jetpack/shared';
import { Sparkles, Cpu, Clock, CheckCircle2, Terminal, Activity } from 'lucide-react';
import { Badge, LiveIndicator } from '@/components/ui';

// Animation styles
const agentAnimationStyles = `
  @keyframes heartbeat {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.2); opacity: 0.8; }
  }
  @keyframes terminalCursor {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }
`;

// Lifecycle phases for agents
type AgentPhase = 'idle' | 'looking' | 'claiming' | 'executing' | 'complete';
const PHASE_LABELS: Record<AgentPhase, string> = {
  idle: 'awaiting work',
  looking: 'scanning tasks',
  claiming: 'claiming task',
  executing: 'running claude code',
  complete: 'task complete',
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [heartbeatCount, setHeartbeatCount] = useState(0);
  const [isConnected, setIsConnected] = useState(true);

  // Heartbeat counter
  useEffect(() => {
    const interval = setInterval(() => {
      setHeartbeatCount(c => c + 1);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

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
        setIsConnected(true);
      } catch (error) {
        console.error('Failed to fetch data:', error);
        setIsConnected(false);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  // Compute agent statistics
  const agentStats = useMemo(() => {
    const idle = agents.filter(a => a.status === 'idle').length;
    const busy = agents.filter(a => a.status === 'busy').length;
    const error = agents.filter(a => a.status === 'error').length;
    return { idle, busy, error, total: agents.length };
  }, [agents]);

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

  // Get agent phase based on status
  const getAgentPhase = (agent: Agent): AgentPhase => {
    if (agent.status === 'busy') {
      const currentTask = getAgentCurrentTask(agent.id);
      if (currentTask) return 'executing';
      return 'claiming';
    }
    if (agent.status === 'error') return 'idle';
    return 'looking';
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0d0d0f]">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-[rgb(79,255,238)] border-t-transparent mx-auto"></div>
            <Activity className="absolute inset-0 m-auto w-5 h-5 text-[rgb(79,255,238)] animate-pulse" />
          </div>
          <p className="mt-4 text-sm text-[#8b8b8e] font-mono">Connecting to agent network...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{agentAnimationStyles}</style>
      <div className="flex flex-col h-full bg-[#0d0d0f]">
        {/* Terminal-style Header */}
        <div className="border-b border-[#26262a] bg-[#16161a]/50 backdrop-blur-sm shrink-0">
          <div className="h-14 flex items-center justify-between px-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[#8b8b8e]">[</span>
                <span className="text-[#f7f8f8] tracking-widest text-sm font-semibold">AGENTS</span>
                <span className="text-[#8b8b8e]">]</span>
              </div>
              <LiveIndicator
                label={isConnected ? 'CONNECTED' : 'OFFLINE'}
                variant={isConnected ? 'success' : 'error'}
              />
            </div>
            <div className="flex items-center gap-4">
              {/* Agent stats */}
              <div className="flex items-center gap-3 text-xs text-[#8b8b8e]">
                <span className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#8b8b8e]" />
                  {agentStats.idle} idle
                </span>
                <span className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[rgb(79,255,238)] animate-pulse" />
                  {agentStats.busy} busy
                </span>
                {agentStats.error > 0 && (
                  <span className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-[#ff6467]" />
                    {agentStats.error} error
                  </span>
                )}
              </div>
              <div className="h-6 w-px bg-[#26262a]" />
              <div className="flex items-center gap-2 text-xs text-[#8b8b8e] font-mono">
                <div
                  className="w-2 h-2 rounded-full bg-[rgb(79,255,238)]"
                  style={{ animation: 'heartbeat 1.5s ease-in-out infinite' }}
                />
                <span>heartbeat #{heartbeatCount}</span>
              </div>
            </div>
          </div>

          {/* Status bar */}
          <div className="h-8 flex items-center px-6 border-t border-[#26262a]/50 bg-[#0d0d0f]/50 text-xs font-mono">
            <span className="text-[#8b8b8e]/50 mr-2">$</span>
            <span className="text-[#8b8b8e]">agents.status()</span>
            <span className="text-[#26262a] mx-2">→</span>
            <span className="text-[#f7f8f8]">
              {agentStats.total} agent{agentStats.total !== 1 ? 's' : ''} registered
            </span>
            {agentStats.busy > 0 && (
              <span className="ml-4 text-[rgb(79,255,238)]">
                <Terminal className="w-3 h-3 inline mr-1" />
                {agentStats.busy} executing...
              </span>
            )}
          </div>
        </div>

        {/* Agent Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-20 h-20 rounded-full bg-[#2a2a30] flex items-center justify-center mb-4">
                <Sparkles className="w-10 h-10 text-[#8b8b8e]" />
              </div>
              <p className="text-[#f7f8f8] font-medium">No agents running</p>
              <p className="text-sm text-[#8b8b8e] mt-1 font-mono">
                Start the CLI to spawn agents
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent) => {
                const currentTask = getAgentCurrentTask(agent.id);
                const completedCount = getAgentCompletedCount(agent.id);
                const agentPhase = getAgentPhase(agent);

                return (
                  <div
                    key={agent.id}
                    className="rounded-xl bg-[#16161a]/50 border border-[#26262a] backdrop-blur-sm hover:border-[rgb(79,255,238)]/30 transition-all duration-300 overflow-hidden"
                  >
                    {/* Header */}
                    <div className="p-5 border-b border-[#26262a]/50">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              agent.status === 'busy'
                                ? 'bg-[rgb(79,255,238)]/20 text-[rgb(79,255,238)]'
                                : agent.status === 'error'
                                ? 'bg-[#ff6467]/20 text-[#ff6467]'
                                : 'bg-[#2a2a30] text-[#8b8b8e]'
                            }`}>
                              <Cpu className="w-5 h-5" />
                            </div>
                            {/* Heartbeat indicator */}
                            {agent.status === 'busy' && (
                              <div
                                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[rgb(79,255,238)]"
                                style={{
                                  animation: 'heartbeat 1.5s ease-in-out infinite',
                                  boxShadow: '0 0 8px rgba(79, 255, 238, 0.5)',
                                }}
                              />
                            )}
                          </div>
                          <div>
                            <h3 className="font-medium text-[#f7f8f8]">{agent.name}</h3>
                            <p className="text-xs text-[#8b8b8e] font-mono">{agent.id.slice(0, 12)}...</p>
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

                      {/* Lifecycle phase indicator */}
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[#8b8b8e]">phase:</span>
                        <span className={`${
                          agent.status === 'busy' ? 'text-[rgb(79,255,238)]' : 'text-[#8b8b8e]'
                        }`}>
                          {PHASE_LABELS[agentPhase]}
                          {agent.status === 'busy' && <span className="animate-pulse">...</span>}
                        </span>
                      </div>
                    </div>

                    {/* Skills */}
                    <div className="px-5 py-3 border-b border-[#26262a]/50">
                      <p className="text-xs text-[#8b8b8e] mb-2 tracking-wide">SKILLS</p>
                      <div className="flex flex-wrap gap-1.5">
                        {agent.skills.map((skill) => (
                          <span
                            key={skill}
                            className={`px-2 py-0.5 text-xs rounded border ${
                              currentTask?.requiredSkills?.includes(skill)
                                ? 'border-[rgb(79,255,238)] text-[rgb(79,255,238)] bg-[rgb(79,255,238)]/10'
                                : 'border-[#26262a] text-[#8b8b8e]'
                            }`}
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Current Task / CLI Output */}
                    {currentTask ? (
                      <div className="px-5 py-3 bg-[#0d0d0f]/50">
                        <div className="flex items-center gap-2 mb-2">
                          <Terminal className="w-3.5 h-3.5 text-[rgb(79,255,238)]" />
                          <span className="text-xs font-medium text-[rgb(79,255,238)]">Executing</span>
                        </div>
                        <div className="bg-[#0d0d0f] rounded-lg p-3 border border-[#26262a]">
                          <p className="text-xs text-[#f7f8f8] font-mono truncate">{currentTask.title}</p>
                          <p className="text-[10px] text-[#8b8b8e] mt-1">
                            $ claude --task={currentTask.id.slice(0, 8)}
                            <span className="text-[rgb(79,255,238)] ml-1" style={{ animation: 'terminalCursor 1s step-end infinite' }}>█</span>
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="px-5 py-3 bg-[#0d0d0f]/50">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="w-3.5 h-3.5 text-[#8b8b8e]" />
                          <span className="text-xs text-[#8b8b8e]">Idle</span>
                        </div>
                        <div className="bg-[#0d0d0f] rounded-lg p-3 border border-[#26262a]">
                          <p className="text-[10px] text-[#8b8b8e] font-mono">
                            $ awaiting task...
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Stats footer */}
                    <div className="px-5 py-3 flex items-center justify-between text-xs border-t border-[#26262a]/50 bg-[#16161a]/30">
                      <div className="flex items-center gap-1.5 text-[#8b8b8e]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e]" />
                        <span>{completedCount} completed</span>
                      </div>
                      <span className="text-[#8b8b8e]">
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
    </>
  );
}
