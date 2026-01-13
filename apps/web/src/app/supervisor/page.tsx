'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Brain,
  Activity,
  Send,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  GitBranch,
  MessageSquare,
  Layers,
  Zap,
  ArrowRight,
  RefreshCw,
  Terminal,
  ChevronDown,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { Badge, LiveIndicator } from '@/components/ui';

// Animation styles
const supervisorStyles = `
  @keyframes pulse-ring {
    0% { transform: scale(0.8); opacity: 1; }
    100% { transform: scale(2); opacity: 0; }
  }
  @keyframes thinking {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
  @keyframes flow {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
`;

interface SupervisorState {
  status: 'idle' | 'running' | 'completed' | 'error';
  currentRequest?: string;
  startedAt?: string;
  completedAt?: string;
  llmProvider?: string;
  llmModel?: string;
  iterations: number;
  tasksCreated: number;
  tasksCompleted: number;
  tasksFailed: number;
  conflicts: number;
  lastReport?: string;
  error?: string;
  history: SupervisorHistoryEntry[];
  queue: QueueRequest[];
  queueLength: number;
}

interface SupervisorHistoryEntry {
  id: string;
  request: string;
  status: 'completed' | 'failed';
  startedAt: string;
  completedAt: string;
  tasksCreated: number;
  tasksCompleted: number;
  tasksFailed: number;
  iterations: number;
}

