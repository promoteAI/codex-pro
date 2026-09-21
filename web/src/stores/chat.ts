import { create } from "zustand";
import { apiFetch, apiUpload } from "../lib/api";
import { webWS } from "../lib/ws";
import { toast } from "./toast";

/** A browser-selected file that has been uploaded to the gateway via
 *  POST /attachments and is staged to ride along on the next /message turn. */
export interface PendingAttachment {
  attachment_id: string;
  url: string;
  name: string;
  mime_type: string;
  size: number;
}

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

// Composer 的权限三档(ask/agent/full) ↔ 后端 permissions.approval.mode
// (manual/smart/off) 的双向映射。CLI 的 setup_permissions 写的是同一个 mode
// 字段,前端通过 /config PATCH 复用同一份 config。
export function permToMode(perm: "ask" | "agent" | "full"): "manual" | "smart" | "off" {
  switch (perm) {
    case "ask":
      return "manual";
    case "agent":
      return "smart";
    case "full":
      return "off";
  }
}

export function modeToPerm(mode: string | undefined): "ask" | "agent" | "full" {
  switch (mode) {
    case "manual":
      return "ask";
    case "smart":
      return "agent";
    case "off":
      return "full";
    default:
      return "full";
  }
}

interface ChatState {
  project: string;
  projectPath: string;
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
  /** Browser-uploaded files staged to attach to the next sent message. */
  pendingAttachments: PendingAttachment[];
  /** True once the user stopped the current stream, so neither the poll loop
   *  nor the WS session_message handler overwrites the local messages (the
   *  tool cards already on screen) with a fresh history fetch. Cleared on the
   *  next sendMessage. */
  streamStopped: boolean;
  repos: GitRepo[];
  branches: GitBranch[];
  loadingBranches: boolean;
  planMode: boolean;
  goalMode: boolean;
  planTask: string;
  isGit: boolean;
  setProject: (project: string, projectPath?: string) => void;
  selectProject: (repo: GitRepo) => void;
  createProject: (name: string, gitInit?: boolean) => Promise<GitRepo>;
  openProject: (path: string) => Promise<void>;
  setEnv: (env: string) => void;
  setBranch: (branch: string) => void;
  setModel: (model: string) => Promise<void>;
  setEffort: (effort: number) => void;
  setPerm: (perm: "ask" | "agent" | "full") => void;
  persistPerm: (perm: "ask" | "agent" | "full") => Promise<void>;
  loadPerm: () => Promise<void>;
  setDraft: (draft: string) => void;
  addFile: (file: File) => Promise<void>;
  removeAttachment: (attachmentId: string) => void;
  setPlanMode: (on: boolean, task?: string) => void;
  setGoalMode: (on: boolean) => void;
  clearPlanMode: () => void;
  clearChat: () => void;
  sendMessage: (text?: string) => void;
  stopStream: () => void;
  loadSessionHistory: (sessionId: string) => Promise<void>;
  loadRepos: () => Promise<void>;
  loadBranches: (repoPath: string) => Promise<void>;
  createBranch: (branchName: string) => Promise<void>;
  _pollForResponse: (sessionId: string, eventId: string, priorAssistantCount?: number) => void;
  _softReloadHistory: (sessionId: string) => Promise<void>;
  _wsReloadHistory: (sessionId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  project: "",
  projectPath: "",
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
  pendingAttachments: [],
  streamStopped: false,
  repos: [],
  branches: [],
  loadingBranches: false,
  planMode: false,
  goalMode: false,
  planTask: "",
  isGit: false,

  setProject: (project, projectPath) => set({ project, projectPath: projectPath ?? get().projectPath }),
  setModel: async (model: string) => {
    set({ model });
    try {
      await apiFetch("/config", {
        method: "PATCH",
        body: JSON.stringify({ changes: { "models.default_model": model } }),
      });
      toast.success(`已设为默认模型 ${model}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "设为默认模型失败");
    }
  },

  selectProject: (repo) => {
    const { clearChat } = get();
    clearChat();
    set({
      project: repo.name,
      projectPath: repo.path,
      branch: repo.current_branch || "main",
      isGit: repo.current_branch !== "",
    });
    get().loadBranches(repo.path);
  },

  createProject: async (name, gitInit = false) => {
    const result = await apiFetch<GitRepo>("/git/repos", {
      method: "POST",
      body: JSON.stringify({ name, git_init: gitInit }),
    });
    await get().loadRepos();
    get().selectProject(result);
    return result;
  },

  openProject: async (path) => {
    const result = await apiFetch<GitRepo>("/git/open", {
      method: "POST",
      body: JSON.stringify({ path }),
    });
    await get().loadRepos();
    get().selectProject(result);
  },
  setEnv: (env) => set({ env }),
  setBranch: (branch) => set({ branch }),
  setEffort: (effort) => set({ effort }),
  setPerm: (perm) => set({ perm }),
  persistPerm: async (perm) => {
    await apiFetch("/config", {
      method: "PATCH",
      body: JSON.stringify({
        changes: { "permissions.approval.mode": permToMode(perm) },
      }),
    });
    set({ perm });
  },
  loadPerm: async () => {
    const data = await apiFetch<{ permissions?: { approval?: { mode?: string } } }>("/config");
    set({ perm: modeToPerm(data.permissions?.approval?.mode) });
  },
  setDraft: (draft) => set({ draft }),
  addFile: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    try {
      const uploaded = await apiUpload<PendingAttachment>("/attachments", form);
      set((s) => ({ pendingAttachments: [...s.pendingAttachments, uploaded] }));
      toast.success(`已添加 ${uploaded.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "添加文件失败");
    }
  },
  removeAttachment: (attachmentId) =>
    set((s) => ({
      pendingAttachments: s.pendingAttachments.filter(
        (a) => a.attachment_id !== attachmentId,
      ),
    })),
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
      streamStopped: false,
      pendingAttachments: [],
      project: "",
      projectPath: "",
      isGit: false,
    }),

