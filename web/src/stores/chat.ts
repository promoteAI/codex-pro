import { create } from "zustand";
import { apiFetch, apiUpload } from "../lib/api";
import { InteractiveChatWS, type ChatFrame } from "../lib/chat-ws";
import {
  parseCogFrame,
  applyThinkingFrame,
  CogDedup,
  type ThinkingBlocks,
} from "../lib/chat-ws-frame";
import { toast } from "./toast";
import { useAuthStore } from "./auth";
import i18n from "../i18n";

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
  /** A reasoning span from a reopened history session. When set, the row is
   *  rendered as a collapsed thinking block (not a chat bubble). */
  thinking?: { thinkingId: string; text: string; durationMs: number };
}

export interface GitRepo {
  path: string;
  name: string;
  current_branch: string;
  project_id?: string;
}

export interface GitBranch {
  name: string;
  is_current: boolean;
  is_remote: boolean;
}

/** A pending tool-approval (human-in-the-loop) surfaced by GET /interactions. */
export interface ApprovalTicket {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  risk?: string;
}

/** A pending clarify question surfaced by GET /interactions. */
export interface ClarifyTicket {
  id: string;
  question: string;
  options: string[];
}

export type HistoryRow = {
  role: string;
  content: string;
  internal?: boolean;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallFn[];
  thinking_id?: string;
  duration_ms?: number;
};

