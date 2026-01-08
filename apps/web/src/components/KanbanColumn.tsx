'use client';

import { Task, TaskStatus } from '@jetpack/shared';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import TaskCard from './TaskCard';
import clsx from 'clsx';

interface KanbanColumnProps {
  status: TaskStatus;
  title: string;
  color: string;
  tasks: Task[];
}

export default function KanbanColumn({ status, title, color, tasks }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  return (
    <div className="flex-shrink-0 w-80">
      <div className={clsx('rounded-lg p-4 mb-2', color)}>
        <h3 className="font-semibold text-gray-800 flex items-center justify-between">
          <span>{title}</span>
          <span className="text-sm bg-white px-2 py-1 rounded-full">{tasks.length}</span>
        </h3>
      </div>

      <div
        ref={setNodeRef}
        className={clsx(
          'min-h-[calc(100vh-200px)] rounded-lg p-2 transition-colors',
          isOver ? 'bg-blue-100' : 'bg-gray-100'
        )}
      >
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {tasks.map(task => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </SortableContext>

        {tasks.length === 0 && (
          <div className="text-center text-gray-400 py-8">
            <p>No tasks</p>
          </div>
        )}
      </div>
    </div>
  );
}
