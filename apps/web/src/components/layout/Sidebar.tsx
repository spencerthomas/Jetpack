'use client';

import {
  Inbox,
  LayoutGrid,
  FolderKanban,
  Sparkles,
  Settings,
  ChevronLeft,
  ChevronRight,
  Search,
  GitBranch,
} from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { SidebarItem } from './SidebarItem';
import { KeyboardShortcut } from '../ui/Kbd';

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, unreadInboxCount, openCommandPalette } = useUIStore();

  return (
    <aside
      className={`
        flex flex-col h-screen bg-[#121214] border-r border-[#26262a]
        transition-all duration-200 ease-in-out
        ${sidebarCollapsed ? 'w-16' : 'w-60'}
      `.trim()}
    >
      {/* Logo / Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-[#26262a]">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[rgb(79,255,238)] flex items-center justify-center">
              <span className="text-black font-bold text-sm">J</span>
            </div>
            <span className="font-semibold text-[#f7f8f8]">Jetpack</span>
          </div>
        )}
        {sidebarCollapsed && (
          <div className="w-7 h-7 rounded-lg bg-[rgb(79,255,238)] flex items-center justify-center mx-auto">
            <span className="text-black font-bold text-sm">J</span>
          </div>
        )}
      </div>

      {/* Search / Command Palette Trigger */}
      <div className="px-3 py-3">
        <button
          onClick={openCommandPalette}
          className={`
            w-full flex items-center gap-2 px-3 py-2 rounded-md
            bg-[#1f1f24] border border-[#26262a]
            text-[#8b8b8e] text-sm
            hover:border-[#3a3a40] hover:text-[#f7f8f8]
            transition-colors duration-150
            ${sidebarCollapsed ? 'justify-center' : ''}
          `.trim()}
        >
          <Search className="w-4 h-4 flex-shrink-0" />
          {!sidebarCollapsed && (
            <>
              <span className="flex-1 text-left">Search...</span>
              <KeyboardShortcut keys={['cmd', 'K']} />
            </>
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        <SidebarItem
          href="/inbox"
          icon={<Inbox className="w-5 h-5" />}
          label="Inbox"
          shortcut={['g', 'i']}
          badge={unreadInboxCount}
          collapsed={sidebarCollapsed}
        />
        <SidebarItem
          href="/board"
          icon={<LayoutGrid className="w-5 h-5" />}
          label="Board"
          shortcut={['g', 'b']}
          collapsed={sidebarCollapsed}
        />
        <SidebarItem
          href="/plans"
          icon={<GitBranch className="w-5 h-5" />}
          label="Plans"
          shortcut={['g', 'l']}
          collapsed={sidebarCollapsed}
        />
        <SidebarItem
          href="/projects"
          icon={<FolderKanban className="w-5 h-5" />}
          label="Projects"
          shortcut={['g', 'p']}
          collapsed={sidebarCollapsed}
        />
        <SidebarItem
          href="/agents"
          icon={<Sparkles className="w-5 h-5" />}
          label="Agents"
          shortcut={['g', 'a']}
          collapsed={sidebarCollapsed}
        />
      </nav>

      {/* Bottom section */}
      <div className="px-3 py-3 border-t border-[#26262a] space-y-1">
        <SidebarItem
          href="/settings"
          icon={<Settings className="w-5 h-5" />}
          label="Settings"
          collapsed={sidebarCollapsed}
        />

        {/* Collapse toggle */}
        <button
          onClick={toggleSidebar}
          className={`
            w-full flex items-center gap-3 px-3 py-2 rounded-md
            text-[#8b8b8e] hover:bg-[#1f1f24] hover:text-[#f7f8f8]
            transition-colors duration-150
            ${sidebarCollapsed ? 'justify-center' : ''}
          `.trim()}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
          {!sidebarCollapsed && (
            <span className="text-sm">Collapse</span>
          )}
        </button>
      </div>
    </aside>
  );
}
