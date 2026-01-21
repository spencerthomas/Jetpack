import React from 'react';

interface StatusBadgeProps {
  status: 'up' | 'down';
  label?: string;
  size?: 'small' | 'medium' | 'large';
  showPulse?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  size = 'medium',
  showPulse = false,
}) => {
  const isUp = status === 'up';

  const sizeClasses = {
    small: 'w-2 h-2',
    medium: 'w-3 h-3',
    large: 'w-4 h-4',
  }[size];

  const badgeSizeClasses = {
    small: 'text-xs px-2 py-1',
    medium: 'text-sm px-2.5 py-1.5',
    large: 'text-base px-3 py-2',
  }[size];

  const bgColor = isUp ? 'bg-green-100' : 'bg-red-100';
  const textColor = isUp ? 'text-green-800' : 'text-red-800';
  const dotColor = isUp ? 'bg-green-500' : 'bg-red-500';

  return (
    <div className={`inline-flex items-center gap-2 rounded-full ${bgColor} ${badgeSizeClasses}`}>
      <div className="relative">
        <div className={`${sizeClasses} ${dotColor} rounded-full`} />
        {showPulse && isUp && (
          <div
            className={`absolute inset-0 ${dotColor} rounded-full animate-pulse`}
            style={{ opacity: 0.3 }}
          />
        )}
      </div>
      <span className={`font-medium ${textColor}`}>
        {label || (isUp ? 'Up' : 'Down')}
      </span>
    </div>
  );
};

export default StatusBadge;
