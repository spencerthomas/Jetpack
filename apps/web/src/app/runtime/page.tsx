'use client';

import { useState, useEffect } from 'react';
import {
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Gauge,
  RefreshCw,
  Play,
  Square,
} from 'lucide-react';
import clsx from 'clsx';

interface RuntimeStats {
  cycleCount: number;
  tasksCompleted: number;
  tasksFailed: number;
  totalTasks: number;
  successRate: string;
  startedAt: string;
  lastWorkAt: string | null;
  elapsedMs: number;
  elapsedFormatted: string;
  endState: string | null;
  isRunning: boolean;
}

interface QualitySummary {
  totalSnapshots: number;
  avgLintErrors: number;
  avgTypeErrors: number;
  avgCoverage: number;
  buildSuccessRate: number;
  totalTestFailures: number;
}

interface QualitySnapshot {
  id: string;
  taskId: string | null;
  timestamp: string;
  isBaseline: boolean;
  metrics: {
    lintErrors: number;
    lintWarnings: number;
    typeErrors: number;
    testsPassing: number;
    testsFailing: number;
    testCoverage: number;
    buildSuccess: boolean;
  };
}

export default function RuntimePage() {
  const [runtime, setRuntime] = useState<RuntimeStats | null>(null);
  const [quality, setQuality] = useState<{
    baseline: QualitySnapshot | null;
    recent: QualitySnapshot[];
    summary: QualitySummary | null;
  }>({ baseline: null, recent: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      setRefreshing(true);

      // Fetch runtime status
      const runtimeRes = await fetch('/api/runtime');
      const runtimeData = await runtimeRes.json();
      if (runtimeData.success) {
        setRuntime(runtimeData.runtime);
      }

      // Fetch quality metrics
      const qualityRes = await fetch('/api/quality');
      const qualityData = await qualityRes.json();
      if (qualityData.success) {
        setQuality({
          baseline: qualityData.baseline,
          recent: qualityData.recent || [],
          summary: qualityData.summary,
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh every 5 seconds
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0b] text-white flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-[rgb(79,255,238)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Runtime Monitor</h1>
            <p className="text-[#8b8b8e] text-sm">
              Real-time system status and quality metrics
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={refreshing}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg border border-[#26262a] text-sm',
              'hover:bg-[#1a1a1c] transition-colors',
              refreshing && 'opacity-50'
            )}
          >
            <RefreshCw className={clsx('w-4 h-4', refreshing && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {/* Runtime Status Card */}
        <div className="bg-[#111113] border border-[#26262a] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <Activity className="w-5 h-5 text-[rgb(79,255,238)]" />
            <h2 className="text-lg font-medium">Runtime Status</h2>
            {runtime?.isRunning ? (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-green-500/10 text-green-400 text-xs rounded-full">
                <Play className="w-3 h-3" /> Running
              </span>
            ) : runtime?.endState ? (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-[#8b8b8e]/10 text-[#8b8b8e] text-xs rounded-full">
                <Square className="w-3 h-3" /> {runtime.endState}
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-[#8b8b8e]/10 text-[#8b8b8e] text-xs rounded-full">
                Not Started
              </span>
            )}
          </div>

          {runtime ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                icon={<Gauge className="w-4 h-4" />}
                label="Cycles"
                value={runtime.cycleCount.toString()}
                color="cyan"
              />
              <StatCard
                icon={<CheckCircle className="w-4 h-4" />}
                label="Completed"
                value={runtime.tasksCompleted.toString()}
                subtext={`${runtime.successRate}% success`}
                color="green"
              />
              <StatCard
                icon={<XCircle className="w-4 h-4" />}
                label="Failed"
                value={runtime.tasksFailed.toString()}
                color="red"
              />
              <StatCard
                icon={<Clock className="w-4 h-4" />}
                label="Elapsed"
                value={runtime.elapsedFormatted}
                subtext={runtime.startedAt ? `Started ${new Date(runtime.startedAt).toLocaleTimeString()}` : ''}
                color="purple"
              />
            </div>
          ) : (
            <p className="text-[#8b8b8e] text-center py-8">
              No runtime data available. Start Jetpack to see stats.
            </p>
          )}
        </div>

        {/* Quality Metrics */}
        <div className="bg-[#111113] border border-[#26262a] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <AlertTriangle className="w-5 h-5 text-[rgb(79,255,238)]" />
            <h2 className="text-lg font-medium">Quality Metrics</h2>
          </div>

          {quality.summary ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard
                icon={<AlertTriangle className="w-4 h-4" />}
                label="Avg Lint Errors"
                value={quality.summary.avgLintErrors.toString()}
                color={quality.summary.avgLintErrors > 0 ? 'orange' : 'green'}
              />
              <StatCard
                icon={<XCircle className="w-4 h-4" />}
                label="Type Errors"
                value={quality.summary.avgTypeErrors.toString()}
                color={quality.summary.avgTypeErrors > 0 ? 'red' : 'green'}
              />
              <StatCard
                icon={<Gauge className="w-4 h-4" />}
                label="Avg Coverage"
                value={`${quality.summary.avgCoverage}%`}
                color={quality.summary.avgCoverage >= 70 ? 'green' : 'orange'}
              />
              <StatCard
                icon={<CheckCircle className="w-4 h-4" />}
                label="Build Success"
                value={`${quality.summary.buildSuccessRate}%`}
                color={quality.summary.buildSuccessRate >= 90 ? 'green' : 'orange'}
              />
            </div>
          ) : (
            <p className="text-[#8b8b8e] text-center py-4">
              No quality data available. Quality snapshots will appear here.
            </p>
          )}

          {/* Baseline */}
          {quality.baseline && (
            <div className="border-t border-[#26262a] pt-4 mt-4">
              <h3 className="text-sm font-medium text-[#8b8b8e] mb-3">Current Baseline</h3>
              <div className="bg-[#0a0a0b] rounded-lg p-4">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-[#8b8b8e]">ID:</span>
                  <span className="font-mono text-xs">{quality.baseline.id}</span>
                  <span className="text-[#8b8b8e] ml-4">Time:</span>
                  <span>{new Date(quality.baseline.timestamp).toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-5 gap-4 mt-3 text-sm">
                  <MetricBadge label="Lint" value={quality.baseline.metrics.lintErrors} />
                  <MetricBadge label="Types" value={quality.baseline.metrics.typeErrors} />
                  <MetricBadge label="Tests" value={`${quality.baseline.metrics.testsPassing}/${quality.baseline.metrics.testsPassing + quality.baseline.metrics.testsFailing}`} />
                  <MetricBadge label="Coverage" value={`${quality.baseline.metrics.testCoverage.toFixed(1)}%`} />
                  <MetricBadge label="Build" value={quality.baseline.metrics.buildSuccess ? 'Pass' : 'Fail'} variant={quality.baseline.metrics.buildSuccess ? 'success' : 'error'} />
                </div>
              </div>
            </div>
          )}

          {/* Recent Snapshots */}
          {quality.recent.length > 0 && (
            <div className="border-t border-[#26262a] pt-4 mt-4">
              <h3 className="text-sm font-medium text-[#8b8b8e] mb-3">Recent Snapshots</h3>
              <div className="space-y-2">
                {quality.recent.slice(0, 5).map((snapshot) => (
                  <div
                    key={snapshot.id}
                    className="flex items-center justify-between bg-[#0a0a0b] rounded-lg px-4 py-2 text-sm"
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-xs text-[#8b8b8e]">
                        {snapshot.id.slice(0, 12)}
                      </span>
                      {snapshot.isBaseline && (
                        <span className="px-1.5 py-0.5 bg-[rgb(79,255,238)]/10 text-[rgb(79,255,238)] text-xs rounded">
                          Baseline
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={clsx(
                        'text-xs',
                        snapshot.metrics.lintErrors > 0 ? 'text-orange-400' : 'text-[#8b8b8e]'
                      )}>
                        {snapshot.metrics.lintErrors} lint
                      </span>
                      <span className={clsx(
                        'text-xs',
                        snapshot.metrics.testsFailing > 0 ? 'text-red-400' : 'text-[#8b8b8e]'
                      )}>
                        {snapshot.metrics.testsFailing} failing
                      </span>
                      <span className="text-xs text-[#8b8b8e]">
                        {new Date(snapshot.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtext,
  color = 'cyan',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext?: string;
  color?: 'cyan' | 'green' | 'red' | 'orange' | 'purple';
}) {
  const colorClasses = {
    cyan: 'text-[rgb(79,255,238)]',
    green: 'text-green-400',
    red: 'text-red-400',
    orange: 'text-orange-400',
    purple: 'text-purple-400',
  };

  return (
    <div className="bg-[#0a0a0b] rounded-lg p-4">
      <div className="flex items-center gap-2 text-[#8b8b8e] mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className={clsx('text-2xl font-semibold', colorClasses[color])}>
        {value}
      </div>
      {subtext && (
        <div className="text-xs text-[#8b8b8e] mt-1">{subtext}</div>
      )}
    </div>
  );
}

function MetricBadge({
  label,
  value,
  variant = 'default',
}: {
  label: string;
  value: string | number;
  variant?: 'default' | 'success' | 'error';
}) {
  const variantClasses = {
    default: 'text-white',
    success: 'text-green-400',
    error: 'text-red-400',
  };

  return (
    <div className="text-center">
      <div className="text-xs text-[#8b8b8e] mb-1">{label}</div>
      <div className={clsx('font-medium', variantClasses[variant])}>{value}</div>
    </div>
  );
}