export function mapHistoryMessages(sessionId: string, rows: HistoryRow[]): ChatMessage[] {
  return (rows ?? []).map((m, i) => {
    // A persisted thinking row is a reasoning span, rendered as a collapsed
    // block rather than a chat bubble. Kept on a separate `thinking` field so
    // the closed role union (user/assistant/system/tool) is never stretched.
    if (m.role === "thinking") {
      return {
        id: `${sessionId}-${i}`,
        role: "assistant",
        content: m.content ?? "",
        internal: true,
        thinking: {
          thinkingId: m.thinking_id ?? `${sessionId}-${i}`,
          text: m.content ?? "",
          durationMs: m.duration_ms ?? 0,
        },
      };
    }
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

/** Drop live thinking blocks whose span has already been persisted into the
 *  loaded transcript as a ``thinking`` row.
 *
 *  Live thinking arrives as separate ``thinkingBlocks`` (rendered below the
 *  messages), but once a round settles it is persisted to the session and the
 *  next /history reload carries it as a ``thinking`` row interleaved with the
 *  tool call. Keeping both would render the same span twice. The reloaded row
 *  is authoritative (settled text + duration), so the live block is removed. */
export function pruneSettledThinking(
  messages: ChatMessage[],
  thinkingBlocks: ThinkingBlocks,
): ThinkingBlocks {
  const settled = new Set<string>();
  for (const m of messages) {
    if (m.thinking?.thinkingId) settled.add(m.thinking.thinkingId);
  }
  if (settled.size === 0) return thinkingBlocks;
  const next: ThinkingBlocks = {};
  for (const [id, block] of Object.entries(thinkingBlocks)) {
    if (!settled.has(id)) next[id] = block;
  }
  return next;
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
  workspaceKey: string;
  workspacePath: string;
  env: string;
  branch: string;
  model: string;
  reasoning: number;
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
  /** The single live in-progress assistant bubble from the interactive /ws,
   *  correlated by inbound event id. Null when no stream is mid-flight. */
  streaming: { eventId: string; text: string } | null;
  /** Live thinking/trace blocks keyed by thinking_id. */
  thinkingBlocks: ThinkingBlocks;
  /** The interactive /ws connection owned by this store. */
  chatWS: InteractiveChatWS;
  /** Dedup of seen cognitive cog_event_ids so a reconnect re-delivery does not
   *  double-render a thinking block or approval card. */
  _cogDedup: CogDedup;
  repos: GitRepo[];
  branches: GitBranch[];
  loadingBranches: boolean;
  planMode: boolean;
  goalMode: boolean;
  planTask: string;
  isGit: boolean;
  /** Pending tool approvals (decisions) fetched from /interactions. */
  pendingApprovals: ApprovalTicket[];
  /** The pending clarify question, if any, fetched from /interactions. */
  pendingClarify: ClarifyTicket | null;
  setProject: (project: string, projectPath?: string) => void;
  selectProject: (repo: GitRepo) => void;
  setWorkspace: (ws: { workspaceKey: string; workspacePath: string }) => void;
  createProject: (name: string, gitInit?: boolean) => Promise<GitRepo>;
  openProject: (path: string) => Promise<void>;
  setEnv: (env: string) => void;
  setBranch: (branch: string) => void;
  setModel: (model: string) => Promise<void>;
  setReasoning: (reasoning: number) => void;
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
  sendMessage: (text?: string, opts?: { force?: boolean }) => void;
  decideApproval: (id: string, level: "once" | "session" | "deny") => void;
  answerClarify: (value: string) => void;
  stopStream: () => void;
  loadSessionHistory: (sessionId: string) => Promise<void>;
  loadRepos: () => Promise<void>;
  loadBranches: (repoPath: string) => Promise<void>;
  createBranch: (branchName: string) => Promise<void>;
  _ensureChatWS: () => void;
  _handleWsFrame: (frame: ChatFrame) => void;
  _pollForResponse: (sessionId: string, eventId: string, priorAssistantCount?: number) => void;
  _refreshInteractions: (sessionId: string) => Promise<void>;
  _softReloadHistory: (sessionId: string) => Promise<void>;
  _wsReloadHistory: (sessionId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  project: "",
  projectPath: "",
  workspaceKey: "",
  workspacePath: "",
  env: "local",
  branch: "dev",
  // 旧值曾硬编码假模型 "agnes-2.5-flash"。改为空串作为中性默认，等待用户从
  // 模型选择器/提供商列表挑选后填充，避免把本机自定义模型名写死进产物。
  model: "",
  reasoning: 3,
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
  pendingApprovals: [],
  pendingClarify: null,
  streamStopped: false,
  streaming: null,
  thinkingBlocks: {},
  chatWS: new InteractiveChatWS(),
  _cogDedup: new CogDedup(),
  repos: [],
  branches: [],
  loadingBranches: false,
  planMode: false,
  goalMode: false,
  planTask: "",
  isGit: false,

  setProject: (project, projectPath) => set({ project, projectPath: projectPath ?? get().projectPath }),
  setWorkspace: (ws) => set({ workspaceKey: ws.workspaceKey, workspacePath: ws.workspacePath }),
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
  setReasoning: (reasoning) => set({ reasoning }),
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

  clearChat: () => {
    // Disconnect the interactive socket so a stale /ws socket does not keep
    // delivering frames for a session we have abandoned.
    get().chatWS.disconnect();
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
      pendingApprovals: [],
      pendingClarify: null,
      streaming: null,
      thinkingBlocks: {},
      _cogDedup: new CogDedup(),
      project: "",
      projectPath: "",
      isGit: false,
    });
  },

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

  decideApproval: (id, level) => {
    const cmd =
      level === "once" ? `/approve ${id}`
      : level === "session" ? `/approve ${id} session`
      : `/deny ${id}`;
    get().sendMessage(cmd, { force: true });
    // Optimistically clear this approval; next poll reconciles.
    set((s) => ({
      pendingApprovals: s.pendingApprovals.filter((a) => a.id !== id),
    }));
  },

  answerClarify: (value) => {
    const c = get().pendingClarify;
    if (!c) return;
    set({ pendingClarify: null });
    get().sendMessage(value, { force: true });
  },

  _refreshInteractions: async (sessionId: string) => {
    try {
      const data = await apiFetch<{
        approvals: ApprovalTicket[];
        clarify: ClarifyTicket | null;
      }>(`/interactions?session_key=${encodeURIComponent(sessionId)}`);
      if (get().sessionId !== sessionId) return;
      set({ pendingApprovals: data.approvals ?? [], pendingClarify: data.clarify ?? null });
    } catch {
      // transient — leave existing state; next poll retries
    }
  },

  sendMessage: async (text, opts) => {
    const content = (text ?? get().draft).trim();
    // 审批/澄清是控制命令：agent 正停在 wait_for_decision(typing=true)时，
    // 必须绕过 typing 门控才能把 /approve 等送出去，否则审批会超时。
    if (!content || (get().typing && !opts?.force)) return;

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

    // The interactive /ws only carries plain text (websocket.py:156 reads
    // `text`). Attachments must keep the HTTP POST + polling path, which also
    // serves as the fallback when the interactive socket cannot be reached.
    // On the WS path the server already knows our session_key from the auth
    // frame and replies with an `accepted` frame carrying event_id — no
    // per-message idempotency key needed. _ensureChatWS() opens the socket
    // (no-op if already open); send() buffers until auth_ok so the very first
    // message of a new session streams too.
    if (pendingAttachments.length === 0) {
      get()._ensureChatWS();
      const sent = get().chatWS.send({ type: "message", text: content });
      if (sent) return;
      // Socket could not be opened at all — fall through to HTTP.
    }

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
          language: i18n.resolvedLanguage,
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

  _ensureChatWS: () => {
    const s = get();
    const sessionId = s.sessionId;
    if (!sessionId) return;
    // Auth frame: platform="cli" (enables gateway:cli cognitive + optimistic
    // streaming), chat_id = session_key so the server registers this socket
    // under gateway:cli:<sessionKey> and outbound frames for this turn route
    // back to it. user_id is left empty — the browser passes the loopback/token
    // gate exactly as HTTP /message does today.
    s.chatWS.connect({
      platform: "cli",
      sessionKey: sessionId,
      token: useAuthStore.getState().token ?? "",
    });
  },

  _handleWsFrame: (frame) => {
    const mtype = frame.type;

    if (mtype === "accepted") {
      // Capture the accepted turn's event_id so a later interrupt can scope to
      // THIS turn (the gateway matches it against _inbound_event_id / target).
      if (frame.event_id) set({ pendingEventId: frame.event_id });
      return;
    }
    if (mtype === "error") {
      set((s) => ({
        typing: false,
        activeTool: null,
        pendingEventId: null,
        historyError: frame.error || "stream error",
        ...(s.streaming ? { streaming: null } : {}),
      }));
      const sid = get().sessionId;
      if (sid) void get()._refreshInteractions(sid);
      return;
    }
    if (mtype === "auth_ok" || mtype === "pong") return;

    // Cognitive frames (thinking / approvals / ...) — only produced for
    // gateway:cli, which is why we switched to platform="cli".
    const cog = parseCogFrame(frame);
    if (cog) {
      const dedup = get()._cogDedup;
      if (dedup.seenOnce(cog.cog_event_id)) return;
      const s = get();
      switch (cog.cog_type) {
        case "thinking": {
          set({ thinkingBlocks: applyThinkingFrame(s.thinkingBlocks, cog) });
          break;
        }
        case "approval_request":
        case "approval_closed":
        case "clarify_request":
        case "clarify_closed": {
          const sid = get().sessionId;
          if (sid) void get()._refreshInteractions(sid);
          break;
        }
        case "tool_call": {
          // Tool activity is NOT otherwise surfaced on the interactive /ws path
          // (sendMessage returns without the 1s /history polling the HTTP path
          // used to feed the tool rows). The turn_runs current_tool that drive
          // the "running" highlight arrives here per invocation: status="running"
          // before exec, a terminal status after. Set activeTool and refresh
          // history so the TaskActivityItem row appears live.
          const name = String(cog.data?.name ?? "");
          const status = String(cog.data?.status ?? "running");
          set((s) => ({
            activeTool:
              status === "running" ? name : s.activeTool === name ? null : s.activeTool,
          }));
          const sid = get().sessionId;
          if (sid) void get()._wsReloadHistory(sid);
          break;
        }
        default:
          // heartbeat / cost_update / memory_* — already handled elsewhere or
          // not rendered live on the WS path; skip to keep scope minimal.
          break;
      }
      return;
    }

    // Plain outbound text (streaming or final).
    const meta = frame.metadata ?? {};
    const inboundId = String(meta._inbound_event_id ?? frame.reply_to_id ?? "");
    // Control replies (approve/deny/clarify) are published as redundant text —
    // the interactive approval/clarify UI already rendered them as cognitive
    // frames. Avoid rendering them as assistant text or ending the turn.
    if (meta._approval_request) return;
    const isControlReply =
      typeof frame.text === "string" &&
      /^\/(approve|deny|clarify)\b/.test(frame.text.trim());
    if (isControlReply) return;

    if (meta._tool_delivery) return;

    const isStreaming = Boolean(meta._token_stream) && !frame.is_final;
    const isFinal = frame.is_final || frame.message_kind === "final";

    if (isStreaming) {
      // A optimistically-streamed draft turned out to be a pre-tool preamble
      // and was retracted server-side. Clear the accumulated text (keep the
      // bubble) so the next iteration's tokens don't splice onto the draft.
      if (meta._stream_reset) {
        set((s) => (s.streaming ? { streaming: { ...s.streaming, text: "" } } : {}));
        return;
      }
      const text = frame.text ?? "";
      set((s) => {
        if (s.streaming?.eventId === inboundId) {
          return { streaming: { ...s.streaming, text: s.streaming.text + text } };
        }
        return { streaming: { eventId: inboundId, text } };
      });
      return;
    }

    if (isFinal) {
      const text = frame.text ?? "";
      const done = get().streaming?.eventId === inboundId;
      // Commit the answer, then reload the persisted transcript. The session is
      // saved (with interleaved `thinking` rows per round) BEFORE the final
      // frame is published, so /history is the authoritative, correctly-ordered
      // view — folding live `thinkingBlocks` here would stack every span before
      // the answer instead of interleaving them with tool calls.
      set((s) => ({
        messages: [...s.messages, { id: `a-${Date.now()}`, role: "assistant", content: text }],
        streaming: done ? null : s.streaming,
        typing: false,
        activeTool: null,
        pendingEventId: null,
        thinkingBlocks: {},
      }));
      const sid = get().sessionId;
      if (sid) void get()._wsReloadHistory(sid);
      if (sid) void get()._refreshInteractions(sid);
    }
  },

  stopStream: () => {
    const { pendingEventId } = get();
    // Send the interrupt control frame over the interactive /ws. The server
    // already knows our session_key from the auth handshake, so only the exact
    // event_id is needed to stop THIS turn, not a later one on the session.
    const sent = get().chatWS.send({
      type: "interrupt",
      ...(pendingEventId ? { event_id: pendingEventId } : {}),
    });
    // Stop the spinner now, and drop pendingEventId so the in-flight poll
    // loop (HTTP fallback) exits on its next tick without calling
    // finish()/loadSessionHistory. That reload would overwrite the local
    // messages — including the tool cards already on screen — with a fresh,
    // possibly stale history fetch while the interrupt is still being
    // processed server-side. Freeze the current messages instead so they
    // don't get cleared.
    set({ typing: false, activeTool: null, pendingEventId: null, streamStopped: true });
    if (!sent) toast.error("停止失败：连接未就绪");
  },

  _softReloadHistory: async (sessionId) => {
    try {
      const result = await apiFetch<{ messages: HistoryRow[] }>(
        `/sessions/${encodeURIComponent(sessionId)}/history?limit=100&offset=0`,
      );
      if (get().sessionId !== sessionId) return;
      const messages = mapHistoryMessages(sessionId, result.messages ?? []);
      set({
        messages,
        chatting: true,
        // A span that settled (and is now interleaved in the reloaded
        // transcript) must not also render from the live thinkingBlocks.
        thinkingBlocks: pruneSettledThinking(messages, get().thinkingBlocks),
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
      const messages = mapHistoryMessages(sessionId, result.messages ?? []);
      set({
        messages,
        chatting: true,
        thinkingBlocks: pruneSettledThinking(messages, get().thinkingBlocks),
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
          void get()._refreshInteractions(sessionId);
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
      const result = await apiFetch<{
        messages: HistoryRow[];
        project?: string;
        workspace?: string;
      }>(`/sessions/${encodeURIComponent(sessionId)}/history?limit=100&offset=0`);
      const messages = mapHistoryMessages(sessionId, result.messages ?? []);
      // 会话工作区由后端持久化(参考 Codex 的 cwd 会话级模型):重开会话时回填
      // projectPath,使后续消息沿用原工作区,而不是依赖前端重新选择项目。
      // 但只对"真正归属某项目"的会话回填:无项目会话(project 为空)必须保持
      // projectPath="" —— 否则 sendMessage 会在下一条消息里把隔离工作目录当作
      // project 发回,后端 if project: 分支会把它误判成有项目会话,把 session.project
      // 打成该目录,使会话从侧边栏「最近」列表消失并污染 project 语义。
      const project = result.project ?? "";
      const workspace = result.workspace ?? "";
      set({
        messages,
        loadingHistory: false,
        chatting: messages.length > 0,
        typing: false,
        activeTool: null,
        streaming: null,
        thinkingBlocks: {},
        _cogDedup: new CogDedup(),
        ...(project ? { projectPath: workspace || project, project } : { projectPath: "", project: "" }),
      });
      // Open the interactive socket for this (re)opened session so the next
      // send streams and thinking frames flow. No-op if already connected.
      get()._ensureChatWS();
    } catch (e: unknown) {
      set({
        messages: [],
        loadingHistory: false,
        historyError: e instanceof Error ? e.message : String(e),
        typing: false,
        activeTool: null,
        streaming: null,
        thinkingBlocks: {},
      });
    }
  },
}));

// Route every frame on the interactive socket to the store's handler, with a
// stable reference so the store's own _handleWsFrame (which closes over get()/
// set()) is the only subscriber. Registered once for the singleton store.
useChatStore.getState().chatWS.onFrame((frame) =>
  useChatStore.getState()._handleWsFrame(frame),
);
