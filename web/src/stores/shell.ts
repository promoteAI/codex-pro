import { create } from "zustand";

export type ToolPane = "hub" | "review" | "terminal" | "browser" | "files" | "sidechat";
export type LayoutMode = "side" | "bottom" | "full";
export type SettingsSection =
  | "general"
  | "models"
  | "import"
  | "appearance"
  | "voice"
  | "agent"
  | "personalization"
  | "shortcuts"
  | "account"
  | "computer"
  | "plugins"
  | "browser"
  | "hooks"
  | "connections"
  | "git"
  | "environment"
  | "worktrees"
  | "archived"
  | "config"
  | "overview"
  | "memory"
  | "channels"
  | "kanban"
  | "logs"
  | "analytics"
  | "knowledge"
  | "sessions";

export interface SessionTab {
  id: string;
  type: Exclude<ToolPane, "hub">;
  label: string;
  filePath?: { repoPath: string; filePath: string };
}

interface ShellState {
  toolsOpen: boolean;
  termOpen: boolean;
  settingsOpen: boolean;
  searchOpen: boolean;
  mobileRemoteOpen: boolean;
  remoteConnectOpen: boolean;
  botsOpen: boolean;
  botsPreferredChannel: string | null;
  layoutMode: LayoutMode;
  activeToolPane: ToolPane;
  sessionTabs: SessionTab[];
  activeTabId: string | null;
  settingsSection: SettingsSection;
  openTools: () => void;
  closeTools: () => void;
  toggleTools: () => void;
  openTerm: () => void;
  closeTerm: () => void;
  toggleTerm: () => void;
  openSettings: (section?: SettingsSection) => void;
  closeSettings: () => void;
  setSettingsSection: (section: SettingsSection) => void;
  openSearch: () => void;
  closeSearch: () => void;
  openMobileRemote: () => void;
  closeMobileRemote: () => void;
  openRemoteConnect: () => void;
  closeRemoteConnect: () => void;
  openBots: (channel?: string) => void;
  closeBots: () => void;
  setLayoutMode: (mode: LayoutMode) => void;
  showHub: () => void;
  openTool: (type: Exclude<ToolPane, "hub">, opts?: { filePath?: { repoPath: string; filePath: string }; label?: string }) => void;
  activateTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeRightTabs: (id: string) => void;
  closeTab: (id: string) => void;
}

const TOOL_LABELS: Record<Exclude<ToolPane, "hub">, string> = {
  review: "审查",
  terminal: "终端",
  browser: "浏览器",
  files: "文件",
  sidechat: "侧边聊天",
};