interface QueueRequest {
  id: string;
  request: string;
  priority: 'high' | 'normal' | 'low';
  requestedAt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

// LangGraph node visualization
const LANGGRAPH_NODES = [
  { id: 'planner', name: 'Planner', description: 'Breaks down request into tasks', icon: GitBranch },
  { id: 'assigner', name: 'Assigner', description: 'Matches tasks to agents', icon: Zap },
  { id: 'monitor', name: 'Monitor', description: 'Tracks task progress', icon: Activity },
  { id: 'coordinator', name: 'Coordinator', description: 'Resolves conflicts', icon: MessageSquare },
];

export default function SupervisorPage() {
  const router = useRouter();
  const [state, setState] = useState<SupervisorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState('');
  const [priority, setPriority] = useState<'high' | 'normal' | 'low'>('normal');
  const [sending, setSending] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [activeNode, setActiveNode] = useState<string>('planner');

  // Fetch supervisor state
  useEffect(() => {
    async function fetchState() {
      try {
        const res = await fetch('/api/supervisor');
        const data = await res.json();
        setState(data);
      } catch (error) {
        console.error('Failed to fetch supervisor state:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchState();
    const interval = setInterval(fetchState, 2000);
    return () => clearInterval(interval);
  }, []);

  // Animate through nodes when running
  useEffect(() => {
    if (state?.status === 'running') {
      const nodes = ['planner', 'assigner', 'monitor', 'coordinator'];
      let index = 0;
      const interval = setInterval(() => {
        index = (index + 1) % nodes.length;
        setActiveNode(nodes[index]);
      }, 1500);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [state?.status]);

  const handleSendRequest = async () => {
    if (!request.trim()) return;

    setSending(true);
    try {
      const res = await fetch('/api/supervisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: request.trim(), priority }),
      });

      if (res.ok) {
        setRequest('');
        // Refresh state
        const stateRes = await fetch('/api/supervisor');
        const data = await stateRes.json();
        setState(data);
      }
    } catch (error) {
      console.error('Failed to send request:', error);
    } finally {
      setSending(false);
    }
  };

  const handleGeneratePlan = async () => {
    if (!request.trim()) return;

    setGeneratingPlan(true);
    try {
      const res = await fetch('/api/supervisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: request.trim(), mode: 'plan' }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.planId) {
          setRequest('');
          // Navigate to the plan view
          router.push(`/plans/${data.planId}`);
        }
      }
    } catch (error) {
      console.error('Failed to generate plan:', error);
    } finally {
      setGeneratingPlan(false);
    }
  };

  const handleCancelRequest = async (id?: string) => {
    try {
      const url = id ? `/api/supervisor?id=${id}` : '/api/supervisor';
      await fetch(url, { method: 'DELETE' });
      // Refresh state
      const res = await fetch('/api/supervisor');
      const data = await res.json();
      setState(data);
    } catch (error) {
      console.error('Failed to cancel request:', error);
    }
  };

  const formatTimeAgo = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0d0d0f]">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-[rgb(79,255,238)] border-t-transparent mx-auto"></div>
            <Brain className="absolute inset-0 m-auto w-5 h-5 text-[rgb(79,255,238)]" />
          </div>
          <p className="mt-4 text-sm text-[#8b8b8e] font-mono">Loading supervisor...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{supervisorStyles}</style>
      <div className="flex flex-col h-full bg-[#0d0d0f]">
        {/* Header */}
        <div className="border-b border-[#26262a] bg-[#16161a]/50 backdrop-blur-sm shrink-0">
          <div className="h-14 flex items-center justify-between px-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[#8b8b8e]">[</span>
                <span className="text-[#f7f8f8] tracking-widest text-sm font-semibold">SUPERVISOR</span>
                <span className="text-[#8b8b8e]">]</span>
              </div>
              <LiveIndicator
                label={state?.status === 'running' ? 'RUNNING' : state?.status === 'idle' ? 'IDLE' : state?.status?.toUpperCase() || 'OFFLINE'}
                variant={state?.status === 'running' ? 'warning' : state?.status === 'idle' ? 'success' : 'error'}
              />
            </div>
            <div className="flex items-center gap-4 text-xs text-[#8b8b8e]">
              {state?.llmProvider && (
                <span className="flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5" />
                  {state.llmProvider} / {state.llmModel}
                </span>
              )}
              <div className="h-6 w-px bg-[#26262a]" />
              <span>Queue: {state?.queueLength || 0}</span>
            </div>
          </div>

          {/* Status bar */}
          <div className="h-8 flex items-center px-6 border-t border-[#26262a]/50 bg-[#0d0d0f]/50 text-xs font-mono">
            <span className="text-[#8b8b8e]/50 mr-2">$</span>
            <span className="text-[#8b8b8e]">supervisor.graph.execute()</span>
            <span className="text-[#26262a] mx-2">→</span>
            <span className="text-[#f7f8f8]">
              {state?.status === 'running' ? (
                <span className="text-[rgb(79,255,238)]">
                  Processing: &quot;{state.currentRequest?.slice(0, 40)}...&quot;
                </span>
              ) : (
                'LangGraph supervisor ready'
              )}
            </span>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* LangGraph Visualization */}
            <div className="rounded-xl bg-[#16161a]/50 border border-[#26262a] p-6">
              <h2 className="text-sm font-semibold text-[#f7f8f8] mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4 text-[rgb(79,255,238)]" />
                LangGraph Supervisor Flow
              </h2>

              <div className="flex items-center justify-between gap-2">
                {LANGGRAPH_NODES.map((node, index) => (
                  <div key={node.id} className="flex-1 flex items-center">
                    <div
                      className={`flex-1 rounded-lg border p-4 transition-all ${
                        activeNode === node.id && state?.status === 'running'
                          ? 'border-[rgb(79,255,238)] bg-[rgb(79,255,238)]/10'
                          : 'border-[#26262a]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            activeNode === node.id && state?.status === 'running'
                              ? 'bg-[rgb(79,255,238)]/20 text-[rgb(79,255,238)]'
                              : 'bg-[#2a2a30] text-[#8b8b8e]'
                          }`}
                        >
                          <node.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#f7f8f8]">{node.name}</p>
                          <p className="text-xs text-[#8b8b8e]">{node.description}</p>
                        </div>
                      </div>
                      {activeNode === node.id && state?.status === 'running' && (
                        <div className="mt-3 h-1 bg-[#26262a] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[rgb(79,255,238)] rounded-full"
                            style={{ animation: 'flow 1s ease-in-out infinite' }}
                          />
                        </div>
                      )}
                    </div>
                    {index < LANGGRAPH_NODES.length - 1 && (
                      <ArrowRight className="w-5 h-5 mx-2 text-[#26262a] shrink-0" />
                    )}
                  </div>
                ))}
              </div>

              {/* Integration Info */}
              <div className="mt-4 pt-4 border-t border-[#26262a] grid grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-xs text-[#8b8b8e] mb-1">MCP Mail</p>
                  <p className="text-sm text-[#f7f8f8]">Agent communication</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-[#8b8b8e] mb-1">Beads</p>
                  <p className="text-sm text-[#f7f8f8]">Task persistence</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-[#8b8b8e] mb-1">CASS</p>
                  <p className="text-sm text-[#f7f8f8]">Semantic memory</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-[#8b8b8e] mb-1">Claude/OpenAI</p>
                  <p className="text-sm text-[#f7f8f8]">LLM reasoning</p>
                </div>
              </div>
            </div>

            {/* Request Input */}
            <div className="rounded-xl bg-[#16161a]/50 border border-[#26262a] p-6">
              <h2 className="text-sm font-semibold text-[#f7f8f8] mb-4 flex items-center gap-2">
                <Send className="w-4 h-4 text-[rgb(79,255,238)]" />
                Send Request to Supervisor
              </h2>

              <div className="space-y-4">
                <textarea
                  value={request}
                  onChange={(e) => setRequest(e.target.value)}
                  placeholder="Describe what you want the agent swarm to accomplish..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-lg bg-[#0d0d0f] border border-[#26262a] text-[#f7f8f8] placeholder-[#8b8b8e]/50 focus:outline-none focus:border-[rgb(79,255,238)]/50 text-sm resize-none"
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#8b8b8e]">Priority:</span>
                    {(['high', 'normal', 'low'] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPriority(p)}
                        className={`px-3 py-1 text-xs rounded-lg border transition-all ${
                          priority === p
                            ? p === 'high'
                              ? 'border-[#ff6467] text-[#ff6467] bg-[#ff6467]/10'
                              : p === 'normal'
                              ? 'border-[rgb(79,255,238)] text-[rgb(79,255,238)] bg-[rgb(79,255,238)]/10'
                              : 'border-[#8b8b8e] text-[#8b8b8e] bg-[#8b8b8e]/10'
                            : 'border-[#26262a] text-[#8b8b8e] hover:border-[#3a3a3e]'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleGeneratePlan}
                      disabled={generatingPlan || !request.trim()}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[rgb(79,255,238)] text-[rgb(79,255,238)] font-medium text-sm hover:bg-[rgb(79,255,238)]/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {generatingPlan ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <FileText className="w-4 h-4" />
                          Generate Plan
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleSendRequest}
                      disabled={sending || !request.trim()}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[rgb(79,255,238)] text-[#0d0d0f] font-medium text-sm hover:bg-[rgb(79,255,238)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {sending ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Execute Now
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Current Execution */}
            {state?.status === 'running' && state.currentRequest && (
              <div className="rounded-xl bg-[rgb(79,255,238)]/5 border border-[rgb(79,255,238)]/30 p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-[rgb(79,255,238)] mb-2 flex items-center gap-2">
                      <Activity className="w-4 h-4 animate-pulse" />
                      Currently Executing
                    </h2>
                    <p className="text-[#f7f8f8]">&quot;{state.currentRequest}&quot;</p>
                    <p className="text-xs text-[#8b8b8e] mt-2">
                      Started {state.startedAt ? formatTimeAgo(state.startedAt) : 'now'}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                      <span className="text-[#8b8b8e]">Iterations:</span>
                      <span className="text-[#f7f8f8]">{state.iterations}</span>
                      <span className="text-[#8b8b8e]">Tasks Created:</span>
                      <span className="text-[#f7f8f8]">{state.tasksCreated}</span>
                      <span className="text-[#8b8b8e]">Completed:</span>
                      <span className="text-[#22c55e]">{state.tasksCompleted}</span>
                      <span className="text-[#8b8b8e]">Conflicts:</span>
                      <span className="text-[#f7f8f8]">{state.conflicts}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Queue */}
            {state?.queue && state.queue.length > 0 && (
              <div className="rounded-xl bg-[#16161a]/50 border border-[#26262a] p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-[#f7f8f8] flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#8b8b8e]" />
                    Request Queue
                  </h2>
                  <button
                    onClick={() => handleCancelRequest()}
                    className="text-xs text-[#ff6467] hover:text-[#ff6467]/80 transition-colors"
                  >
                    Clear All
                  </button>
                </div>

                <div className="space-y-2">
                  {state.queue.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-[#0d0d0f] border border-[#26262a]"
                    >
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={
                            req.priority === 'high' ? 'error' :
                            req.priority === 'normal' ? 'primary' : 'default'
                          }
                          size="sm"
                        >
                          {req.priority}
                        </Badge>
                        <span className="text-sm text-[#f7f8f8]">{req.request}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[#8b8b8e]">
                          {formatTimeAgo(req.requestedAt)}
                        </span>
                        <button
                          onClick={() => handleCancelRequest(req.id)}
                          className="p-1 hover:bg-[#26262a] rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-[#8b8b8e]" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Last Report */}
            {state?.lastReport && (
              <div className="rounded-xl bg-[#16161a]/50 border border-[#26262a] p-6">
                <h2 className="text-sm font-semibold text-[#f7f8f8] mb-4 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#8b8b8e]" />
                  Last Execution Report
                </h2>
                <pre className="text-xs text-[#8b8b8e] font-mono whitespace-pre-wrap bg-[#0d0d0f] rounded-lg p-4 border border-[#26262a] overflow-x-auto">
                  {state.lastReport}
                </pre>
              </div>
            )}

            {/* History */}
            {state?.history && state.history.length > 0 && (
              <div className="rounded-xl bg-[#16161a]/50 border border-[#26262a] p-6">
                <h2 className="text-sm font-semibold text-[#f7f8f8] mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#8b8b8e]" />
                  Execution History
                </h2>

                <div className="space-y-2">
                  {state.history.slice(0, 10).map((entry) => (
                    <div key={entry.id} className="rounded-lg bg-[#0d0d0f] border border-[#26262a]">
                      <button
                        onClick={() => setExpandedHistory(expandedHistory === entry.id ? null : entry.id)}
                        className="w-full flex items-center justify-between p-3 text-left"
                      >
                        <div className="flex items-center gap-3">
                          {entry.status === 'completed' ? (
                            <CheckCircle2 className="w-4 h-4 text-[#22c55e]" />
                          ) : (
                            <XCircle className="w-4 h-4 text-[#ff6467]" />
                          )}
                          <span className="text-sm text-[#f7f8f8] truncate max-w-[300px]">
                            {entry.request}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[#8b8b8e]">
                            {formatTimeAgo(entry.completedAt)}
                          </span>
                          {expandedHistory === entry.id ? (
                            <ChevronDown className="w-4 h-4 text-[#8b8b8e]" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-[#8b8b8e]" />
                          )}
                        </div>
                      </button>

                      {expandedHistory === entry.id && (
                        <div className="px-3 pb-3 pt-0">
                          <div className="grid grid-cols-4 gap-4 text-xs p-3 rounded-lg bg-[#16161a]">
                            <div>
                              <span className="text-[#8b8b8e]">Tasks Created</span>
                              <p className="text-[#f7f8f8] mt-1">{entry.tasksCreated}</p>
                            </div>
                            <div>
                              <span className="text-[#8b8b8e]">Completed</span>
                              <p className="text-[#22c55e] mt-1">{entry.tasksCompleted}</p>
                            </div>
                            <div>
                              <span className="text-[#8b8b8e]">Failed</span>
                              <p className="text-[#ff6467] mt-1">{entry.tasksFailed}</p>
                            </div>
                            <div>
                              <span className="text-[#8b8b8e]">Iterations</span>
                              <p className="text-[#f7f8f8] mt-1">{entry.iterations}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!state?.status && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-20 h-20 rounded-full bg-[#2a2a30] flex items-center justify-center mb-4">
                  <Brain className="w-10 h-10 text-[#8b8b8e]" />
                </div>
                <p className="text-[#f7f8f8] font-medium">Supervisor Not Active</p>
                <p className="text-sm text-[#8b8b8e] mt-1 font-mono max-w-md">
                  Start the orchestrator with a supervisor to enable LangGraph-powered task coordination
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
