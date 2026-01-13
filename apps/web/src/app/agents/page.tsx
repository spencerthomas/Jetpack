'use client';

import { useEffect, useState, useMemo } from 'react';
import { Task } from '@jetpack/shared';
import { Sparkles, Cpu, CheckCircle2, Activity, Timer, Plus, X, Settings2, Zap, Bot, Code2, Database, Mail, RefreshCw } from 'lucide-react';
import { LiveIndicator } from '@/components/ui';

// Harness types
type HarnessType = 'claude-code' | 'codex' | 'gemini-cli';

interface HarnessInfo {
  id: HarnessType;
  name: string;
  description: string;
  icon: string;
  color: string;
}

const HARNESS_OPTIONS: HarnessInfo[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Anthropic Claude via CLI - full coding capabilities',
    icon: '🤖',
    color: 'rgb(79, 255, 238)',
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    description: 'OpenAI Codex CLI - optimized for code generation',
    icon: '⚡',
    color: '#10b981',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    description: 'Google Gemini CLI - multimodal reasoning',
    icon: '💎',
    color: '#8b5cf6',
  },
];

// Available skills
const AVAILABLE_SKILLS = [
  'typescript', 'javascript', 'python', 'rust', 'go',
  'react', 'vue', 'svelte', 'frontend', 'backend',
  'database', 'testing', 'devops', 'documentation', 'security'
];

