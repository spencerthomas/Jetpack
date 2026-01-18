'use client';

import { memo } from 'react';
import {
  Cpu,
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  MemoryStick,
  ArrowRight,
} from 'lucide-react';

export interface AgentStatusData {
  id: string;
  name: string;
  status: 'idle' | 'busy' | 'offline' | 'error';
  skills: string[];
  currentTask: string | null;
  tasksCompleted: number;
  lastHeartbeat: string;
  startedAt: string;
  memoryUsage?: number;
  taskProgress?: number;
  currentPhase?: string;
  healthStatus?: 'healthy' | 'warning' | 'critical';
  heartbeatAgeMs?: number;
}

interface AgentStatusCardProps {
  agent: AgentStatusData;
  isSelected?: boolean;
  onClick?: () => void;
  compact?: boolean;
}

const STATUS_CONFIG = {
  idle: {
    color: 'bg-[#8b8b8e]',
    label: 'Idle',
    textColor: 'text-[#8b8b8e]',
    bgColor: 'bg-[#8b8b8e]/10',
    borderColor: 'border-[#8b8b8e]/30',
  },
  busy: {
    color: 'bg-[rgb(79,255,238)]',
    label: 'Working',
    textColor: 'text-[rgb(79,255,238)]',
    bgColor: 'bg-[rgb(79,255,238)]/10',
    borderColor: 'border-[rgb(79,255,238)]/30',
  },
  offline: {
    color: 'bg-[#8b8b8e]/50',
    label: 'Offline',
    textColor: 'text-[#8b8b8e]/50',
    bgColor: 'bg-[#8b8b8e]/5',
    borderColor: 'border-[#8b8b8e]/20',
  },
  error: {
    color: 'bg-[#ff6467]',
    label: 'Error',
    textColor: 'text-[#ff6467]',
    bgColor: 'bg-[#ff6467]/10',
    borderColor: 'border-[#ff6467]/30',
  },
};

const HEALTH_CONFIG = {
  healthy: {
    color: 'bg-[#22c55e]',
    label: 'Healthy',
  },
  warning: {
    color: 'bg-[#eab308]',
    label: 'Warning',
  },
  critical: {
    color: 'bg-[#ff6467]',
    label: 'Critical',
  },
};

