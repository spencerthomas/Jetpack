'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { KeyboardShortcut } from '../ui/Kbd';

interface SidebarItemProps {
  href: string;
  icon: ReactNode;
  label: string;
  shortcut?: string[];
  badge?: number;
  collapsed?: boolean;
}

export function SidebarItem({
  href,
  icon,
  label,
  shortcut,
  badge,
  collapsed = false,
}: SidebarItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`
        group relative flex items-center gap-3 px-3 py-2 rounded-md
        transition-colors duration-150
        ${isActive
          ? 'bg-accent-purple/10 text-accent-purple'
          : 'text-secondary hover:bg-hover hover:text-primary'
        }
        ${collapsed ? 'justify-center' : ''}
      `.trim()}
      title={collapsed ? label : undefined}
    >
      {/* Icon */}
      <span className={`flex-shrink-0 w-5 h-5 ${isActive ? 'text-accent-purple' : ''}`}>
        {icon}
      </span>

      {/* Label */}
      {!collapsed && (
        <span className="flex-1 text-sm font-medium truncate">{label}</span>
      )}

      {/* Badge */}
      {badge !== undefined && badge > 0 && !collapsed && (
        <span className="flex-shrink-0 min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center text-2xs font-medium bg-accent-purple text-white rounded-full">
          {badge > 99 ? '99+' : badge}
        </span>
      )}

      {/* Keyboard shortcut (shown on hover when not collapsed) */}
      {shortcut && !collapsed && (
        <span className="hidden group-hover:flex items-center gap-0.5 opacity-50">
          <KeyboardShortcut keys={shortcut} />
        </span>
      )}

      {/* Active indicator */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-accent-purple rounded-r" />
      )}
    </Link>
  );
}