// Extended agent type with registry data
interface AgentWithRegistry {
  id: string;
  name: string;
  status: 'idle' | 'busy' | 'offline' | 'error';
  skills: string[];
  currentTask: string | null;
  tasksCompleted: number;
  lastHeartbeat: string;
  startedAt: string;
}

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
  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 5px currentColor; }
    50% { box-shadow: 0 0 15px currentColor, 0 0 25px currentColor; }
  }
  @keyframes claimPing {
    0% { transform: scale(1); opacity: 1; }
    100% { transform: scale(1.5); opacity: 0; }
  }
  @keyframes slideInLog {
    from { transform: translateX(-10px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes phaseProgress {
    from { width: 0%; }
    to { width: 100%; }
  }
`;

// Lifecycle phases for agents
type AgentPhase = 'idle' | 'looking' | 'claiming' | 'retrieving' | 'executing' | 'storing' | 'publishing' | 'complete';
const PHASE_ORDER: AgentPhase[] = ['idle', 'looking', 'claiming', 'retrieving', 'executing', 'storing', 'publishing', 'complete'];
const PHASE_LABELS: Record<AgentPhase, string> = {
  idle: 'awaiting work',
  looking: 'scanning task queue',
  claiming: 'claiming task',
  retrieving: 'fetching context from CASS',
  executing: 'spawning Claude Code',
  storing: 'storing learnings',
  publishing: 'publishing completion',
  complete: 'task complete',
};

const PRIORITY_ICONS: Record<string, string> = {
  critical: '▲▲',
  high: '▲',
  medium: '●',
  low: '▽',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'text-[#ef4444]',
  high: 'text-[rgb(79,255,238)]',
  medium: 'text-[#8b8b8e]',
  low: 'text-[#8b8b8e]/50',
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentWithRegistry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [heartbeatCount, setHeartbeatCount] = useState(0);
  const [isConnected, setIsConnected] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [cliLogs, setCliLogs] = useState<{ agentId: string; line: string; type: string; time: Date }[]>([]);

  // Spawn modal state
  const [showSpawnModal, setShowSpawnModal] = useState(false);
  const [spawnName, setSpawnName] = useState('');
  const [spawnHarness, setSpawnHarness] = useState<HarnessType>('claude-code');
  const [spawnSkills, setSpawnSkills] = useState<string[]>(['typescript', 'react']);
  const [spawnSystemPrompt, setSpawnSystemPrompt] = useState('');
  const [spawning, setSpawning] = useState(false);
  const [spawnError, setSpawnError] = useState<string | null>(null);

  // Simulated phase for demo
  const [simulatedPhase, setSimulatedPhase] = useState<AgentPhase>('idle');

  // Heartbeat counter
  useEffect(() => {
    const interval = setInterval(() => {
      setHeartbeatCount(c => c + 1);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // No demo simulation - show real agent status only

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

        // Auto-select first agent if none selected
        if (!selectedAgentId && agentsData.agents?.length > 0) {
          setSelectedAgentId(agentsData.agents[0].id);
        }
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
  }, [selectedAgentId]);

  // Spawn agent handler
  const handleSpawnAgent = async () => {
    if (!spawnName.trim()) {
      setSpawnError('Agent name is required');
      return;
    }

    setSpawning(true);
    setSpawnError(null);

    try {
      const response = await fetch('/api/agents/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: spawnName.trim(),
          harnessType: spawnHarness,
          skills: spawnSkills,
          systemPrompt: spawnSystemPrompt || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to spawn agent');
      }

      // Success - close modal and reset form
      setShowSpawnModal(false);
      setSpawnName('');
      setSpawnHarness('claude-code');
      setSpawnSkills(['typescript', 'react']);
      setSpawnSystemPrompt('');
    } catch (error) {
      setSpawnError(error instanceof Error ? error.message : 'Failed to spawn agent');
    } finally {
      setSpawning(false);
    }
  };

  const toggleSkill = (skill: string) => {
    setSpawnSkills(prev =>
      prev.includes(skill)
        ? prev.filter(s => s !== skill)
        : [...prev, skill]
    );
  };

  // Compute agent statistics
  const agentStats = useMemo(() => {
    const idle = agents.filter(a => a.status === 'idle').length;
    const busy = agents.filter(a => a.status === 'busy').length;
    const error = agents.filter(a => a.status === 'error').length;
    return { idle, busy, error, total: agents.length };
  }, [agents]);

  // Task queue for display
  const pendingTasks = useMemo(() => {
    return tasks.filter(t => t.status === 'pending' || t.status === 'ready' || t.status === 'claimed');
  }, [tasks]);

  // Get selected agent
  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  // Get current task for selected agent
  const currentTaskData = selectedAgent?.currentTask ? tasks.find(t => t.id === selectedAgent.currentTask) : null;

  // Get agent phase
  const getAgentPhase = (agent: AgentWithRegistry): AgentPhase => {
    if (agent.status === 'busy') {
      if (agent.currentTask) return 'executing';
      return 'claiming';
    }
    if (agent.status === 'error') return 'idle';
    return 'looking';
  };

  const displayPhase = selectedAgent ? getAgentPhase(selectedAgent) : simulatedPhase;

  // Format uptime from startedAt
  const formatUptime = (startedAt: string): string => {
    const start = new Date(startedAt).getTime();
    const now = Date.now();
    const diffMs = now - start;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ${diffMins % 60}m`;
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
                <span className="text-[#f7f8f8] tracking-widest text-sm font-semibold">AGENT CONTROLLER</span>
                <span className="text-[#8b8b8e]">]</span>
              </div>
              <LiveIndicator
                label={isConnected ? 'CONNECTED' : 'OFFLINE'}
                variant={isConnected ? 'success' : 'error'}
              />
            </div>
            <div className="flex items-center gap-4">
              {/* Spawn Agent Button */}
              <button
                onClick={() => setShowSpawnModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgb(79,255,238)]/10 text-[rgb(79,255,238)] border border-[rgb(79,255,238)]/30 hover:bg-[rgb(79,255,238)]/20 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Spawn Agent
              </button>

              <div className="h-6 w-px bg-[#26262a]" />

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
            <span className="text-[#8b8b8e]">agent.status()</span>
            <span className="text-[#26262a] mx-2">→</span>
            <span className="text-[#f7f8f8]">
              {PHASE_LABELS[displayPhase]}
            </span>
            {displayPhase !== 'idle' && displayPhase !== 'complete' && (
              <span className="animate-pulse text-[rgb(79,255,238)] ml-1">...</span>
            )}
            {currentTaskData && (
              <span className="ml-4 text-[#8b8b8e]">
                task: <span className="text-[rgb(79,255,238)]">{currentTaskData.title}</span>
              </span>
            )}
          </div>
        </div>

        {/* Main Content - 3 Column Visualizer */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full grid grid-cols-[280px_1fr_320px] divide-x divide-[#26262a]">
            {/* Left Panel - Agent List & Status */}
            <div className="flex flex-col overflow-hidden bg-[#0d0d0f]">
              <div className="px-4 py-3 border-b border-[#26262a] bg-[#16161a]/30">
                <div className="text-xs text-[#8b8b8e] tracking-wide uppercase">Agent Status</div>
              </div>

              {agents.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-[#2a2a30] flex items-center justify-center mb-4">
                    <Bot className="w-8 h-8 text-[#8b8b8e]" />
                  </div>
                  <p className="text-sm text-[#f7f8f8] font-medium mb-1">No agents running</p>
                  <p className="text-xs text-[#8b8b8e] mb-4">Click "Spawn Agent" to start</p>

                  {/* Agent lifecycle overview */}
                  <div className="w-full space-y-1.5 text-left mt-4">
                    {PHASE_ORDER.map((p, i) => (
                      <div key={p} className="flex items-center gap-2 text-xs">
                        <div className="h-px bg-[#26262a] w-3" />
                        <span className="text-[#8b8b8e]/50">
                          {i + 1}. {p}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {agents.map((agent) => {
                    const agentPhase = getAgentPhase(agent);
                    const isSelected = selectedAgentId === agent.id;

                    return (
                      <div
                        key={agent.id}
                        onClick={() => setSelectedAgentId(agent.id)}
                        className={`p-4 border-b border-[#26262a]/50 cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-[rgb(79,255,238)]/5 border-l-2 border-l-[rgb(79,255,238)]'
                            : 'hover:bg-[#16161a] border-l-2 border-l-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className="relative">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              agent.status === 'busy'
                                ? 'bg-[rgb(79,255,238)]/20 text-[rgb(79,255,238)]'
                                : agent.status === 'error'
                                ? 'bg-[#ff6467]/20 text-[#ff6467]'
                                : 'bg-[#2a2a30] text-[#8b8b8e]'
                            }`}>
                              <Cpu className="w-4 h-4" />
                            </div>
                            {agent.status === 'busy' && (
                              <div
                                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[rgb(79,255,238)]"
                                style={{
                                  animation: 'heartbeat 1.5s ease-in-out infinite',
                                  boxShadow: '0 0 6px rgba(79, 255, 238, 0.5)',
                                }}
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#f7f8f8] truncate">{agent.name}</p>
                            <p className="text-xs text-[#8b8b8e]">{PHASE_LABELS[agentPhase]}</p>
                          </div>
                        </div>

                        {/* Lifecycle indicator */}
                        <div className="flex items-center gap-1 mb-2">
                          {PHASE_ORDER.map((p, i) => (
                            <div
                              key={p}
                              className={`h-1 flex-1 rounded-full transition-all ${
                                PHASE_ORDER.indexOf(agentPhase) >= i
                                  ? 'bg-[rgb(79,255,238)]'
                                  : 'bg-[#26262a]'
                              }`}
                            />
                          ))}
                        </div>

                        {/* Skills */}
                        <div className="flex flex-wrap gap-1">
                          {agent.skills.slice(0, 4).map((skill) => (
                            <span
                              key={skill}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-[#26262a]/50 text-[#8b8b8e]"
                            >
                              {skill}
                            </span>
                          ))}
                          {agent.skills.length > 4 && (
                            <span className="text-[10px] text-[#8b8b8e]">+{agent.skills.length - 4}</span>
                          )}
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-[#8b8b8e]">
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />
                            {agent.tasksCompleted}
                          </span>
                          <span className="flex items-center gap-1">
                            <Timer className="w-3 h-3" />
                            {formatUptime(agent.startedAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Middle Panel - Task Queue */}
            <div className="flex flex-col overflow-hidden bg-[#0d0d0f]">
              <div className="px-4 py-3 border-b border-[#26262a] bg-[#16161a]/30 flex items-center justify-between">
                <div className="text-xs text-[#8b8b8e] tracking-wide uppercase">Task Queue (Beads)</div>
                <span className="text-xs text-[#8b8b8e]">{pendingTasks.length} pending</span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {pendingTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-12 h-12 rounded-full bg-[#2a2a30] flex items-center justify-center mb-3">
                      <Sparkles className="w-6 h-6 text-[#8b8b8e]" />
                    </div>
                    <p className="text-sm text-[#8b8b8e]">No pending tasks</p>
                    <p className="text-xs text-[#8b8b8e]/50 mt-1">Create a task to get started</p>
                  </div>
                ) : (
                  pendingTasks.map((task) => {
                    const isCurrent = selectedAgent?.currentTask === task.id || (!selectedAgent && simulatedPhase === 'executing');
                    const isClaiming = (selectedAgent?.currentTask === task.id && displayPhase === 'claiming') || (!selectedAgent && simulatedPhase === 'claiming');
                    const agentSkills = selectedAgent?.skills || AVAILABLE_SKILLS.slice(0, 6);
                    const isClaimable = task.requiredSkills.length === 0 || task.requiredSkills.some(s => agentSkills.includes(s));

                    return (
                      <div
                        key={task.id}
                        className={`relative rounded-xl border p-4 transition-all duration-300 ${
                          isCurrent
                            ? 'border-[rgb(79,255,238)] bg-[rgb(79,255,238)]/5'
                            : isClaimable
                            ? 'border-[#26262a] hover:border-[#3a3a3e]'
                            : 'border-[#26262a]/30 opacity-40'
                        }`}
                      >
                        {/* Claiming ping animation */}
                        {isClaiming && (
                          <div
                            className="absolute inset-0 rounded-xl border border-[rgb(79,255,238)]"
                            style={{ animation: 'claimPing 1s ease-out infinite' }}
                          />
                        )}

                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-[#8b8b8e]">&lt;</span>
                              <span className={`text-sm font-medium truncate ${isCurrent ? 'text-[#f7f8f8]' : 'text-[#8b8b8e]'}`}>
                                {task.title}
                              </span>
                              <span className="text-xs text-[#8b8b8e]">/&gt;</span>
                            </div>
                            {task.description && (
                              <p className="text-xs text-[#8b8b8e]/70 mt-1 line-clamp-1">{task.description}</p>
                            )}
                          </div>
                          <span className={`text-sm ${PRIORITY_COLORS[task.priority]}`}>
                            {PRIORITY_ICONS[task.priority]}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            task.status === 'claimed'
                              ? 'bg-[#a855f7]/20 text-[#a855f7]'
                              : task.status === 'ready'
                              ? 'bg-[rgb(79,255,238)]/20 text-[rgb(79,255,238)]'
                              : 'bg-[#8b8b8e]/20 text-[#8b8b8e]'
                          }`}>
                            {task.status}
                          </span>
                          {task.requiredSkills.slice(0, 2).map((skill) => (
                            <span
                              key={skill}
                              className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                agentSkills.includes(skill)
                                  ? 'border-[rgb(79,255,238)]/50 text-[rgb(79,255,238)]'
                                  : 'border-[#26262a] text-[#8b8b8e]/50'
                              }`}
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Panel - CLI Output */}
            <div className="flex flex-col overflow-hidden bg-[#0d0d0f]">
              <div className="px-4 py-3 border-b border-[#26262a] bg-[#16161a]/30 flex items-center justify-between">
                <div className="text-xs text-[#8b8b8e] tracking-wide uppercase">Claude Code CLI</div>
                <button
                  onClick={() => setCliLogs([])}
                  className="text-xs text-[#8b8b8e] hover:text-[#f7f8f8] transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <div className="bg-[#16161a] rounded-xl border border-[#26262a] p-4 min-h-[300px]">
                  {cliLogs.length === 0 ? (
                    <div className="text-xs text-[#8b8b8e]/50 font-mono">
                      $ awaiting task execution...
                      <span className="text-[rgb(79,255,238)] animate-pulse ml-1">█</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {cliLogs.slice(-15).map((log, i) => (
                        <div
                          key={i}
                          className={`text-xs font-mono ${
                            log.type === 'command'
                              ? 'text-[#8b8b8e]'
                              : log.type === 'success'
                              ? 'text-[#22c55e]'
                              : log.type === 'claude'
                              ? 'text-[#f7f8f8]'
                              : log.type === 'cass'
                              ? 'text-[rgb(79,255,238)]/80'
                              : log.type === 'mail'
                              ? 'text-[#a855f7]'
                              : log.type === 'error'
                              ? 'text-[#ff6467]'
                              : 'text-[#8b8b8e]'
                          }`}
                          style={{ animation: `slideInLog 0.2s ease-out ${i * 0.05}s both` }}
                        >
                          {log.line}
                        </div>
                      ))}
                      {(displayPhase === 'executing' || displayPhase === 'retrieving') && (
                        <span className="text-xs text-[rgb(79,255,238)] animate-pulse">█</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Integration indicators */}
                <div className="mt-4 space-y-2">
                  <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all ${
                    displayPhase === 'retrieving' || displayPhase === 'storing'
                      ? 'border-[rgb(79,255,238)] bg-[rgb(79,255,238)]/5'
                      : 'border-[#26262a]'
                  }`}>
                    <Database className={`w-4 h-4 ${
                      displayPhase === 'retrieving' || displayPhase === 'storing'
                        ? 'text-[rgb(79,255,238)]'
                        : 'text-[#8b8b8e]'
                    }`} />
                    <span className="text-xs text-[#8b8b8e]">CASS Memory</span>
                    {(displayPhase === 'retrieving' || displayPhase === 'storing') && (
                      <span className="text-[10px] text-[rgb(79,255,238)] animate-pulse ml-auto">active</span>
                    )}
                  </div>

                  <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all ${
                    displayPhase === 'publishing'
                      ? 'border-[#a855f7] bg-[#a855f7]/5'
                      : 'border-[#26262a]'
                  }`}>
                    <Mail className={`w-4 h-4 ${
                      displayPhase === 'publishing'
                        ? 'text-[#a855f7]'
                        : 'text-[#8b8b8e]'
                    }`} />
                    <span className="text-xs text-[#8b8b8e]">MCP Mail</span>
                    {displayPhase === 'publishing' && (
                      <span className="text-[10px] text-[#a855f7] animate-pulse ml-auto">active</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Lifecycle steps */}
              <div className="p-4 border-t border-[#26262a] bg-[#16161a]/30">
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { num: '01', label: 'START', desc: 'Subscribe & heartbeat' },
                    { num: '02', label: 'CLAIM', desc: 'Filter & claim task' },
                    { num: '03', label: 'EXECUTE', desc: 'Spawn Claude CLI' },
                    { num: '04', label: 'COMPLETE', desc: 'Store & publish' },
                  ].map((step, i) => (
                    <div
                      key={step.num}
                      className={`text-center p-2 rounded-lg border transition-all ${
                        (i === 0 && (displayPhase === 'idle' || displayPhase === 'looking')) ||
                        (i === 1 && displayPhase === 'claiming') ||
                        (i === 2 && (displayPhase === 'retrieving' || displayPhase === 'executing')) ||
                        (i === 3 && (displayPhase === 'storing' || displayPhase === 'publishing' || displayPhase === 'complete'))
                          ? 'border-[rgb(79,255,238)] bg-[rgb(79,255,238)]/5'
                          : 'border-[#26262a]/50'
                      }`}
                    >
                      <div className="text-[10px] text-[rgb(79,255,238)] font-medium">{step.num}</div>
                      <div className="text-[10px] text-[#f7f8f8] font-medium">{step.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Spawn Agent Modal */}
      {showSpawnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#16161a] border border-[#26262a] rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#26262a]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[rgb(79,255,238)]/20 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-[rgb(79,255,238)]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[#f7f8f8]">Spawn Agent</h2>
                  <p className="text-xs text-[#8b8b8e]">Configure and launch a new AI agent</p>
                </div>
              </div>
              <button
                onClick={() => setShowSpawnModal(false)}
                className="p-2 hover:bg-[#26262a] rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-[#8b8b8e]" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-5">
              {/* Error display */}
              {spawnError && (
                <div className="p-3 rounded-lg bg-[#ff6467]/10 border border-[#ff6467]/30 text-[#ff6467] text-sm">
                  {spawnError}
                </div>
              )}

              {/* Agent Name */}
              <div>
                <label className="block text-sm font-medium text-[#f7f8f8] mb-2">
                  Agent Name
                </label>
                <input
                  type="text"
                  value={spawnName}
                  onChange={(e) => setSpawnName(e.target.value)}
                  placeholder="e.g., frontend-specialist"
                  className="w-full px-3 py-2 rounded-lg bg-[#0d0d0f] border border-[#26262a] text-[#f7f8f8] placeholder-[#8b8b8e]/50 focus:outline-none focus:border-[rgb(79,255,238)]/50 text-sm"
                />
              </div>

              {/* Harness Type Selection */}
              <div>
                <label className="block text-sm font-medium text-[#f7f8f8] mb-2">
                  <Settings2 className="w-4 h-4 inline mr-1.5" />
                  Harness Type
                </label>
                <div className="space-y-2">
                  {HARNESS_OPTIONS.map((harness) => (
                    <button
                      key={harness.id}
                      onClick={() => setSpawnHarness(harness.id)}
                      className={`w-full p-3 rounded-lg border text-left transition-all ${
                        spawnHarness === harness.id
                          ? 'border-[rgb(79,255,238)] bg-[rgb(79,255,238)]/10'
                          : 'border-[#26262a] hover:border-[#3a3a3e]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{harness.icon}</span>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-[#f7f8f8]">{harness.name}</p>
                          <p className="text-xs text-[#8b8b8e]">{harness.description}</p>
                        </div>
                        {spawnHarness === harness.id && (
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: harness.color, animation: 'pulse-glow 2s ease-in-out infinite', color: harness.color }}
                          />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Skills Selection */}
              <div>
                <label className="block text-sm font-medium text-[#f7f8f8] mb-2">
                  <Zap className="w-4 h-4 inline mr-1.5" />
                  Skills
                </label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_SKILLS.map((skill) => (
                    <button
                      key={skill}
                      onClick={() => toggleSkill(skill)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                        spawnSkills.includes(skill)
                          ? 'border-[rgb(79,255,238)] text-[rgb(79,255,238)] bg-[rgb(79,255,238)]/10'
                          : 'border-[#26262a] text-[#8b8b8e] hover:border-[#3a3a3e]'
                      }`}
                    >
                      {skill}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-[#8b8b8e] mt-2">
                  Selected: {spawnSkills.length} skill{spawnSkills.length !== 1 ? 's' : ''}
                </p>
              </div>

              {/* System Prompt */}
              <div>
                <label className="block text-sm font-medium text-[#f7f8f8] mb-2">
                  <Code2 className="w-4 h-4 inline mr-1.5" />
                  System Prompt <span className="text-[#8b8b8e] font-normal">(optional)</span>
                </label>
                <textarea
                  value={spawnSystemPrompt}
                  onChange={(e) => setSpawnSystemPrompt(e.target.value)}
                  placeholder="Custom instructions for this agent..."
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg bg-[#0d0d0f] border border-[#26262a] text-[#f7f8f8] placeholder-[#8b8b8e]/50 focus:outline-none focus:border-[rgb(79,255,238)]/50 text-sm resize-none font-mono"
                />
                <p className="text-xs text-[#8b8b8e] mt-1">
                  This prompt will be prepended to all task instructions
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-[#26262a]">
              <button
                onClick={() => setShowSpawnModal(false)}
                className="px-4 py-2 text-sm text-[#8b8b8e] hover:text-[#f7f8f8] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSpawnAgent}
                disabled={spawning || !spawnName.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[rgb(79,255,238)] text-[#0d0d0f] font-medium text-sm hover:bg-[rgb(79,255,238)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {spawning ? (
                  <>
                    <div className="w-4 h-4 border-2 border-[#0d0d0f]/30 border-t-[#0d0d0f] rounded-full animate-spin" />
                    Spawning...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Spawn Agent
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
