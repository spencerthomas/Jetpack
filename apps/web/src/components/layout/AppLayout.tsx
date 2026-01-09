'use client';

import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { useUIStore } from '@/stores/uiStore';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { chatPanelOpen } = useUIStore();

  return (
    <div className="flex h-screen bg-base">
      {/* Left Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>

      {/* Chat Panel (placeholder for now) */}
      {chatPanelOpen && (
        <div className="w-80 border-l border-subtle bg-surface flex flex-col">
          <div className="h-14 flex items-center justify-between px-4 border-b border-subtle">
            <span className="font-medium text-primary">Chat</span>
          </div>
          <div className="flex-1 p-4">
            <p className="text-sm text-muted">Chat panel coming soon...</p>
          </div>
        </div>
      )}
    </div>
  );
}