  loadRepos: async () => {
    try {
      const result = await apiFetch<{ repos: GitRepo[] }>("/git/repos");
      const repos = result.repos ?? [];
      set({ repos });
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

  createBranch: async (branchName) => {
    const repoPath = get().projectPath;
    if (!repoPath) return;
    try {
      await apiFetch("/git/branches", {
        method: "POST",
        body: JSON.stringify({ path: repoPath, name: branchName }),
      });
      await get().loadBranches(repoPath);
      get().setBranch(branchName);
      toast.success(`已创建并切换至分支 ${branchName}`);
    } catch {
      toast.error(`创建分支 ${branchName} 失败`);
    }
  },

  sendMessage: async (text) => {
    const content = (text ?? get().draft).trim();
    if (!content || get().typing) return;

    // Files staged to ride along on this turn. Cleared once the turn is
    // accepted so a retry/next message does not resend them.
    const pendingAttachments = get().pendingAttachments;

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
      streamStopped: false,
    }));

    try {
      const projectPath = get().projectPath;
      // Generate a per-message idempotency key so the backend sets a real
      // event_id on the turn ledger. Without it, mark_activity writes to
      // event_id="" (a phantom row), /turns/{eventId} never finds the turn,
      // and current_tool stays empty for the entire lifetime of the poll.
      const idempotencyKey = `${sessionId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const result = await apiFetch<{
        status: string;
        event_id: string;
        session_key: string;
      }>("/message", {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          text: content,
          session_key: sessionId,
          platform: "api",
          ...(projectPath ? { project: projectPath } : {}),
          ...(pendingAttachments.length
            ? { attachments: pendingAttachments.map((a) => ({ attachment_id: a.attachment_id })) }
            : {}),
        }),
      });

      const resolvedSessionId = result.session_key || sessionId;
      set({
        sessionId: resolvedSessionId,
        pendingEventId: result.event_id,
        pendingAttachments: [],
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

  stopStream: () => {
    const { sessionId, pendingEventId } = get();
    // Send the interrupt control frame the WS server converts into a
    // /__interrupt__ turn event. It needs both the session and the exact
    // event_id so it stops this turn, not a later one on the same session.
    const sent = webWS.send({
      type: "interrupt",
      ...(sessionId ? { session_key: sessionId } : {}),
      ...(pendingEventId ? { event_id: pendingEventId } : {}),
    });
    // Stop the spinner now, and drop pendingEventId so the in-flight poll
    // loop exits on its next tick without calling finish()/loadSessionHistory.
    // That reload would overwrite the local messages — including the tool
    // cards already on screen — with a fresh, possibly stale history fetch
    // while the interrupt is still being processed server-side. Freeze the
    // current messages instead so they don't get cleared.
    set({ typing: false, activeTool: null, pendingEventId: null, streamStopped: true });
    if (!sent) toast.error("停止失败：连接未就绪");
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

  _wsReloadHistory: async (sessionId) => {
    // Like _softReloadHistory but does NOT reset typing/activeTool — only
    // called from the WebSocket path where we know a turn is still running.
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
      // transient — next WS event or poll will retry
    }
  },

  _pollForResponse: (sessionId, eventId, priorAssistantCount = 0) => {
    let attempts = 0;
    const maxAttempts = 240;
    const pollInterval = 1000;
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
          await get()._softReloadHistory(sessionId);
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
