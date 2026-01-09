'use client';

interface LiveIndicatorProps {
  label?: string;
  variant?: 'success' | 'warning' | 'error' | 'default';
}

const variantStyles = {
  success: {
    ping: 'bg-green-400',
    dot: 'bg-green-500',
    text: 'text-green-500',
  },
  warning: {
    ping: 'bg-yellow-400',
    dot: 'bg-yellow-500',
    text: 'text-yellow-500',
  },
  error: {
    ping: 'bg-red-400',
    dot: 'bg-red-500',
    text: 'text-red-500',
  },
  default: {
    ping: 'bg-[rgb(79,255,238)]',
    dot: 'bg-[rgb(79,255,238)]',
    text: 'text-[rgb(79,255,238)]',
  },
};

export function LiveIndicator({ label = 'LIVE', variant = 'default' }: LiveIndicatorProps) {
  const styles = variantStyles[variant];

  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="relative flex h-2 w-2">
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full ${styles.ping} opacity-75`}
        />
        <span className={`relative inline-flex rounded-full h-2 w-2 ${styles.dot}`} />
      </span>
      <span className={styles.text}>{label}</span>
    </span>
  );
}
