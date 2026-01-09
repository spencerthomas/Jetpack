import { create } from 'zustand';

interface UIState {
  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Command palette
  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;

  // Chat panel
  chatPanelOpen: boolean;
  openChatPanel: () => void;
  closeChatPanel: () => void;
  toggleChatPanel: () => void;

  // Active view for navigation
  activeView: 'inbox' | 'board' | 'projects' | 'agents' | 'settings';
  setActiveView: (view: UIState['activeView']) => void;

  // Unread counts
  unreadInboxCount: number;
  setUnreadInboxCount: (count: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Sidebar
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  // Command palette
  commandPaletteOpen: false,
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),

  // Chat panel
  chatPanelOpen: false,
  openChatPanel: () => set({ chatPanelOpen: true }),
  closeChatPanel: () => set({ chatPanelOpen: false }),
  toggleChatPanel: () => set((state) => ({ chatPanelOpen: !state.chatPanelOpen })),

  // Active view
  activeView: 'inbox',
  setActiveView: (view) => set({ activeView: view }),

  // Unread counts
  unreadInboxCount: 0,
  setUnreadInboxCount: (count) => set({ unreadInboxCount: count }),
}));
