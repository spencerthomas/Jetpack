'use client';

import { HTMLAttributes } from 'react';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info' | 'secondary' | 'outline';
type BadgeSize = 'sm' | 'md';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-[#2a2a30] text-[#8b8b8e] border-transparent',
  primary: 'bg-[rgb(79,255,238)]/20 text-[rgb(79,255,238)] border-transparent',
  success: 'bg-[#22c55e]/20 text-[#22c55e] border-transparent',
  warning: 'bg-[#eab308]/20 text-[#eab308] border-transparent',
  error: 'bg-[#ff6467]/20 text-[#ff6467] border-transparent',
  info: 'bg-[#26b5ce]/20 text-[#26b5ce] border-transparent',
  secondary: 'bg-[#1f1f24] text-[#f7f8f8] border-transparent',
  outline: 'bg-transparent text-[#f7f8f8] border-[#26262a]',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-[#8b8b8e]',
  primary: 'bg-[rgb(79,255,238)]',
  success: 'bg-[#22c55e]',
  warning: 'bg-[#eab308]',
  error: 'bg-[#ff6467]',
  info: 'bg-[#26b5ce]',
  secondary: 'bg-[#f7f8f8]',
  outline: 'bg-[#f7f8f8]',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'text-[10px] px-1.5 py-0.5',
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
        inline-flex items-center gap-1.5 font-medium rounded-md border
        transition-colors duration-150
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
