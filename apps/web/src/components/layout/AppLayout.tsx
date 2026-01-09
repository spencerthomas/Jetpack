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
    <div className="flex h-screen bg-[#0d0d0f] relative">
      {/* Background glow effect */}
      <div className="absolute inset-0 bg-glow-top pointer-events-none" />

      {/* Grid background */}
      <div className="absolute inset-0 bg-grid pointer-events-none opacity-50" />

      {/* Left Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        {children}
      </main>

      {/* Chat Panel (placeholder for now) */}
      {chatPanelOpen && (
        <div className="w-80 border-l border-[#26262a] bg-[#16161a]/90 backdrop-blur-sm flex flex-col relative z-10">
          <div className="h-14 flex items-center justify-between px-4 border-b border-[#26262a]">
            <span className="font-medium text-[#f7f8f8]">Chat</span>
          </div>
          <div className="flex-1 p-4">
            <p className="text-sm text-[#8b8b8e]">Chat panel coming soon...</p>
          </div>
        </div>
      )}
    </div>
  );
}