export const useShellStore = create<ShellState>((set, get) => ({
  toolsOpen: false,
  termOpen: false,
  settingsOpen: false,
  searchOpen: false,
  mobileRemoteOpen: false,
  remoteConnectOpen: false,
  botsOpen: false,
  botsPreferredChannel: null,
  layoutMode: "side",
  activeToolPane: "hub",
  sessionTabs: [],
  activeTabId: null,
  settingsSection: "plugins",

  openTools: () => set({ toolsOpen: true, layoutMode: get().layoutMode === "bottom" ? "side" : get().layoutMode }),
  closeTools: () => set({ toolsOpen: false, activeToolPane: "hub" }),
  toggleTools: () => {
    const { toolsOpen } = get();
    if (toolsOpen) get().closeTools();
    else get().openTools();
  },

  openTerm: () => set({ termOpen: true }),
  closeTerm: () => set({ termOpen: false }),
  toggleTerm: () => set((s) => ({ termOpen: !s.termOpen })),

  openSettings: (section) =>
    set({
      settingsOpen: true,
      ...(section ? { settingsSection: section } : {}),
    }),
  closeSettings: () => set({ settingsOpen: false }),
  setSettingsSection: (section) => set({ settingsSection: section }),

  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),

  openMobileRemote: () => set({ mobileRemoteOpen: true }),
  closeMobileRemote: () => set({ mobileRemoteOpen: false }),
  openRemoteConnect: () => set({ remoteConnectOpen: true }),
  closeRemoteConnect: () => set({ remoteConnectOpen: false }),
  openBots: (channel) =>
    set({
      botsOpen: true,
      botsPreferredChannel: channel ?? null,
      mobileRemoteOpen: false,
    }),
  closeBots: () => set({ botsOpen: false, botsPreferredChannel: null }),

  setLayoutMode: (mode) => {
    if (mode === "bottom") {
      set({ layoutMode: "bottom", termOpen: true, toolsOpen: false });
    } else if (mode === "side") {
      set({ layoutMode: "side", toolsOpen: true });
    } else {
      set({ layoutMode: "full", toolsOpen: true });
    }
  },

  showHub: () => set({ activeToolPane: "hub", activeTabId: null, toolsOpen: true }),

  openTool: (type, opts) => {
    if (type === "terminal") {
      set({ termOpen: true, toolsOpen: get().toolsOpen });
      return;
    }
    const { sessionTabs } = get();
    if (type === "files" && !opts?.filePath) {
      // No file specified — reuse or create an empty files tab
      const existing = sessionTabs.find((t) => t.type === type);
      if (existing) {
        set({ toolsOpen: true, activeToolPane: type, activeTabId: existing.id });
        return;
      }
      const id = `${type}-${Date.now()}`;
      set({
        toolsOpen: true,
        activeToolPane: type,
        activeTabId: id,
        sessionTabs: [...sessionTabs, { id, type, label: TOOL_LABELS[type] }],
        layoutMode: get().layoutMode === "bottom" ? "side" : get().layoutMode,
      });
      return;
    }
    if (opts?.filePath) {
      // Reuse existing tab if it has the same file (same repo + path)
      const match = sessionTabs.find(
        (t) => t.type === type && t.filePath?.repoPath === opts.filePath!.repoPath && t.filePath?.filePath === opts.filePath!.filePath,
      );
      if (match) {
        set({
          toolsOpen: true,
          activeToolPane: type,
          activeTabId: match.id,
          layoutMode: get().layoutMode === "bottom" ? "side" : get().layoutMode,
        });
        return;
      }
      // Open as a new tab alongside any existing file tabs
      const id = `${type}-${Date.now()}`;
      set({
        toolsOpen: true,
        activeToolPane: type,
        activeTabId: id,
        sessionTabs: [
          ...sessionTabs,
          { id, type, label: opts.label ?? opts.filePath!.filePath.split("/").pop() ?? TOOL_LABELS[type], filePath: opts.filePath },
        ],
        layoutMode: get().layoutMode === "bottom" ? "side" : get().layoutMode,
      });
      return;
    }
    // Non-files pane: original reuse logic
    const existing = sessionTabs.find((t) => t.type === type);
    if (existing) {
      set({
        toolsOpen: true,
        activeToolPane: type,
        activeTabId: existing.id,
        layoutMode: get().layoutMode === "bottom" ? "side" : get().layoutMode,
      });
      return;
    }
    const id = `${type}-${Date.now()}`;
    set({
      toolsOpen: true,
      activeToolPane: type,
      activeTabId: id,
      sessionTabs: [...sessionTabs, { id, type, label: TOOL_LABELS[type] }],
      layoutMode: get().layoutMode === "bottom" ? "side" : get().layoutMode,
    });
  },

  activateTab: (id) => {
    const tab = get().sessionTabs.find((t) => t.id === id);
    if (!tab) return;
    set({ activeTabId: id, activeToolPane: tab.type, toolsOpen: true });
  },

  closeOtherTabs: (id) => {
    const { sessionTabs, activeTabId } = get();
    const next = sessionTabs.filter((t) => t.id === id);
    set({
      sessionTabs: next,
      activeTabId: activeTabId === id ? id : null,
      activeToolPane: next.length ? next[0].type : "hub",
    });
  },

  closeRightTabs: (id) => {
    const { sessionTabs, activeTabId } = get();
    const idx = sessionTabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const next = sessionTabs.filter((_, i) => i <= idx);
    if (activeTabId && !next.some((t) => t.id === activeTabId)) {
      const last = next[next.length - 1];
      set({ sessionTabs: next, activeTabId: last.id, activeToolPane: last.type });
    } else {
      set({ sessionTabs: next });
    }
  },

  closeTab: (id) => {
    const { sessionTabs, activeTabId } = get();
    const next = sessionTabs.filter((t) => t.id !== id);
    if (activeTabId === id) {
      const last = next[next.length - 1];
      set({
        sessionTabs: next,
        activeTabId: last?.id ?? null,
        activeToolPane: last?.type ?? "hub",
      });
    } else {
      set({ sessionTabs: next });
    }
  },
}));
