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
import {
  useChatStore,
  type ChatMessage,
  type HistoryRow,
  type ApprovalTicket,
  type ClarifyTicket,
  type PendingAttachment,
  mapHistoryMessages,
  pruneSettledThinking,
} from "./chat";

/**
 * Side chat — an independent, temporary conversation that plugs into the real
 * `/message` → `/turns` → `/sessions/{key}/history` pipeline without touching the
 * main chat's `useChatStore.messages`.
 *
 * The backend keys sessions purely on `session_key`, and `resolve_client_session_key`
 * accepts any `cli:`-prefixed key (codex_pro/gateway/ws_session.py), so the side
 * chat mints its own `cli:web-side-<ts>` key and is a fully separate `Session` on
 * the server — it never inherits the main thread's history and never pollutes it.
 * Reads `useChatStore.getState().projectPath` at send time so the side agent works
 * in the same workspace the user has selected.
 */
interface SidechatState {
  messages: ChatMessage[];
  sessionId: string | null;
  /** Input box draft, owned by the SidechatComposer (preserved across clear). */
  draft: string;
  chatting: boolean;
  loadingHistory: boolean;
  historyError: string | null;
  typing: boolean;
  activeTool: string | null;
  pendingEventId: string | null;
  pendingApprovals: ApprovalTicket[];
  pendingClarify: ClarifyTicket | null;
  /** Browser-uploaded files staged to attach to the next sidechat message. */
  pendingAttachments: PendingAttachment[];
  /** True once the user stopped the stream, so neither the poll loop nor the WS
   *  handler overwrites the bubbles already on screen with a fresh history fetch. */
  streamStopped: boolean;
  /** The single live in-progress assistant bubble from the interactive /ws. */
  streaming: { eventId: string; text: string } | null;
  /** Live thinking/trace blocks keyed by thinking_id. */
  thinkingBlocks: ThinkingBlocks;
  /** The interactive /ws connection owned by this store. */
  chatWS: InteractiveChatWS;
  /** Dedup of seen cognitive cog_event_ids. */
  _cogDedup: CogDedup;
  setDraft: (draft: string) => void;
  sendMessage: (text?: string, opts?: { force?: boolean }) => void;
  decideApproval: (id: string, level: "once" | "session" | "deny") => void;
  answerClarify: (value: string) => void;
  addFile: (file: File) => Promise<void>;
  clearAttachments: () => void;
  stopStream: () => void;
  clear: () => void;
  loadHistory: (sessionId: string) => Promise<void>;
  _ensureChatWS: () => void;
  _handleWsFrame: (frame: ChatFrame) => void;
  _pollForResponse: (sessionId: string, eventId: string, priorAssistantCount: number) => void;
  _softReloadHistory: (sessionId: string) => Promise<void>;
  _wsReloadHistory: (sessionId: string) => Promise<void>;
  _refreshInteractions: (sessionId: string) => Promise<void>;
}

