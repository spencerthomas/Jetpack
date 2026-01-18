'use client';

import { useState, useMemo } from 'react';
import {
  Bot,
  Activity,
  Wifi,
  WifiOff,
  RefreshCw,
  Filter,
  Grid3X3,
  List,
  AlertCircle,
  Clock,
  CheckCircle2,
  Cpu,
} from 'lucide-react';
import { useAgentStatus } from '@/hooks/useAgentStatus';
import { AgentStatusCard } from './AgentStatusCard';
import type { AgentStatusData } from './AgentStatusCard';

type ViewMode = 'grid' | 'list';
type FilterStatus = 'all' | 'busy' | 'idle' | 'error';

interface AgentStatusDashboardProps {
  className?: string;
  showHeader?: boolean;
  onAgentSelect?: (agent: AgentStatusData) => void;
}

// Animation keyframes for the dashboard
const dashboardStyles = `
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.1); }
  }
  @keyframes slideIn {
    from { transform: translateY(10px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

function formatLastUpdate(date: Date | null): string {
  if (!date) return 'Never';
  const now = Date.now();
  const diffSec = Math.floor((now - date.getTime()) / 1000);

  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMins = Math.floor(diffSec / 60);
  return `${diffMins}m ago`;
}

export function AgentStatusDashboard({
  className = '',
  showHeader = true,
  onAgentSelect,
}: AgentStatusDashboardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const { agents, isConnected, isLoading, error, stats, lastUpdate, reconnect } = useAgentStatus({
    enabled: true,
    onConnect: () => console.log('[AgentStatusDashboard] SSE connected'),
    onDisconnect: () => console.log('[AgentStatusDashboard] SSE disconnected'),
    onError: (err) => console.error('[AgentStatusDashboard] Error:', err),
  });

  // Filter agents based on selected status
  const filteredAgents = useMemo(() => {
    if (filterStatus === 'all') return agents;
    return agents.filter((agent) => agent.status === filterStatus);
  }, [agents, filterStatus]);

  // Handle agent selection
  const handleAgentClick = (agent: AgentStatusData) => {
    setSelectedAgentId(agent.id === selectedAgentId ? null : agent.id);
    onAgentSelect?.(agent);
  };

  return (
    <>
      <style>{dashboardStyles}</style>
      <div className={`flex flex-col h-full bg-[#0d0d0f] ${className}`}>
        {/* Header */}
        {showHeader && (
          <div className="border-b border-[#26262a] bg-[#16161a]/50 backdrop-blur-sm shrink-0">
            <div className="h-14 flex items-center justify-between px-6">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[#8b8b8e]">[</span>
                  <span className="text-[#f7f8f8] tracking-widest text-sm font-semibold">
                    AGENT STATUS
                  </span>
                  <span className="text-[#8b8b8e]">]</span>
                </div>

                {/* Connection indicator */}
                <div
                  className={`flex items-center gap-2 px-2 py-1 rounded-lg border ${
                    isConnected
                      ? 'border-[#22c55e]/30 bg-[#22c55e]/10'
                      : 'border-[#ff6467]/30 bg-[#ff6467]/10'
                  }`}
                >
                  {isConnected ? (
                    <>
                      <Wifi className="w-3 h-3 text-[#22c55e]" />
                      <span className="text-xs text-[#22c55e]">LIVE</span>
                      <div
                        className="w-1.5 h-1.5 rounded-full bg-[#22c55e]"
                        style={{ animation: 'pulse 2s ease-in-out infinite' }}
                      />
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3 h-3 text-[#ff6467]" />
                      <span className="text-xs text-[#ff6467]">OFFLINE</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Stats summary */}
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-[#8b8b8e]">
                    <Bot className="w-3 h-3" />
                    {stats.total} agents
                  </span>
                  {stats.busy > 0 && (
                    <span className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[rgb(79,255,238)] animate-pulse" />
                      <span className="text-[rgb(79,255,238)]">{stats.busy} working</span>
                    </span>
                  )}
                  {stats.error > 0 && (
                    <span className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#ff6467]" />
                      <span className="text-[#ff6467]">{stats.error} error</span>
                    </span>
                  )}
                </div>

                <div className="h-6 w-px bg-[#26262a]" />

                {/* Last update */}
                <div className="flex items-center gap-2 text-xs text-[#8b8b8e]">
                  <Clock className="w-3 h-3" />
                  Updated {formatLastUpdate(lastUpdate)}
                </div>

                {/* Reconnect button */}
                {!isConnected && (
                  <button
                    onClick={reconnect}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[#26262a] hover:border-[#3a3a3e] text-xs text-[#8b8b8e] hover:text-[#f7f8f8] transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Reconnect
                  </button>
                )}
              </div>
            </div>

            {/* Toolbar */}
            <div className="h-10 flex items-center justify-between px-6 border-t border-[#26262a]/50 bg-[#0d0d0f]/50">
              {/* Filters */}
              <div className="flex items-center gap-2">
                <Filter className="w-3 h-3 text-[#8b8b8e]" />
                <div className="flex items-center gap-1">
                  {(['all', 'busy', 'idle', 'error'] as FilterStatus[]).map((status) => (
                    <button
                      key={status}
                      onClick={() => setFilterStatus(status)}
                      className={`px-2 py-1 rounded text-xs transition-colors ${
                        filterStatus === status
                          ? 'bg-[rgb(79,255,238)]/20 text-[rgb(79,255,238)]'
                          : 'text-[#8b8b8e] hover:text-[#f7f8f8]'
                      }`}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                      {status === 'all' && ` (${stats.total})`}
                      {status === 'busy' && ` (${stats.busy})`}
                      {status === 'idle' && ` (${stats.idle})`}
                      {status === 'error' && ` (${stats.error})`}
                    </button>
                  ))}
                </div>
              </div>

              {/* View toggle */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-[#26262a] text-[#f7f8f8]'
                      : 'text-[#8b8b8e] hover:text-[#f7f8f8]'
                  }`}
                  title="Grid view"
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded transition-colors ${
                    viewMode === 'list'
                      ? 'bg-[#26262a] text-[#f7f8f8]'
                      : 'text-[#8b8b8e] hover:text-[#f7f8f8]'
                  }`}
                  title="List view"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Loading state */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-2 border-[rgb(79,255,238)] border-t-transparent animate-spin" />
                <Activity className="absolute inset-0 m-auto w-5 h-5 text-[rgb(79,255,238)]" />
              </div>
              <p className="mt-4 text-sm text-[#8b8b8e] font-mono">Connecting to agents...</p>
            </div>
          )}

          {/* Error state */}
          {error && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-16 h-16 rounded-full bg-[#ff6467]/10 flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-[#ff6467]" />
              </div>
              <p className="text-sm text-[#ff6467] mb-2">Connection Error</p>
              <p className="text-xs text-[#8b8b8e] mb-4">{error.message}</p>
              <button
                onClick={reconnect}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[rgb(79,255,238)]/10 text-[rgb(79,255,238)] border border-[rgb(79,255,238)]/30 hover:bg-[rgb(79,255,238)]/20 transition-colors text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Connection
              </button>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && filteredAgents.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-20 h-20 rounded-full bg-[#26262a] flex items-center justify-center mb-4">
                <Bot className="w-10 h-10 text-[#8b8b8e]" />
              </div>
              <p className="text-sm text-[#f7f8f8] font-medium mb-1">
                {filterStatus === 'all' ? 'No agents running' : `No ${filterStatus} agents`}
              </p>
              <p className="text-xs text-[#8b8b8e] text-center max-w-xs">
                {filterStatus === 'all'
                  ? 'Start agents with the CLI using `jetpack start` or spawn them from the UI'
                  : `Try selecting a different filter to see more agents`}
              </p>
            </div>
          )}

          {/* Agent grid/list */}
          {!isLoading && !error && filteredAgents.length > 0 && (
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                  : 'flex flex-col gap-3'
              }
              style={{ animation: 'fadeIn 0.3s ease-out' }}
            >
              {filteredAgents.map((agent, index) => (
                <div
                  key={agent.id}
                  style={{
                    animation: `slideIn 0.3s ease-out ${index * 0.05}s both`,
                  }}
                >
                  <AgentStatusCard
                    agent={agent}
                    isSelected={selectedAgentId === agent.id}
                    onClick={() => handleAgentClick(agent)}
                    compact={viewMode === 'list'}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer status bar */}
        <div className="h-8 flex items-center justify-between px-6 border-t border-[#26262a] bg-[#16161a]/30 text-xs font-mono shrink-0">
          <div className="flex items-center gap-4 text-[#8b8b8e]">
            <span className="flex items-center gap-1.5">
              <Cpu className="w-3 h-3" />
              {stats.total} total
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />
              {stats.idle} idle
            </span>
            <span className="flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-[rgb(79,255,238)]" />
              {stats.busy} busy
            </span>
            {stats.error > 0 && (
              <span className="flex items-center gap-1.5 text-[#ff6467]">
                <AlertCircle className="w-3 h-3" />
                {stats.error} error
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[#8b8b8e]">
            {isConnected ? (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                <span>Real-time updates active</span>
              </>
            ) : (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-[#ff6467]" />
                <span>Disconnected</span>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default AgentStatusDashboard;
