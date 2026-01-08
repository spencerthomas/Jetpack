'use client';

import { Task, TaskStatus } from '@jetpack/shared';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import { useState } from 'react';
import KanbanColumn from './KanbanColumn';
import TaskCard from './TaskCard';

interface KanbanBoardProps {
  tasks: Task[];
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
}

const COLUMNS: { status: TaskStatus; title: string; color: string }[] = [
  { status: 'pending', title: 'Pending', color: 'bg-gray-200' },
  { status: 'ready', title: 'Ready', color: 'bg-blue-200' },
  { status: 'claimed', title: 'Claimed', color: 'bg-yellow-200' },
  { status: 'in_progress', title: 'In Progress', color: 'bg-purple-200' },
  { status: 'completed', title: 'Completed', color: 'bg-green-200' },
  { status: 'failed', title: 'Failed', color: 'bg-red-200' },
];

export default function KanbanBoard({ tasks, onUpdateTask }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find(t => t.id === event.active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const newStatus = over.id as TaskStatus;
      onUpdateTask(active.id as string, { status: newStatus });
    }

    setActiveTask(null);
  };

  const getTasksByStatus = (status: TaskStatus) => {
    return tasks.filter(task => task.status === status);
  };

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="h-full overflow-x-auto">
        <div className="flex gap-4 p-6 min-w-max">
          {COLUMNS.map(column => (
            <KanbanColumn
              key={column.status}
              status={column.status}
              title={column.title}
              color={column.color}
              tasks={getTasksByStatus(column.status)}
            />
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="rotate-3 opacity-80">
            <TaskCard task={activeTask} isDragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
