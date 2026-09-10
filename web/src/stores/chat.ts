import { create } from "zustand";
import { apiFetch } from "../lib/api";

export interface ToolCallFn {
  id: string;
  type?: string;
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  internal?: boolean;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallFn[];
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

type HistoryRow = {
  role: string;
  content: string;
  internal?: boolean;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallFn[];
};

function mapHistoryMessages(sessionId: string, rows: HistoryRow[]): ChatMessage[] {
  return (rows ?? []).map((m, i) => {
    const role: ChatMessage["role"] =
      m.role === "user"
        ? "user"
        : m.role === "system"
          ? "system"
          : m.role === "tool"
            ? "tool"
            : "assistant";
    return {
      id: `${sessionId}-${i}`,
      role,
      content: m.content ?? "",
      internal: m.internal,
      name: m.name,
      tool_call_id: m.tool_call_id,
      tool_calls: m.tool_calls,
    };
  });
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
  activeTool: string | null;
  pendingEventId: string | null;
  repos: GitRepo[];
  branches: GitBranch[];
  loadingBranches: boolean;
  planMode: boolean;
  goalMode: boolean;
  planTask: string;
  setProject: (project: string) => void;
  setEnv: (env: string) => void;
  setBranch: (branch: string) => void;
  setModel: (model: string) => void;
  setEffort: (effort: number) => void;
  setPerm: (perm: "ask" | "agent" | "full") => void;
  setDraft: (draft: string) => void;
  setPlanMode: (on: boolean, task?: string) => void;
  setGoalMode: (on: boolean) => void;
  clearPlanMode: () => void;
  clearChat: () => void;
  sendMessage: (text?: string) => void;
  loadSessionHistory: (sessionId: string) => Promise<void>;
  loadRepos: () => Promise<void>;
  loadBranches: (repoPath: string) => Promise<void>;
  _pollForResponse: (sessionId: string, eventId: string, priorAssistantCount?: number) => void;
  _softReloadHistory: (sessionId: string) => Promise<void>;
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
  activeTool: null,
  pendingEventId: null,
  repos: [],
  branches: [],
  loadingBranches: false,
  planMode: false,
  goalMode: false,
  planTask: "",

  setProject: (project) => set({ project }),
  setEnv: (env) => set({ env }),
  setBranch: (branch) => set({ branch }),
  setModel: (model) => set({ model }),
  setEffort: (effort) => set({ effort }),
  setPerm: (perm) => set({ perm }),
  setDraft: (draft) => set({ draft }),
  setPlanMode: (on, task) =>
    set({
      planMode: on,
      planTask: on ? (task ?? "探索并比较架构方案") : "",
      goalMode: on ? false : get().goalMode,
    }),
  setGoalMode: (on) =>
    set({
      goalMode: on,
      planMode: on ? false : get().planMode,
      planTask: on ? "" : get().planTask,
    }),
  clearPlanMode: () => set({ planMode: false, planTask: "", goalMode: false }),

  clearChat: () =>
    set({
      messages: [],
      sessionId: null,
      chatting: false,
      typing: false,
      activeTool: null,
      draft: "",
      historyError: null,
      pendingEventId: null,
    }),

  loadRepos: async () => {
    try {
      const result = await apiFetch<{ repos: GitRepo[] }>("/git/repos");
      set({ repos: result.repos });
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
    if (!content || get().typing) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content,
    };

    const sessionId = get().sessionId ?? `cli:web-${Date.now()}`;
    const priorAssistantCount = get().messages.filter(
      (m) => m.role === "assistant" && !m.internal,
    ).length;

    set((s) => ({
      messages: [...s.messages, userMsg],
      draft: "",
      chatting: true,
      typing: true,
      activeTool: null,
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
      get()._pollForResponse(resolvedSessionId, result.event_id, priorAssistantCount);
    } catch (e: unknown) {
      set((s) => ({
        chatting: s.messages.some((m) => m.id !== userMsg.id),
        typing: false,
        activeTool: null,
        historyError: e instanceof Error ? e.message : String(e),
      }));
    }
  },

  _softReloadHistory: async (sessionId) => {
    try {
      const result = await apiFetch<{ messages: HistoryRow[] }>(
        `/sessions/${encodeURIComponent(sessionId)}/history?limit=100&offset=0`,
      );
      if (get().sessionId !== sessionId) return;
      set({
        messages: mapHistoryMessages(sessionId, result.messages ?? []),
        chatting: true,
      });
    } catch {
      // keep typing; next poll may succeed
    }
  },

  _pollForResponse: (sessionId, eventId, priorAssistantCount = 0) => {
    let attempts = 0;
    const maxAttempts = 240;
    const pollInterval = 2000;
    const terminal = new Set(["completed", "incomplete", "failed", "interrupted"]);

    const finish = async () => {
      set({ typing: false, activeTool: null });
      await get().loadSessionHistory(sessionId);
    };

    const poll = async () => {
      if (get().sessionId !== sessionId || get().pendingEventId !== eventId) {
        return;
      }
      if (attempts >= maxAttempts) {
        await finish();
        return;
      }
      attempts++;

      try {
        if (eventId) {
          const turnResult = await apiFetch<{
            turn: { status: string; current_tool?: string; response_text?: string };
          }>(`/turns/${encodeURIComponent(eventId)}`);
          const turn = turnResult.turn;
          if (terminal.has(turn?.status)) {
            await finish();
            return;
          }
          set({ activeTool: turn?.current_tool || null });
          // Stream tool traces into the thread while the turn is still running.
          if (attempts % 2 === 0) {
            await get()._softReloadHistory(sessionId);
          }
        } else {
          const result = await apiFetch<{ messages: HistoryRow[] }>(
            `/sessions/${encodeURIComponent(sessionId)}/history?limit=100&offset=0`,
          );
          const messages = mapHistoryMessages(sessionId, result.messages ?? []);
          const assistantCount = messages.filter(
            (m) => m.role === "assistant" && !m.internal,
          ).length;
          set({ messages, chatting: true });
          if (assistantCount > priorAssistantCount) {
            await finish();
            return;
          }
        }
      } catch {
        // Transient errors / turn not yet indexed — keep polling.
      }

      setTimeout(poll, pollInterval);
    };

    setTimeout(poll, pollInterval);
  },

  loadSessionHistory: async (sessionId) => {
    set({ loadingHistory: true, historyError: null, sessionId, chatting: true });
    try {
      const result = await apiFetch<{ messages: HistoryRow[] }>(
        `/sessions/${encodeURIComponent(sessionId)}/history?limit=100&offset=0`,
      );
      const messages = mapHistoryMessages(sessionId, result.messages ?? []);
      set({
        messages,
        loadingHistory: false,
        chatting: messages.length > 0,
        typing: false,
        activeTool: null,
      });
    } catch (e: unknown) {
      set({
        messages: [],
        loadingHistory: false,
        historyError: e instanceof Error ? e.message : String(e),
        typing: false,
        activeTool: null,
      });
    }
  },
}));
