'use client';

import { HTMLAttributes } from 'react';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
type BadgeSize = 'sm' | 'md';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-hover text-secondary',
  primary: 'bg-accent-purple/20 text-accent-purple',
  success: 'bg-accent-green/20 text-accent-green',
  warning: 'bg-accent-yellow/20 text-accent-yellow',
  error: 'bg-accent-red/20 text-accent-red',
  info: 'bg-accent-blue/20 text-accent-blue',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-muted',
  primary: 'bg-accent-purple',
  success: 'bg-accent-green',
  warning: 'bg-accent-yellow',
  error: 'bg-accent-red',
  info: 'bg-accent-blue',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'text-2xs px-1.5 py-0.5',
  md: 'text-xs px-2 py-0.5',
};

export function Badge({
  variant = 'default',
  size = 'md',
  dot = false,
  children,
  className = '',
  ...props
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-full
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `.trim()}
      {...props}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />
      )}
      {children}
    </span>
  );
}

// Status badge specifically for task statuses
type TaskStatus = 'pending' | 'ready' | 'claimed' | 'in_progress' | 'blocked' | 'completed' | 'failed';

const statusVariants: Record<TaskStatus, BadgeVariant> = {
  pending: 'default',
  ready: 'info',
  claimed: 'primary',
  in_progress: 'warning',
  blocked: 'error',
  completed: 'success',
  failed: 'error',
};

const statusLabels: Record<TaskStatus, string> = {
  pending: 'Pending',
  ready: 'Ready',
  claimed: 'Claimed',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  completed: 'Completed',
  failed: 'Failed',
};

export function StatusBadge({ status, size = 'sm' }: { status: TaskStatus; size?: BadgeSize }) {
  return (
    <Badge variant={statusVariants[status]} size={size} dot>
      {statusLabels[status]}
    </Badge>
  );
}
