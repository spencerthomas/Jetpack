'use client';

import { FolderKanban, Plus, ArrowRight } from 'lucide-react';
import { Button, Badge } from '@/components/ui';

// Placeholder projects data
const placeholderProjects = [
  {
    id: '1',
    name: 'User Authentication',
    description: 'Implement complete user authentication system with login, registration, and password reset',
    status: 'active' as const,
    taskCount: 5,
    completedCount: 3,
  },
  {
    id: '2',
    name: 'API Refactoring',
    description: 'Refactor REST API to follow OpenAPI 3.0 specification',
    status: 'planning' as const,
    taskCount: 8,
    completedCount: 0,
  },
];

const statusVariants = {
  planning: 'info',
  active: 'warning',
  completed: 'success',
  archived: 'default',
} as const;

export default function ProjectsPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="h-14 flex items-center justify-between px-6 border-b border-subtle shrink-0">
        <h1 className="text-lg font-semibold text-primary">Projects</h1>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
        >
          New Project
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {placeholderProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FolderKanban className="w-16 h-16 text-muted mb-4" />
            <p className="text-secondary font-medium">No projects yet</p>
            <p className="text-sm text-muted mt-1">
              Create a project to organize your tasks
            </p>
            <Button
              variant="primary"
              size="sm"
              className="mt-4"
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Create Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {placeholderProjects.map((project) => (
              <div
                key={project.id}
                className="group p-5 rounded-lg bg-surface border border-subtle hover:border-default transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-accent-blue/20 text-accent-blue flex items-center justify-center">
                    <FolderKanban className="w-5 h-5" />
                  </div>
                  <Badge variant={statusVariants[project.status]} size="sm">
                    {project.status}
                  </Badge>
                </div>

                <h3 className="font-medium text-primary mb-1 group-hover:text-accent-blue transition-colors">
                  {project.name}
                </h3>
                <p className="text-sm text-muted line-clamp-2 mb-4">
                  {project.description}
                </p>

                {/* Progress */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted">Progress</span>
                    <span className="text-secondary">
                      {project.completedCount}/{project.taskCount} tasks
                    </span>
                  </div>
                  <div className="h-1.5 bg-hover rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent-green rounded-full transition-all"
                      style={{
                        width: `${project.taskCount > 0 ? (project.completedCount / project.taskCount) * 100 : 0}%`
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">
                    {project.taskCount} tasks
                  </span>
                  <ArrowRight className="w-4 h-4 text-muted group-hover:text-accent-blue group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
