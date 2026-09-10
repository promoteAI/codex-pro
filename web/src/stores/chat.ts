import { create } from "zustand";
import { apiFetch } from "../lib/api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  internal?: boolean;
  name?: string;
}

export interface GitRepo {
  path: string;
  name: string;
  current_branch: string;
}

export interface GitBranch {
  name: string;
  is_current: boolean;
  is_remote: boolean;
}

interface ChatState {
  project: string;
  env: string;
  branch: string;
  model: string;
  effort: number;
  perm: "ask" | "agent" | "full";
  draft: string;
  messages: ChatMessage[];
  sessionId: string | null;
  chatting: boolean;
  loadingHistory: boolean;
  historyError: string | null;
  typing: boolean;
  pendingEventId: string | null;
  repos: GitRepo[];
  branches: GitBranch[];
  loadingBranches: boolean;
  setProject: (project: string) => void;
  setEnv: (env: string) => void;
  setBranch: (branch: string) => void;
  setModel: (model: string) => void;
  setEffort: (effort: number) => void;
  setPerm: (perm: "ask" | "agent" | "full") => void;
  setDraft: (draft: string) => void;
  clearChat: () => void;
  sendMessage: (text?: string) => void;
  loadSessionHistory: (sessionId: string) => Promise<void>;
  loadRepos: () => Promise<void>;
  loadBranches: (repoPath: string) => Promise<void>;
  _pollForResponse: (sessionId: string, priorAssistantCount?: number) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  project: "codex-pro",
  env: "local",
  branch: "dev",
  model: "agnes-2.5-flash",
  effort: 3,
  perm: "full",
  draft: "",
  messages: [],
  sessionId: null,
  chatting: false,
  loadingHistory: false,
  historyError: null,
  typing: false,
  pendingEventId: null,
  repos: [],
  branches: [],
  loadingBranches: false,

  setProject: (project) => set({ project }),
  setEnv: (env) => set({ env }),
  setBranch: (branch) => set({ branch }),
  setModel: (model) => set({ model }),
  setEffort: (effort) => set({ effort }),
  setPerm: (perm) => set({ perm }),
  setDraft: (draft) => set({ draft }),

  clearChat: () =>
    set({
      messages: [],
      sessionId: null,
      chatting: false,
      typing: false,
      draft: "",
      historyError: null,
      pendingEventId: null,
    }),

  loadRepos: async () => {
    try {
      const result = await apiFetch<{ repos: GitRepo[] }>("/git/repos");
      set({ repos: result.repos });
      // Auto-select first repo's current branch
      if (result.repos.length > 0) {
        const first = result.repos[0];
        set({ project: first.name, branch: first.current_branch || "main" });
      }
    } catch {
      // Silently fail — non-critical for UI
    }
  },

  loadBranches: async (repoPath) => {
    set({ loadingBranches: true });
    try {
      const result = await apiFetch<{ branches: GitBranch[]; current_branch: string }>(
        `/git/branches?path=${encodeURIComponent(repoPath)}`,
      );
      set({ branches: result.branches, loadingBranches: false });
    } catch {
      set({ branches: [], loadingBranches: false });
    }
  },

  sendMessage: async (text) => {
    const content = (text ?? get().draft).trim();
    // `chatting` means "thread UI is open"; only block while a turn is in flight.
    if (!content || get().typing) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content,
    };

    // Loopback-only clients must present an explicit `cli:` session key — bare
    // `local-*` keys are rejected as forbidden session_key (403).
    const sessionId = get().sessionId ?? `cli:web-${Date.now()}`;
    const priorAssistantCount = get().messages.filter(
      (m) => m.role === "assistant" && !m.internal,
    ).length;

    set((s) => ({
      messages: [...s.messages, userMsg],
      draft: "",
      chatting: true,
      typing: true,
      sessionId,
      historyError: null,
      pendingEventId: null,
    }));

    try {
      const result = await apiFetch<{
        status: string;
        event_id: string;
        session_key: string;
      }>("/message", {
        method: "POST",
        body: JSON.stringify({
          text: content,
          session_key: sessionId,
          platform: "api",
        }),
      });

      const resolvedSessionId = result.session_key || sessionId;
      set({
        sessionId: resolvedSessionId,
        pendingEventId: result.event_id,
      });
      get()._pollForResponse(resolvedSessionId, priorAssistantCount);
    } catch (e: unknown) {
      set((s) => ({
        // Keep the thread open if we already had messages; only drop back to
        // the hero when this was the first failed send.
        chatting: s.messages.some((m) => m.id !== userMsg.id),
        typing: false,
        historyError: e instanceof Error ? e.message : String(e),
      }));
    }
  },

  _pollForResponse: (sessionId: string, priorAssistantCount = 0) => {
    let attempts = 0;
    const maxAttempts = 40;
    const pollInterval = 1500;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        set({ typing: false });
        return;
      }
      attempts++;

      try {
        const result = await apiFetch<{
          messages: Array<{ role: string; content: string; internal?: boolean; name?: string }>;
        }>(`/sessions/${encodeURIComponent(sessionId)}/history?limit=100&offset=0`);

        const assistantCount = result.messages.filter(
          (m) => m.role === "assistant" && !m.internal,
        ).length;

        if (assistantCount > priorAssistantCount) {
          set({ typing: false });
          await get().loadSessionHistory(sessionId);
          return;
        }

        setTimeout(poll, pollInterval);
      } catch {
        setTimeout(poll, pollInterval);
      }
    };

    setTimeout(poll, pollInterval);
  },

  loadSessionHistory: async (sessionId) => {
    set({ loadingHistory: true, historyError: null, sessionId, chatting: true });
    try {
      const result = await apiFetch<{
        messages: Array<{ role: string; content: string; internal?: boolean; name?: string }>;
      }>(`/sessions/${encodeURIComponent(sessionId)}/history?limit=100&offset=0`);
      const messages: ChatMessage[] = (result.messages ?? []).map((m, i) => ({
        id: `${sessionId}-${i}`,
        role: m.role === "user" ? "user" : m.role === "system" ? "system" : "assistant",
        content: m.content,
        internal: m.internal,
        name: m.name,
      }));
      set({ messages, loadingHistory: false, chatting: messages.length > 0, typing: false });
    } catch (e: unknown) {
      set({
        messages: [],
        loadingHistory: false,
        historyError: e instanceof Error ? e.message : String(e),
        typing: false,
      });
    }
  },
}));

