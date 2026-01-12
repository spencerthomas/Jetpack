'use client';

import { useMemo } from 'react';
import { Clock, Lock, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  dependencies: string[];
  requiredSkills: string[];
}

interface QueueDisplayProps {
  tasks: Task[];
  className?: string;
  onTaskClick?: (taskId: string) => void;
}

interface QueueItem {
  task: Task;
  state: 'ready' | 'blocked';
  blockedBy: Task[];
}

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'text-[#ef4444]',
  high: 'text-[#f97316]',
  medium: 'text-[#3b82f6]',
  low: 'text-[#8b8b8e]',
};

export default function QueueDisplay({ tasks, className, onTaskClick }: QueueDisplayProps) {
  const queueItems = useMemo(() => {
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const items: QueueItem[] = [];

    // Find pending/ready tasks (not yet started)
    const pendingTasks = tasks.filter(t =>
      t.status === 'pending' || t.status === 'ready'
    );

    for (const task of pendingTasks) {
      // Check if all dependencies are completed
      const blockedBy: Task[] = [];
      for (const depId of task.dependencies) {
        const dep = taskMap.get(depId);
        if (dep && dep.status !== 'completed') {
          blockedBy.push(dep);
        }
      }

      items.push({
        task,
        state: blockedBy.length === 0 ? 'ready' : 'blocked',
        blockedBy,
      });
    }

    // Sort: ready first, then by priority
    items.sort((a, b) => {
      // Ready tasks come first
      if (a.state !== b.state) {
        return a.state === 'ready' ? -1 : 1;
      }
      // Then by priority
      return (PRIORITY_ORDER[a.task.priority] || 2) - (PRIORITY_ORDER[b.task.priority] || 2);
    });

    return items;
  }, [tasks]);

  const readyCount = queueItems.filter(i => i.state === 'ready').length;
  const blockedCount = queueItems.filter(i => i.state === 'blocked').length;

  if (queueItems.length === 0) {
    return null;
  }

  return (
    <div className={clsx('border-t border-[#26262a] bg-[#0d0d0f]', className)}>
      {/* Header */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-[#26262a]">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[rgb(79,255,238)]" />
          <span className="text-xs font-medium text-[#f7f8f8]">Next Up</span>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-[#22c55e]">{readyCount} ready</span>
          {blockedCount > 0 && (
            <span className="text-[#f97316]">{blockedCount} blocked</span>
          )}
        </div>
      </div>

      {/* Queue Items */}
      <div className="max-h-32 overflow-y-auto">
        {queueItems.slice(0, 5).map(item => (
          <div
            key={item.task.id}
            onClick={() => onTaskClick?.(item.task.id)}
            className={clsx(
              'flex items-center gap-3 px-4 py-2 hover:bg-[#16161a] transition-colors cursor-pointer group',
              item.state === 'blocked' && 'opacity-60'
            )}
          >
            {/* State indicator */}
            <div className="flex-shrink-0">
              {item.state === 'ready' ? (
                <div className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
              ) : (
                <Lock className="w-3 h-3 text-[#f97316]" />
              )}
            </div>

            {/* State label */}
            <span className={clsx(
              'text-[10px] font-medium uppercase w-14 flex-shrink-0',
              item.state === 'ready' ? 'text-[#22c55e]' : 'text-[#f97316]'
            )}>
              {item.state}
            </span>

            {/* Task title */}
            <span className="flex-1 text-xs text-[#f7f8f8] truncate">
              {item.task.title}
            </span>

            {/* Blocked by info */}
            {item.blockedBy.length > 0 && (
              <span className="text-[10px] text-[#8b8b8e] truncate max-w-[200px]">
                waiting: {item.blockedBy.map(t => t.title).join(', ')}
              </span>
            )}

            {/* Priority */}
            <span className={clsx(
              'text-[10px] font-medium uppercase flex-shrink-0',
              PRIORITY_COLORS[item.task.priority]
            )}>
              {item.task.priority}
            </span>

            {/* Arrow on hover */}
            <ChevronRight className="w-3 h-3 text-[#8b8b8e] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </div>
        ))}
      </div>

      {/* Show more indicator */}
      {queueItems.length > 5 && (
        <div className="px-4 py-1.5 text-center text-[10px] text-[#8b8b8e] border-t border-[#26262a]">
          +{queueItems.length - 5} more in queue
        </div>
      )}
    </div>
  );
}
