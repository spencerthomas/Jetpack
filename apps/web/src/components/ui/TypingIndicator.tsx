'use client';

interface TypingIndicatorProps {
  label?: string;
}

export function TypingIndicator({ label = 'typing' }: TypingIndicatorProps) {
  return (
    <div className="flex items-center gap-2 text-xs text-[#8b8b8e]">
      <span className="flex gap-0.5">
        <span
          className="w-1 h-1 bg-[#8b8b8e] rounded-full animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="w-1 h-1 bg-[#8b8b8e] rounded-full animate-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="w-1 h-1 bg-[#8b8b8e] rounded-full animate-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </span>
      <span>{label}...</span>
    </div>
  );
}

// Blinking cursor for typewriter effects
export function BlinkingCursor({ className = '' }: { className?: string }) {
  return <span className={`animate-pulse text-[rgb(79,255,238)] ${className}`}>_</span>;
}

// Block cursor for terminal effects
export function BlockCursor({ className = '' }: { className?: string }) {
  return <span className={`animate-pulse text-[rgb(79,255,238)] ${className}`}>▊</span>;
}
