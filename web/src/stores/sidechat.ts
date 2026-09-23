import { create } from "zustand";
import { apiFetch, apiUpload } from "../lib/api";
import { webWS } from "../lib/ws";
import { toast } from "./toast";
import {
  useChatStore,
  type ChatMessage,
  type HistoryRow,
  type ApprovalTicket,
  type ClarifyTicket,
  type PendingAttachment,
  mapHistoryMessages,
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
  setDraft: (draft: string) => void;
  sendMessage: (text?: string, opts?: { force?: boolean }) => void;
  decideApproval: (id: string, level: "once" | "session" | "deny") => void;
  answerClarify: (value: string) => void;
  addFile: (file: File) => Promise<void>;
  clearAttachments: () => void;
  stopStream: () => void;
  clear: () => void;
  loadHistory: (sessionId: string) => Promise<void>;
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

    void (async () => {
      try {
        const projectPath = useChatStore.getState().projectPath;
        const attachments = get().pendingAttachments;
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
    const { sessionId, pendingEventId } = get();
    const sent = webWS.send({
      type: "interrupt",
      ...(sessionId ? { session_key: sessionId } : {}),
      ...(pendingEventId ? { event_id: pendingEventId } : {}),
    });
    set({ typing: false, activeTool: null, pendingEventId: null, streamStopped: true });
    if (!sent) toast.error("停止失败：连接未就绪");
  },

  clear: () =>
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
    }),

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

  _softReloadHistory: async (sessionId) => {
    try {
      const result = await apiFetch<{ messages: HistoryRow[] }>(
        `/sessions/${encodeURIComponent(sessionId)}/history?limit=100&offset=0`,
      );
      if (get().sessionId !== sessionId) return;
      set({ messages: mapHistoryMessages(sessionId, result.messages ?? []) });
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
      set({ messages: mapHistoryMessages(sessionId, result.messages ?? []) });
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
