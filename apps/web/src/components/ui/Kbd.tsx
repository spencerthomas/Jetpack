'use client';

import { HTMLAttributes } from 'react';

interface KbdProps extends HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export function Kbd({ children, className = '', ...props }: KbdProps) {
  return (
    <kbd
      className={`
        inline-flex items-center justify-center min-w-[1.5rem] h-5
        px-1.5 text-2xs font-medium font-mono
        bg-hover border border-default rounded
        text-muted
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </kbd>
  );
}

// Helper to render keyboard shortcuts with proper symbols
export function KeyboardShortcut({ keys }: { keys: string[] }) {
  const keySymbols: Record<string, string> = {
    cmd: '\u2318',
    command: '\u2318',
    ctrl: '\u2303',
    control: '\u2303',
    alt: '\u2325',
    option: '\u2325',
    shift: '\u21E7',
    enter: '\u21B5',
    return: '\u21B5',
    escape: 'Esc',
    esc: 'Esc',
    tab: '\u21E5',
    backspace: '\u232B',
    delete: '\u2326',
    up: '\u2191',
    down: '\u2193',
    left: '\u2190',
    right: '\u2192',
  };

  return (
    <span className="inline-flex items-center gap-0.5">
      {keys.map((key, index) => (
        <Kbd key={index}>{keySymbols[key.toLowerCase()] || key.toUpperCase()}</Kbd>
      ))}
    </span>
  );
}
