import { buildWsUrl } from "./desktop";

type FrameHandler = (frame: ChatFrame) => void;

/** A raw frame pushed by the interactive /ws, as dispatched by the store.
 *  Field shapes follow the gateway outbound contract (server.py:_build_outbound_payload)
 *  and the WS control frames (accepted/error/auth_ok/pong). */
export interface ChatFrame {
  type: string;
  event_id?: string;
  reply_to_id?: string;
  channel?: string;
  chat_id?: string;
  text?: string;
  is_final?: boolean;
  message_kind?: string;
  edit_message_id?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface ChatAuth {
  /** Fixed to "cli" so the channel becomes gateway:cli — the only channel
   *  that gates cognitive (thinking) frames and optimistic streaming. */
  platform: "cli";
  /** cli:web-<ts> / cli:web-side-<ts>. Sent as chat_id too so the server
   *  registers this socket under gateway:cli:<sessionKey> and outbound frames
   *  for this turn route back to it (delivery_key = chat_id). */
  sessionKey: string;
  /** Token from useAuthStore; "" in open mode (ignored when tokens unconfigured). */
  token: string;
}

/** Backoff schedule for reconnects (mirrors WebWS). */
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];

/**
 * One interactive main-/ws connection owned by a single chat store.
 *
 * Deliberately separate from WebWS (the dashboard /ws/web socket): different
 * auth protocol ({type:"auth", platform, user_id, chat_id, session_key, token}
 * vs {type:"auth", token}), different frame shapes (raw message-kind frames vs
 * {type, payload} broadcasts), and a different lifecycle (store-owned, not
 * reference-counted by component subscriptions).
 *
 * Each session owns its own instance and registers under its own delivery_key
 * (chat_id = sessionKey), so main chat and side chat never collide.
 */
export class InteractiveChatWS {
  private ws: WebSocket | null = null;
  private handlers: Set<FrameHandler> = new Set();
  private auth: ChatAuth | null = null;
  /** sessionKey the current socket authenticated with, to detect a re-auth
   *  need when a store mints a fresh session while an old socket lingers. */
  private sessionKey = "";
  /** Outbound frames buffered until auth_ok, so the very first message of a
   *  brand-new session (socket still connecting) is not dropped and streams. */
  private pending: Record<string, unknown>[] = [];
  private attempt = 0;
  private reconnectTimer: number | null = null;
  private retired: WeakSet<WebSocket> = new WeakSet();
  private authFailed = false;
  private authed = false;
  onAuthFailure: (() => void) | null = null;

  /** True when the socket is open and the server accepted our auth frame. */
  get isOpen(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN && this.authed;
  }

  /** Open the socket and (re)register under auth.sessionKey. No-op if already
   *  connected with the same session key. */
  connect(auth: ChatAuth): void {
    this.auth = auth;
    this.authFailed = false;
    if (
      this.ws &&
      this.ws.readyState !== WebSocket.CLOSED &&
      this.ws.readyState !== WebSocket.CLOSING
    ) {
      // A socket is live. If it authenticated under a different session key,
      // the delivery_key no longer matches — tear down and re-open.
      if (this.sessionKey === auth.sessionKey) return;
      this.disconnect();
    }
    this.open();
  }

  private open(): void {
    const auth = this.auth;
    if (!auth) return;
    const ws = new WebSocket(buildWsUrl("/ws"));
    this.ws = ws;
    this.authed = false;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "auth",
          platform: auth.platform,
          user_id: "",
          chat_id: auth.sessionKey,
          session_key: auth.sessionKey,
          token: auth.token,
        }),
      );
    };

    ws.onmessage = (ev) => {
      let data: ChatFrame;
      try {
        data = JSON.parse(ev.data) as ChatFrame;
      } catch {
        return;
      }
      if (data.type === "auth_ok") {
        this.attempt = 0;
        this.authed = true;
        this.sessionKey = auth.sessionKey;
        // Flush any frames buffered while connecting, in order.
        const queued = this.pending;
        this.pending = [];
        for (const frame of queued) ws.send(JSON.stringify(frame));
        return;
      }
      if (data.type === "auth_error" || (data.type === "error" && !this.authed)) {
        // Server closes after these; latch so onclose does not reconnect-loop.
        this.authFailed = true;
        this.close();
        this.onAuthFailure?.();
        return;
      }
      for (const fn of this.handlers) fn(data);
    };

    ws.onclose = () => {
      if (this.retired.has(ws)) return;
      if (this.ws !== ws) return;
      this.ws = null;
      this.authed = false;
      if (this.authFailed) return;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const delay = RECONNECT_DELAYS[Math.min(this.attempt, RECONNECT_DELAYS.length - 1)];
    this.attempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  /** Send a raw frame (e.g. {type:"message", text} or {type:"interrupt"}).
   *
   *  Frames sent while the socket is still connecting are buffered and flushed
   *  once auth_ok arrives (in order), so a send on the first message of a new
   *  session is not lost. Returns false only when no socket can be reached at
   *  all, so callers can fall back to HTTP. */
  send(frame: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) return false;
    if (!this.authed) {
      this.pending.push(frame);
      return true;
    }
    this.ws.send(JSON.stringify(frame));
    return true;
  }

  /** Register a per-session frame handler. Returns an unsubscribe fn. */
  onFrame(fn: FrameHandler): () => void {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  /** Close the socket and cancel any pending reconnect. Keeps auth so a later
   *  connect() can re-open. */
  disconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.attempt = 0;
    this.authed = false;
    this.pending = [];
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      this.retired.add(ws);
      if (ws.readyState !== WebSocket.CLOSED) ws.close();
    }
  }

  /** Close without retaining auth (e.g. logout). */
  close(): void {
    this.disconnect();
    this.auth = null;
    this.sessionKey = "";
  }
}