export const useSidechatStore = create<SidechatState>((set, get) => ({
  messages: [],
  sessionId: null,
  draft: "",
  chatting: false,
  loadingHistory: false,
  historyError: null,
  typing: false,
  activeTool: null,
  pendingEventId: null,
  pendingApprovals: [],
  pendingClarify: null,
  pendingAttachments: [],
  streamStopped: false,
  streaming: null,
  thinkingBlocks: {},
  chatWS: new InteractiveChatWS(),
  _cogDedup: new CogDedup(),

  setDraft: (draft) => set({ draft }),

  sendMessage: (text, opts) => {
    const content = (text ?? get().draft).trim();
    // 审批/澄清是控制命令：agent 停在 wait_for_decision(typing=true) 时，必须
    // 绕过 typing 门控才能把 /approve 等送出去，否则审批会超时。
    if (!content || (get().typing && !opts?.force)) return;

    const sessionId = get().sessionId ?? `cli:web-side-${Date.now()}`;
    const priorAssistantCount = get().messages.filter(
      (m) => m.role === "assistant" && !m.internal,
    ).length;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content };
    set((s) => ({
      messages: [...s.messages, userMsg],
      draft: "",
      sessionId,
      chatting: true,
      typing: true,
      activeTool: null,
      pendingEventId: null,
      historyError: null,
      streamStopped: false,
      pendingApprovals: [],
      pendingClarify: null,
    }));

    const attachments = get().pendingAttachments;
    // Plain text goes over the interactive /ws (streams + thinking). Attachments
    // keep the HTTP POST path (the WS message frame only reads text). send()
    // buffers until auth_ok, so the first message of a new session streams too.
    if (attachments.length === 0) {
      get()._ensureChatWS();
      if (get().chatWS.send({ type: "message", text: content })) return;
    }

    void (async () => {
      try {
        const projectPath = useChatStore.getState().projectPath;
        const idempotencyKey = `${sessionId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const result = await apiFetch<{ status: string; event_id: string; session_key: string }>(
          "/message",
          {
            method: "POST",
            headers: { "Idempotency-Key": idempotencyKey },
            body: JSON.stringify({
              text: content,
              session_key: sessionId,
              platform: "api",
              ...(projectPath ? { project: projectPath } : {}),
              ...(attachments.length
                ? { attachments: attachments.map((a) => ({ attachment_id: a.attachment_id })) }
                : {}),
            }),
          },
        );
        const resolvedId = result.session_key || sessionId;
        set({ sessionId: resolvedId, pendingEventId: result.event_id, pendingAttachments: [] });
        get()._pollForResponse(resolvedId, result.event_id, priorAssistantCount);
      } catch (e: unknown) {
        set((s) => ({
          typing: s.messages.some((m) => m.id !== userMsg.id),
          activeTool: null,
          historyError: e instanceof Error ? e.message : String(e),
        }));
      }
    })();
  },

  _ensureChatWS: () => {
    const s = get();
    const sessionId = s.sessionId;
    if (!sessionId) return;
    s.chatWS.connect({
      platform: "cli",
      sessionKey: sessionId,
      token: useAuthStore.getState().token ?? "",
    });
  },

  _handleWsFrame: (frame) => {
    const mtype = frame.type;

    if (mtype === "accepted") {
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
          // The interactive /ws path never polls /history mid-turn, so the
          // tool "running" highlight + tool row must come from these frames
          // (status="running" before exec, a terminal status after).
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
          break;
      }
      return;
    }

    const meta = frame.metadata ?? {};
    const inboundId = String(meta._inbound_event_id ?? frame.reply_to_id ?? "");
    if (meta._approval_request) return;
    const isControlReply =
      typeof frame.text === "string" &&
      /^\/(approve|deny|clarify)\b/.test(frame.text.trim());
    if (isControlReply) return;
    if (meta._tool_delivery) return;

    const isStreaming = Boolean(meta._token_stream) && !frame.is_final;
    const isFinal = frame.is_final || frame.message_kind === "final";

    if (isStreaming) {
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

  decideApproval: (id, level) => {
    const cmd =
      level === "once" ? `/approve ${id}`
      : level === "session" ? `/approve ${id} session`
      : `/deny ${id}`;
    get().sendMessage(cmd, { force: true });
    set((s) => ({
      pendingApprovals: s.pendingApprovals.filter((a) => a.id !== id),
    }));
  },

  answerClarify: (value) => {
    set({ pendingClarify: null });
    get().sendMessage(value, { force: true });
  },

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

  clearAttachments: () => set({ pendingAttachments: [] }),

  stopStream: () => {
    const { pendingEventId } = get();
    // Interrupt goes over the interactive /ws; the server already knows our
    // session_key from the auth handshake, so only the exact event_id is needed.
    const sent = get().chatWS.send({
      type: "interrupt",
      ...(pendingEventId ? { event_id: pendingEventId } : {}),
    });
    set({ typing: false, activeTool: null, pendingEventId: null, streamStopped: true });
    if (!sent) toast.error("停止失败：连接未就绪");
  },

  clear: () => {
    get().chatWS.disconnect();
    set({
      messages: [],
      sessionId: null,
      chatting: false,
      typing: false,
      activeTool: null,
      pendingEventId: null,
      streamStopped: false,
      historyError: null,
      pendingApprovals: [],
      pendingClarify: null,
      pendingAttachments: [],
      streaming: null,
      thinkingBlocks: {},
      _cogDedup: new CogDedup(),
    });
  },

  loadHistory: async (sessionId) => {
    set({ loadingHistory: true, historyError: null, sessionId });
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
        streaming: null,
        thinkingBlocks: {},
        _cogDedup: new CogDedup(),
      });
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

  _softReloadHistory: async (sessionId) => {
    try {
      const result = await apiFetch<{ messages: HistoryRow[] }>(
        `/sessions/${encodeURIComponent(sessionId)}/history?limit=100&offset=0`,
      );
      if (get().sessionId !== sessionId) return;
      const messages = mapHistoryMessages(sessionId, result.messages ?? []);
      set({ messages, thinkingBlocks: pruneSettledThinking(messages, get().thinkingBlocks) });
    } catch {
      // transient — next poll may succeed
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
      set({ messages, thinkingBlocks: pruneSettledThinking(messages, get().thinkingBlocks) });
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
      await get().loadHistory(sessionId);
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
          set({ messages });
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

  _refreshInteractions: async (sessionId) => {
    try {
      const data = await apiFetch<{
        approvals: ApprovalTicket[];
        clarify: ClarifyTicket | null;
      }>(`/interactions?session_key=${encodeURIComponent(sessionId)}`);
      if (get().sessionId !== sessionId) return;
      set({
        pendingApprovals: data.approvals ?? [],
        pendingClarify: data.clarify ?? null,
      });
    } catch {
      // transient — leave existing state; next poll retries
    }
  },
}));

// Route every frame on the sidechat's interactive socket to its handler.
useSidechatStore.getState().chatWS.onFrame((frame) =>
  useSidechatStore.getState()._handleWsFrame(frame),
);
