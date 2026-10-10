import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InteractiveChatWS } from "./chat-ws";

/** Minimal WebSocket double: records every instance and drives the handshake
 *  by hand, mirroring src/lib/ws.test.ts. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  /** open + auth_ok, i.e. a fully authenticated session */
  handshake() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
    this.onmessage?.({ data: JSON.stringify({ type: "auth_ok" }) });
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

const original = globalThis.WebSocket;

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.instances = [];
  (globalThis as any).WebSocket = FakeWebSocket;
});

afterEach(() => {
  vi.useRealTimers();
  (globalThis as any).WebSocket = original;
});

const AUTH = { platform: "cli", sessionKey: "cli:web-1", token: "" } as const;

describe("InteractiveChatWS", () => {
  it("opens the interactive /ws and sends an auth frame with platform cli", () => {
    const ws = new InteractiveChatWS();
    ws.connect({ ...AUTH });
    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toBe(`ws://${location.host}/ws`);
    socket.handshake();
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: "auth",
      platform: "cli",
      user_id: "",
      chat_id: "cli:web-1",
      session_key: "cli:web-1",
      token: "",
    });
  });

  it("buffers outbound frames sent before auth_ok and flushes in order", () => {
    const ws = new InteractiveChatWS();
    ws.connect({ ...AUTH });
    const socket = FakeWebSocket.instances[0];
    expect(ws.send({ type: "message", text: "hi" })).toBe(true);
    // Not yet authed: frame is queued, not sent over the wire.
    expect(socket.sent).toHaveLength(0);
    socket.handshake();
    expect(JSON.parse(socket.sent[1])).toEqual({ type: "message", text: "hi" });
    expect(ws.isOpen).toBe(true);
  });

  it("isOpen is false until auth_ok, and dispatch frames to handlers", () => {
    const ws = new InteractiveChatWS();
    const frames: unknown[] = [];
    ws.onFrame((f) => frames.push(f));
    ws.connect({ ...AUTH });
    const socket = FakeWebSocket.instances[0];
    expect(ws.isOpen).toBe(false);
    socket.handshake();
    expect(ws.isOpen).toBe(true);
    socket.emit({ type: "message", message_kind: "streaming", text: "he", metadata: { _inbound_event_id: "evt-1" } });
    expect(frames).toHaveLength(1);
  });

  it("reconnects and re-auths after an unexpected close", () => {
    const ws = new InteractiveChatWS();
    ws.connect({ ...AUTH });
    const socket = FakeWebSocket.instances[0];
    socket.handshake();
    // Unexpected close (not retired, no auth failure) → schedule reconnect.
    socket.close();
    vi.advanceTimersByTime(1000);
    const socket2 = FakeWebSocket.instances[1];
    expect(socket2).toBeDefined();
    socket2.handshake();
    expect(JSON.parse(socket2.sent[0]).session_key).toBe("cli:web-1");
  });

  it("latches auth failure and calls onAuthFailure, never reconnecting", () => {
    const ws = new InteractiveChatWS();
    const onAuthFailure = vi.fn();
    ws.onAuthFailure = onAuthFailure;
    ws.connect({ ...AUTH });
    const socket = FakeWebSocket.instances[0];
    socket.emit({ type: "auth_error", error: "unauthorized" });
    expect(onAuthFailure).toHaveBeenCalled();
    expect(ws.isOpen).toBe(false);
    socket.close();
    vi.advanceTimersByTime(30000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("disconnect retires the socket so its late onclose does not reconnect", () => {
    const ws = new InteractiveChatWS();
    ws.connect({ ...AUTH });
    const socket = FakeWebSocket.instances[0];
    socket.handshake();
    ws.disconnect();
    socket.close();
    vi.advanceTimersByTime(30000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("switching to a new session key re-opens a fresh socket", () => {
    const ws = new InteractiveChatWS();
    ws.connect({ ...AUTH });
    const socket = FakeWebSocket.instances[0];
    socket.handshake();
    ws.connect({ ...AUTH, sessionKey: "cli:web-side-2" });
    const socket2 = FakeWebSocket.instances[1];
    expect(socket2).toBeDefined();
    socket2.handshake();
    expect(JSON.parse(socket2.sent[0]).chat_id).toBe("cli:web-side-2");
  });
});
