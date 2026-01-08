'use client';

import { Task } from '@jetpack/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, Tag, User, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

interface TaskCardProps {
  task: Task;
  isDragging?: boolean;
}

const priorityColors = {
  low: 'border-l-gray-400',
  medium: 'border-l-blue-500',
  high: 'border-l-orange-500',
  critical: 'border-l-red-600',
};

export default function TaskCard({ task, isDragging }: TaskCardProps) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={clsx(
        'bg-white rounded-lg p-4 shadow-sm border-l-4 cursor-move',
        'hover:shadow-md transition-shadow',
        priorityColors[task.priority],
        (isDragging || isSortableDragging) && 'opacity-50'
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-medium text-gray-900 flex-1 pr-2">{task.title}</h4>
        <span className="text-xs font-mono text-gray-500">{task.id}</span>
      </div>

      {task.description && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{task.description}</p>
      )}

      <div className="space-y-2">
        {task.assignedAgent && (
          <div className="flex items-center text-xs text-gray-600">
            <User className="w-3 h-3 mr-1" />
            <span>{task.assignedAgent}</span>
          </div>
        )}

        {task.estimatedMinutes && (
          <div className="flex items-center text-xs text-gray-600">
            <Clock className="w-3 h-3 mr-1" />
            <span>{task.estimatedMinutes}m estimated</span>
          </div>
        )}

        {task.requiredSkills.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <Tag className="w-3 h-3 text-gray-500" />
            {task.requiredSkills.map(skill => (
              <span
                key={skill}
                className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded"
              >
                {skill}
              </span>
            ))}
          </div>
        )}

        {task.dependencies.length > 0 && (
          <div className="flex items-center text-xs text-orange-600">
            <AlertCircle className="w-3 h-3 mr-1" />
            <span>{task.dependencies.length} dependencies</span>
          </div>
        )}

        {task.blockers.length > 0 && (
          <div className="flex items-center text-xs text-red-600">
            <AlertCircle className="w-3 h-3 mr-1" />
            <span>{task.blockers.length} blockers</span>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
        <span className={clsx(
          'px-2 py-1 rounded font-medium',
          task.priority === 'critical' && 'bg-red-100 text-red-700',
          task.priority === 'high' && 'bg-orange-100 text-orange-700',
          task.priority === 'medium' && 'bg-blue-100 text-blue-700',
          task.priority === 'low' && 'bg-gray-100 text-gray-700'
        )}>
          {task.priority}
        </span>
        <span>{formatDistanceToNow(createdAt, { addSuffix: true })}</span>
      </div>
    </div>
  );
}
