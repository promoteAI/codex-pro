import { create } from "zustand";
import { apiFetch } from "../lib/api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  internal?: boolean;
  name?: string;
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
}

const MOCK_REPLIES = [
  "好的，我先梳理一下仓库结构，稍后再给出具体方案。",
  "收到。我会按你的目标拆分步骤，并在需要时请求确认。",
  "明白了。这是一个原型回复——真实 agent 流式协议尚未接入 Web。",
];

let replyIdx = 0;

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
      draft: "",
      historyError: null,
    }),

  sendMessage: (text) => {
    const content = (text ?? get().draft).trim();
    if (!content) return;
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content,
    };
    set((s) => ({
      messages: [...s.messages, userMsg],
      draft: "",
      chatting: true,
      sessionId: s.sessionId ?? `local-${Date.now()}`,
      historyError: null,
    }));
    const reply = MOCK_REPLIES[replyIdx++ % MOCK_REPLIES.length];
    window.setTimeout(() => {
      set((s) => ({
        messages: [
          ...s.messages,
          { id: `a-${Date.now()}`, role: "assistant", content: reply },
        ],
      }));
    }, 450);
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
      set({ messages, loadingHistory: false, chatting: messages.length > 0 });
    } catch (e: unknown) {
      set({
        messages: [],
        loadingHistory: false,
        historyError: e instanceof Error ? e.message : String(e),
      });
    }
  },
}));
