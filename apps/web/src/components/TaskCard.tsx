'use client';

import { Task } from '@jetpack/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, Tag, User, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { useRef } from 'react';

interface TaskCardProps {
  task: Task;
  isDragging?: boolean;
  onClick?: (task: Task) => void;
}

const priorityColors = {
  low: 'border-l-muted',
  medium: 'border-l-accent-blue',
  high: 'border-l-accent-orange',
  critical: 'border-l-accent-red',
};

const priorityBadgeColors = {
  low: 'bg-hover text-secondary',
  medium: 'bg-accent-blue/20 text-accent-blue',
  high: 'bg-accent-orange/20 text-accent-orange',
  critical: 'bg-accent-red/20 text-accent-red',
};

export default function TaskCard({ task, isDragging, onClick }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const createdAt = typeof task.createdAt === 'string' ? new Date(task.createdAt) : task.createdAt;

  // Track mouse position to distinguish clicks from drags
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
    // Call original listener if exists
    listeners?.onMouseDown?.(e as any);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (mouseDownPos.current && onClick) {
      const dx = Math.abs(e.clientX - mouseDownPos.current.x);
      const dy = Math.abs(e.clientY - mouseDownPos.current.y);
      // If mouse moved less than 5px, treat as click
      if (dx < 5 && dy < 5) {
        onClick(task);
      }
    }
    mouseDownPos.current = null;
  };

  // Merge our handlers with dnd-kit listeners
  const mergedListeners = {
    ...listeners,
    onMouseDown: handleMouseDown,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...mergedListeners}
      onMouseUp={handleMouseUp}
      className={clsx(
        'bg-surface rounded-lg p-4 border border-subtle border-l-4 cursor-pointer',
        'hover:border-default transition-colors',
        priorityColors[task.priority],
        (isDragging || isSortableDragging) && 'opacity-50'
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-medium text-primary flex-1 pr-2">{task.title}</h4>
        <span className="text-2xs font-mono text-muted">{task.id}</span>
      </div>

      {task.description && (
        <p className="text-sm text-secondary mb-3 line-clamp-2">{task.description}</p>
      )}

      <div className="space-y-2">
        {task.assignedAgent && (
          <div className="flex items-center text-xs text-secondary">
            <User className="w-3 h-3 mr-1.5 text-muted" />
            <span>{task.assignedAgent}</span>
          </div>
        )}

        {task.estimatedMinutes && (
          <div className="flex items-center text-xs text-secondary">
            <Clock className="w-3 h-3 mr-1.5 text-muted" />
            <span>{task.estimatedMinutes}m estimated</span>
          </div>
        )}

        {task.requiredSkills.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Tag className="w-3 h-3 text-muted" />
            {task.requiredSkills.map(skill => (
              <span
                key={skill}
                className="text-2xs bg-hover text-secondary px-1.5 py-0.5 rounded"
              >
                {skill}
              </span>
            ))}
          </div>
        )}

        {task.dependencies.length > 0 && (
          <div className="flex items-center text-xs text-accent-orange">
            <AlertCircle className="w-3 h-3 mr-1.5" />
            <span>{task.dependencies.length} dependencies</span>
          </div>
        )}

        {task.blockers.length > 0 && (
          <div className="flex items-center text-xs text-accent-red">
            <AlertCircle className="w-3 h-3 mr-1.5" />
            <span>{task.blockers.length} blockers</span>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-subtle flex items-center justify-between text-xs">
        <span className={clsx(
          'px-2 py-0.5 rounded font-medium',
          priorityBadgeColors[task.priority]
        )}>
          {task.priority}
        </span>
        <span className="text-muted">{formatDistanceToNow(createdAt, { addSuffix: true })}</span>
      </div>
    </div>
  );
}
