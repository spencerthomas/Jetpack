'use client';

import { useState, useEffect } from 'react';
import {
  Database,
  RefreshCw,
  Trash2,
  Sparkles,
  Eye,
  Clock,
  TrendingUp,
  Loader2,
  AlertCircle,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui';

// Memory type colors
const TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  codebase_knowledge: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', label: 'Codebase' },
  agent_learning: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Learning' },
  pattern_recognition: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'Pattern' },
  conversation_history: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Convo' },
  decision_rationale: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Decision' },
};

interface MemoryStats {
  stats: {
    total: number;
    byType: Record<string, number>;
    avgImportance: number;
    totalAccesses: number;
  };
  embeddings: {
    withEmbedding: number;
    withoutEmbedding: number;
    total: number;
    percentage: number;
  };
  config: {
    maxEntries: number;
    compactionThreshold: number;
    autoGenerateEmbeddings: boolean;
    hasEmbeddingGenerator: boolean;
    embeddingModel?: string;
  };
  fillPercentage: number;
}

interface Memory {
  id: string;
  type: string;
  content: string;
  importance: number;
  accessCount: number;
  createdAt: string;
  lastAccessed: string;
  hasEmbedding: boolean;
  metadata?: Record<string, unknown>;
}

export default function MemoryPage() {
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [isCompacting, setIsCompacting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch stats and memories
  async function fetchData() {
    try {
      const [statsRes, memoriesRes] = await Promise.all([
        fetch('/api/cass/stats'),
        fetch(`/api/cass/memories${selectedType ? `?type=${selectedType}` : ''}`),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (memoriesRes.ok) {
        const memoriesData = await memoriesRes.json();
        setMemories(memoriesData.memories);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setIsLoading(false);
    }
  }

  // Initial fetch and polling
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [selectedType]);

  // Handle backfill
  async function handleBackfill() {
    setIsBackfilling(true);
    setActionMessage(null);

    try {
      const res = await fetch('/api/cass/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 10 }),
      });

      const data = await res.json();

      if (res.ok) {
        setActionMessage({ type: 'success', text: `Backfilled ${data.updated} embeddings` });
        fetchData();
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Failed to backfill' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to backfill embeddings' });
    } finally {
      setIsBackfilling(false);
      setTimeout(() => setActionMessage(null), 3000);
    }
  }

  // Handle compact
  async function handleCompact() {
    if (!confirm('This will permanently remove low-importance memories (except codebase_knowledge). Continue?')) {
      return;
    }

    setIsCompacting(true);
    setActionMessage(null);

    try {
      const res = await fetch('/api/cass/compact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (res.ok) {
        setActionMessage({ type: 'success', text: `Removed ${data.removed} memories` });
        fetchData();
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Failed to compact' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to compact memory store' });
    } finally {
      setIsCompacting(false);
      setTimeout(() => setActionMessage(null), 3000);
    }
  }

  // Format date
  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-secondary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-6 border-b border-subtle shrink-0">
        <div className="flex items-center gap-3">
          <Database className="w-5 h-5 text-cyan-400" />
          <h1 className="text-lg font-semibold text-primary">Memory Dashboard</h1>
          {stats && (
            <span className="text-sm text-muted">
              {stats.stats.total.toLocaleString()} / {stats.config.maxEntries.toLocaleString()} entries
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {actionMessage && (
            <span
              className={`text-sm flex items-center gap-1 ${
                actionMessage.type === 'success' ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {actionMessage.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {actionMessage.text}
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBackfill}
            disabled={isBackfilling || !stats?.config.hasEmbeddingGenerator}
            title={!stats?.config.hasEmbeddingGenerator ? 'Configure API key in settings' : ''}
          >
            {isBackfilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span className="ml-1.5">Backfill</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={handleCompact} disabled={isCompacting}>
            {isCompacting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            <span className="ml-1.5">Compact</span>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-6 py-4 border-b border-subtle">
        <div className="grid grid-cols-4 gap-4">
          {/* Total Memories */}
          <div className="p-4 rounded-lg bg-surface border border-default">
            <div className="flex items-center gap-2 text-muted text-sm mb-2">
              <Database className="w-4 h-4" />
              Total Memories
            </div>
            <div className="text-2xl font-semibold text-primary">{stats?.stats.total.toLocaleString() ?? 0}</div>
            <div className="mt-2 h-2 bg-hover rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 transition-all duration-300"
                style={{ width: `${Math.min(stats?.fillPercentage ?? 0, 100)}%` }}
              />
            </div>
            <div className="text-xs text-muted mt-1">{stats?.fillPercentage ?? 0}% of max</div>
          </div>

          {/* Avg Importance */}
          <div className="p-4 rounded-lg bg-surface border border-default">
            <div className="flex items-center gap-2 text-muted text-sm mb-2">
              <TrendingUp className="w-4 h-4" />
              Avg Importance
            </div>
            <div className="text-2xl font-semibold text-primary">{stats?.stats.avgImportance?.toFixed(2) ?? '0.00'}</div>
            <div className="mt-2 h-2 bg-hover rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  (stats?.stats.avgImportance ?? 0) > 0.6
                    ? 'bg-green-500'
                    : (stats?.stats.avgImportance ?? 0) > 0.3
                    ? 'bg-amber-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${(stats?.stats.avgImportance ?? 0) * 100}%` }}
              />
            </div>
            <div className="text-xs text-muted mt-1">0 = low, 1 = high</div>
          </div>

          {/* Embedding Coverage */}
          <div className="p-4 rounded-lg bg-surface border border-default">
            <div className="flex items-center gap-2 text-muted text-sm mb-2">
              <Sparkles className="w-4 h-4" />
              Embedding Coverage
            </div>
            <div className="text-2xl font-semibold text-primary">{stats?.embeddings.percentage ?? 0}%</div>
            <div className="mt-2 h-2 bg-hover rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-300"
                style={{ width: `${stats?.embeddings.percentage ?? 0}%` }}
              />
            </div>
            <div className="text-xs text-muted mt-1">
              {stats?.embeddings.withEmbedding ?? 0} / {stats?.embeddings.total ?? 0} with vectors
            </div>
          </div>

          {/* Total Accesses */}
          <div className="p-4 rounded-lg bg-surface border border-default">
            <div className="flex items-center gap-2 text-muted text-sm mb-2">
              <Eye className="w-4 h-4" />
              Total Accesses
            </div>
            <div className="text-2xl font-semibold text-primary">
              {stats?.stats.totalAccesses?.toLocaleString() ?? 0}
            </div>
            <div className="text-xs text-muted mt-4">Cumulative retrievals across all memories</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Type Distribution */}
        <div className="w-64 border-r border-subtle p-4 overflow-y-auto">
          <h3 className="text-sm font-medium text-primary mb-3">By Type</h3>
          <div className="space-y-2">
            {/* All types button */}
            <button
              onClick={() => setSelectedType(null)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors ${
                selectedType === null
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                  : 'bg-surface hover:bg-hover text-secondary border border-transparent'
              }`}
            >
              <span className="text-sm">All Types</span>
              <span className="text-xs font-mono">{stats?.stats.total ?? 0}</span>
            </button>

            {/* Type buttons */}
            {Object.entries(TYPE_COLORS).map(([type, colors]) => {
              const count = stats?.stats.byType[type] ?? 0;

              return (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors ${
                    selectedType === type
                      ? `${colors.bg} ${colors.text} border border-current/50`
                      : 'bg-surface hover:bg-hover text-secondary border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${colors.bg} ${colors.text}`} />
                    <span className="text-sm">{colors.label}</span>
                  </div>
                  <span className="text-xs font-mono">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Type distribution bars */}
          <div className="mt-6">
            <h4 className="text-xs font-medium text-muted mb-2">Distribution</h4>
            <div className="h-4 rounded-full overflow-hidden flex bg-hover">
              {Object.entries(TYPE_COLORS).map(([type, colors]) => {
                const count = stats?.stats.byType[type] ?? 0;
                const percentage = stats?.stats.total ? (count / stats.stats.total) * 100 : 0;
                if (percentage === 0) return null;

                return (
                  <div
                    key={type}
                    className={`${colors.bg} ${colors.text} transition-all duration-300`}
                    style={{ width: `${percentage}%` }}
                    title={`${colors.label}: ${count} (${percentage.toFixed(1)}%)`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Middle: Memory List */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-sm font-medium text-primary mb-3">
              {selectedType ? TYPE_COLORS[selectedType]?.label || selectedType : 'Recent'} Memories
              <span className="text-muted ml-2">({memories.length})</span>
            </h3>

            {memories.length === 0 ? (
              <div className="text-center py-12 text-muted">
                <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No memories yet</p>
                <p className="text-sm mt-1">Memories will appear here as agents learn</p>
              </div>
            ) : (
              <div className="space-y-2">
                {memories.map((memory) => {
                  const typeColors = TYPE_COLORS[memory.type] || {
                    bg: 'bg-gray-500/20',
                    text: 'text-gray-400',
                    label: memory.type,
                  };

                  return (
                    <button
                      key={memory.id}
                      onClick={() => setSelectedMemory(memory)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedMemory?.id === memory.id
                          ? 'bg-surface border-cyan-500/50'
                          : 'bg-surface border-default hover:border-[#3a3a3e]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${typeColors.bg} ${typeColors.text}`}>
                              {typeColors.label}
                            </span>
                            {memory.hasEmbedding && (
                              <span title="Has embedding"><Sparkles className="w-3 h-3 text-purple-400" /></span>
                            )}
                          </div>
                          <p className="text-sm text-primary line-clamp-2">{memory.content}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs text-muted">{formatDate(memory.createdAt)}</div>
                          <div className="text-xs text-secondary mt-1">imp: {memory.importance.toFixed(1)}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Detail Panel */}
        <div className="w-80 border-l border-subtle overflow-y-auto">
          {selectedMemory ? (
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-primary">Memory Details</h3>
                <button
                  onClick={() => setSelectedMemory(null)}
                  className="p-1 rounded hover:bg-hover text-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Type badge */}
              <div className="mb-4">
                {(() => {
                  const colors = TYPE_COLORS[selectedMemory.type] || {
                    bg: 'bg-gray-500/20',
                    text: 'text-gray-400',
                    label: selectedMemory.type,
                  };
                  return (
                    <span className={`px-2 py-1 text-xs font-medium rounded ${colors.bg} ${colors.text}`}>
                      {colors.label}
                    </span>
                  );
                })()}
                {selectedMemory.hasEmbedding && (
                  <span className="ml-2 px-2 py-1 text-xs font-medium rounded bg-purple-500/20 text-purple-400">
                    Has Embedding
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="mb-4">
                <h4 className="text-xs font-medium text-muted mb-2">Content</h4>
                <div className="p-3 rounded-lg bg-hover text-sm text-primary whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {selectedMemory.content}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <h4 className="text-xs font-medium text-muted mb-1">Importance</h4>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-hover rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          selectedMemory.importance > 0.6
                            ? 'bg-green-500'
                            : selectedMemory.importance > 0.3
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${selectedMemory.importance * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono text-secondary">{selectedMemory.importance.toFixed(2)}</span>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-medium text-muted mb-1">Access Count</h4>
                  <p className="text-sm text-primary">{selectedMemory.accessCount}</p>
                </div>
              </div>

              {/* Timestamps */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-xs">
                  <Clock className="w-3.5 h-3.5 text-muted" />
                  <span className="text-muted">Created:</span>
                  <span className="text-secondary">{new Date(selectedMemory.createdAt).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <RefreshCw className="w-3.5 h-3.5 text-muted" />
                  <span className="text-muted">Last accessed:</span>
                  <span className="text-secondary">{new Date(selectedMemory.lastAccessed).toLocaleString()}</span>
                </div>
              </div>

              {/* Metadata */}
              {selectedMemory.metadata && Object.keys(selectedMemory.metadata).length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted mb-2">Metadata</h4>
                  <pre className="p-3 rounded-lg bg-hover text-xs text-secondary overflow-x-auto">
                    {JSON.stringify(selectedMemory.metadata, null, 2)}
                  </pre>
                </div>
              )}

              {/* ID */}
              <div className="mt-4 pt-4 border-t border-subtle">
                <span className="text-[10px] font-mono text-muted">{selectedMemory.id}</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted">
              <Eye className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">Select a memory to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