function formatDuration(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const diffMs = now - start;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ${diffHours % 24}h`;
}

function formatLastActivity(lastHeartbeat: string): string {
  const last = new Date(lastHeartbeat).getTime();
  const now = Date.now();
  const diffSec = Math.floor((now - last) / 1000);

  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMins = Math.floor(diffSec / 60);
  return `${diffMins}m ago`;
}

function AgentStatusCardComponent({
  agent,
  isSelected = false,
  onClick,
  compact = false,
}: AgentStatusCardProps) {
  const statusConfig = STATUS_CONFIG[agent.status];
  const healthConfig = agent.healthStatus ? HEALTH_CONFIG[agent.healthStatus] : null;

  if (compact) {
    return (
      <div
        onClick={onClick}
        className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
          isSelected
            ? 'border-[rgb(79,255,238)] bg-[rgb(79,255,238)]/5'
            : 'border-[#26262a] hover:border-[#3a3a3e]'
        }`}
      >
        {/* Status indicator */}
        <div className="relative">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${statusConfig.bgColor}`}
          >
            <Cpu className={`w-4 h-4 ${statusConfig.textColor}`} />
          </div>
          {agent.status === 'busy' && (
            <div
              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[rgb(79,255,238)]"
              style={{
                animation: 'pulse 1.5s ease-in-out infinite',
                boxShadow: '0 0 6px rgba(79, 255, 238, 0.5)',
              }}
            />
          )}
        </div>

        {/* Name and status */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#f7f8f8] truncate">{agent.name}</p>
          <p className={`text-xs ${statusConfig.textColor}`}>{statusConfig.label}</p>
        </div>

        {/* Task count */}
        <div className="flex items-center gap-1 text-xs text-[#8b8b8e]">
          <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />
          {agent.tasksCompleted}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border transition-all ${onClick ? 'cursor-pointer' : ''} ${
        isSelected
          ? 'border-[rgb(79,255,238)] bg-[rgb(79,255,238)]/5'
          : 'border-[#26262a] hover:border-[#3a3a3e]'
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b border-[#26262a]/50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Agent icon with status */}
            <div className="relative">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${statusConfig.bgColor} border ${statusConfig.borderColor}`}
              >
                <Cpu className={`w-5 h-5 ${statusConfig.textColor}`} />
              </div>
              {agent.status === 'busy' && (
                <div
                  className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[rgb(79,255,238)]"
                  style={{
                    animation: 'pulse 1.5s ease-in-out infinite',
                    boxShadow: '0 0 8px rgba(79, 255, 238, 0.6)',
                  }}
                />
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium text-[#f7f8f8]">{agent.name}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${statusConfig.bgColor} ${statusConfig.textColor}`}
                >
                  {statusConfig.label}
                </span>
                {healthConfig && (
                  <span className="flex items-center gap-1 text-xs text-[#8b8b8e]">
                    <div className={`w-1.5 h-1.5 rounded-full ${healthConfig.color}`} />
                    {healthConfig.label}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Activity indicator */}
          <div className="text-right">
            <Activity
              className={`w-4 h-4 ${
                agent.status === 'busy' ? 'text-[rgb(79,255,238)] animate-pulse' : 'text-[#8b8b8e]/50'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Current Task */}
      {agent.currentTask && (
        <div className="px-4 py-3 bg-[rgb(79,255,238)]/5 border-b border-[#26262a]/50">
          <div className="flex items-center gap-2 text-xs text-[#8b8b8e] mb-1">
            <ArrowRight className="w-3 h-3" />
            <span>Working on</span>
          </div>
          <p className="text-sm text-[#f7f8f8] font-mono truncate">{agent.currentTask}</p>
          {agent.currentPhase && (
            <p className="text-xs text-[rgb(79,255,238)] mt-1">{agent.currentPhase}</p>
          )}
          {typeof agent.taskProgress === 'number' && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-[#8b8b8e] mb-1">
                <span>Progress</span>
                <span>{agent.taskProgress}%</span>
              </div>
              <div className="h-1 rounded-full bg-[#26262a] overflow-hidden">
                <div
                  className="h-full bg-[rgb(79,255,238)] rounded-full transition-all duration-300"
                  style={{ width: `${agent.taskProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="p-4 grid grid-cols-2 gap-4">
        {/* Tasks completed */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#22c55e]/10 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-[#22c55e]" />
          </div>
          <div>
            <p className="text-sm font-medium text-[#f7f8f8]">{agent.tasksCompleted}</p>
            <p className="text-xs text-[#8b8b8e]">Completed</p>
          </div>
        </div>

        {/* Uptime */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#8b8b8e]/10 flex items-center justify-center">
            <Clock className="w-4 h-4 text-[#8b8b8e]" />
          </div>
          <div>
            <p className="text-sm font-medium text-[#f7f8f8]">{formatDuration(agent.startedAt)}</p>
            <p className="text-xs text-[#8b8b8e]">Uptime</p>
          </div>
        </div>

        {/* Memory usage */}
        {typeof agent.memoryUsage === 'number' && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#a855f7]/10 flex items-center justify-center">
              <MemoryStick className="w-4 h-4 text-[#a855f7]" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#f7f8f8]">{agent.memoryUsage}MB</p>
              <p className="text-xs text-[#8b8b8e]">Memory</p>
            </div>
          </div>
        )}

        {/* Last activity */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#8b8b8e]/10 flex items-center justify-center">
            <Zap className="w-4 h-4 text-[#8b8b8e]" />
          </div>
          <div>
            <p className="text-sm font-medium text-[#f7f8f8]">
              {formatLastActivity(agent.lastHeartbeat)}
            </p>
            <p className="text-xs text-[#8b8b8e]">Last activity</p>
          </div>
        </div>
      </div>

      {/* Skills */}
      <div className="px-4 pb-4">
        <div className="flex flex-wrap gap-1">
          {agent.skills.slice(0, 5).map((skill) => (
            <span
              key={skill}
              className="text-[10px] px-1.5 py-0.5 rounded bg-[#26262a]/50 text-[#8b8b8e]"
            >
              {skill}
            </span>
          ))}
          {agent.skills.length > 5 && (
            <span className="text-[10px] text-[#8b8b8e]">+{agent.skills.length - 5}</span>
          )}
        </div>
      </div>

      {/* Error state */}
      {agent.status === 'error' && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-[#ff6467]/10 border border-[#ff6467]/30">
            <AlertCircle className="w-4 h-4 text-[#ff6467]" />
            <span className="text-xs text-[#ff6467]">Agent encountered an error</span>
          </div>
        </div>
      )}
    </div>
  );
}

export const AgentStatusCard = memo(AgentStatusCardComponent);
export default AgentStatusCard;
