'use client';

import { useEffect, useState } from 'react';

export interface SystemAlertItem {
  id: string;
  type: 'lease' | 'conflict' | 'complete' | 'new-agent' | 'task' | 'error' | 'info' | 'success';
  message: string;
  agentId?: string;
}

const typeStyles: Record<string, string> = {
  conflict: 'bg-[#ff6467]/20 text-[#ff6467] border border-[#ff6467]/30',
  error: 'bg-[#ff6467]/20 text-[#ff6467] border border-[#ff6467]/30',
  lease: 'bg-[#eab308]/20 text-[#eab308] border border-[#eab308]/30',
  complete: 'bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/30',
  success: 'bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/30',
  'new-agent': 'bg-[rgb(79,255,238)]/20 text-[rgb(79,255,238)] border border-[rgb(79,255,238)]/30',
  task: 'bg-[#26b5ce]/20 text-[#26b5ce] border border-[#26b5ce]/30',
  info: 'bg-[#26b5ce]/20 text-[#26b5ce] border border-[#26b5ce]/30',
};

interface SystemAlertsProps {
  alerts: SystemAlertItem[];
  maxVisible?: number;
}

export function SystemAlerts({ alerts, maxVisible = 1 }: SystemAlertsProps) {
  const visibleAlerts = alerts.slice(0, maxVisible);

  return (
    <div className="h-8 overflow-hidden relative">
      {visibleAlerts.map((alert, idx) => (
        <div
          key={`${alert.id}-${idx}`}
          className={`
            absolute inset-x-0 flex items-center gap-3 px-4 py-1.5 text-xs
            border border-[#26262a] bg-[#16161a] rounded-lg
            transition-all duration-500 ease-out
            ${idx === 0 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full'}
          `}
        >
          <span
            className={`
              px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded
              ${typeStyles[alert.type] || typeStyles.task}
            `}
          >
            {alert.type}
          </span>
          <span className="text-[#8b8b8e] flex-1 truncate">{alert.message}</span>
          {alert.agentId && (
            <span className="text-[#8b8b8e]/50 text-[10px]">{alert.agentId}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// Hook to manage rotating alerts
export function useRotatingAlerts(initialAlerts: SystemAlertItem[], intervalMs = 4000) {
  const [alerts, setAlerts] = useState<SystemAlertItem[]>([]);
  const indexRef = { current: 0 };

  useEffect(() => {
    if (initialAlerts.length === 0) return;

    const interval = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % initialAlerts.length;
      setAlerts((curr) => {
        const newAlerts = [initialAlerts[indexRef.current], ...curr].slice(0, 3);
        return newAlerts;
      });
    }, intervalMs);

    // Initialize with first alert
    setAlerts([initialAlerts[0]]);

    return () => clearInterval(interval);
  }, [initialAlerts, intervalMs]);

  return alerts;
}
