'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  Clock,
  User,
  Link as LinkIcon,
} from 'lucide-react';
import type { PlanItem as PlanItemType, PlanItemStatus } from '@jetpack/shared';

interface PlanItemProps {
  item: PlanItemType;
  depth?: number;
  selected: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  allItems: PlanItemType[];
}

const STATUS_CONFIG: Record<
  PlanItemStatus,
  { icon: React.ReactNode; color: string; label: string }
> = {
  pending: {
    icon: <Circle className="w-4 h-4" />,
    color: 'text-[#8b8b8e]',
    label: 'Pending',
  },
  converted: {
    icon: <Clock className="w-4 h-4" />,
    color: 'text-[rgb(79,255,238)]',
    label: 'Queued',
  },
  in_progress: {
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    color: 'text-[#f59e0b]',
    label: 'Running',
  },
  completed: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: 'text-[#22c55e]',
    label: 'Done',
  },
  failed: {
    icon: <AlertCircle className="w-4 h-4" />,
    color: 'text-[#ff6467]',
    label: 'Failed',
  },
  skipped: {
    icon: <Circle className="w-4 h-4" strokeDasharray="4 4" />,
    color: 'text-[#6b6b6e]',
    label: 'Skipped',
  },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-[#ff6467]/20 text-[#ff6467] border-[#ff6467]/30',
  high: 'bg-[#f59e0b]/20 text-[#f59e0b] border-[#f59e0b]/30',
  medium: 'bg-[#8b8b8e]/20 text-[#8b8b8e] border-[#8b8b8e]/30',
  low: 'bg-[#6b6b6e]/20 text-[#6b6b6e] border-[#6b6b6e]/30',
};

export function PlanItem({
  item,
  depth = 0,
  selected,
  onSelect,
  allItems,
}: PlanItemProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = item.children && item.children.length > 0;
  const status = STATUS_CONFIG[item.status];
  const isSelected = selected.has(item.id);
  const canSelect = item.status === 'pending';

  // Find dependency names
  const dependencyNames = item.dependencies
    .map((depId) => {
      const dep = allItems.find((i) => i.id === depId);
      return dep?.title || depId;
    })
    .slice(0, 2);

  const formatDuration = (minutes?: number) => {
    if (!minutes) return null;
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <div className="group">
      {/* Main row */}
      <div
        className={`flex items-center gap-2 py-2 px-3 rounded-lg transition-colors hover:bg-[#1f1f24]/50 ${
          depth > 0 ? 'ml-6' : ''
        }`}
      >
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`p-0.5 rounded hover:bg-[#26262a] ${
            hasChildren ? 'visible' : 'invisible'
          }`}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-[#8b8b8e]" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[#8b8b8e]" />
          )}
        </button>

        {/* Checkbox */}
        <label className="relative flex items-center">
          <input
            type="checkbox"
            checked={isSelected}
            disabled={!canSelect}
            onChange={(e) => onSelect(item.id, e.target.checked)}
            className="sr-only peer"
          />
          <div
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              canSelect
                ? isSelected
                  ? 'bg-[rgb(79,255,238)] border-[rgb(79,255,238)]'
                  : 'border-[#3f3f46] hover:border-[rgb(79,255,238)]/50'
                : 'border-[#26262a] bg-[#1a1a1e] cursor-not-allowed'
            }`}
          >
            {isSelected && (
              <CheckCircle2 className="w-3 h-3 text-black" strokeWidth={3} />
            )}
          </div>
        </label>

        {/* Status icon */}
        <div className={`${status.color}`}>{status.icon}</div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <span
            className={`text-sm ${
              item.status === 'completed'
                ? 'text-[#8b8b8e] line-through'
                : item.status === 'failed'
                ? 'text-[#ff6467]'
                : 'text-[#f7f8f8]'
            }`}
          >
            {item.title}
          </span>
        </div>

        {/* Metadata badges */}
        <div className="flex items-center gap-2">
          {/* Priority */}
          {item.priority && item.priority !== 'medium' && (
            <span
              className={`px-1.5 py-0.5 text-[10px] rounded border ${
                PRIORITY_COLORS[item.priority]
              }`}
            >
              {item.priority}
            </span>
          )}

          {/* Skills */}
          {item.skills.length > 0 && (
            <div className="hidden group-hover:flex items-center gap-1">
              {item.skills.slice(0, 2).map((skill) => (
                <span
                  key={skill}
                  className="px-1.5 py-0.5 text-[10px] rounded bg-[#26262a] text-[#8b8b8e]"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}

          {/* Estimate */}
          {item.estimatedMinutes && (
            <span className="text-xs text-[#8b8b8e]">
              {formatDuration(item.estimatedMinutes)}
            </span>
          )}

          {/* Agent badge */}
          {item.assignedAgent && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-[#f59e0b]/20 text-[#f59e0b]">
              <User className="w-3 h-3" />
              {item.assignedAgent}
            </span>
          )}

          {/* Task link */}
          {item.taskId && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-[rgb(79,255,238)]/10 text-[rgb(79,255,238)]">
              <LinkIcon className="w-3 h-3" />
              {item.taskId.slice(0, 8)}
            </span>
          )}
        </div>
      </div>

      {/* Dependencies (shown on hover or when blocked) */}
      {item.dependencies.length > 0 && (
        <div className="ml-16 mb-1 hidden group-hover:flex items-center gap-1 text-[10px] text-[#6b6b6e]">
          <span>Depends on:</span>
          {dependencyNames.map((name, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded bg-[#1a1a1e]">
              {name}
            </span>
          ))}
          {item.dependencies.length > 2 && (
            <span>+{item.dependencies.length - 2} more</span>
          )}
        </div>
      )}

      {/* Error message */}
      {item.error && (
        <div className="ml-16 mb-2 px-2 py-1 text-xs text-[#ff6467] bg-[#ff6467]/10 rounded">
          {item.error}
        </div>
      )}

      {/* Children */}
      {hasChildren && expanded && (
        <div className="border-l border-[#26262a] ml-5">
          {item.children!.map((child) => (
            <PlanItem
              key={child.id}
              item={child}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
              allItems={allItems}
            />
          ))}
        </div>
      )}
    </div>
  );
}
