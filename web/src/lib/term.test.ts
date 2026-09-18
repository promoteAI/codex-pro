import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TermSession } from "./term";
import { useAuthStore } from "../stores/auth";

/** Minimal WebSocket double for the terminal session. */
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

  /** Simulate the server opening the socket and accepting auth. */
  start() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
    this.onmessage?.({ data: JSON.stringify({ type: "auth_ok" }) });
  }

  get frames(): Array<Record<string, unknown>> {
    return this.sent.map((s) => JSON.parse(s));
  }
}

const original = globalThis.WebSocket;

beforeEach(() => {
  FakeWebSocket.instances = [];
  (globalThis as any).WebSocket = FakeWebSocket;
  useAuthStore.setState({ token: "t1" });
});

afterEach(() => {
  (globalThis as any).WebSocket = original;
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("TermSession", () => {
  it("连接后发送 auth 帧,认证通过后发送 start 帧", () => {
    const session = new TermSession();
    session.connect("/bin/sh", "/workspace", 80, 24);
    const socket = FakeWebSocket.instances[0];
    socket.start(); // fires onopen -> auth
    expect(socket.frames[0]).toEqual({ type: "auth", token: "t1" });

    const start = socket.frames.find((f) => f.type === "start");
    expect(start?.params).toEqual({ shell: "/bin/sh", cwd: "/workspace", cols: 80, rows: 24 });
  });

  it("started 后记录 processId,write 转发为 base64", () => {
    const session = new TermSession();
    const onData = vi.fn();
    session.onData = onData;
    session.connect("", "", 80, 24);
    const socket = FakeWebSocket.instances[0];
    socket.start();
    socket.onmessage?.({ data: JSON.stringify({ type: "started", processId: "term_1" }) });

    session.write("ls -la\n");
    const write = socket.frames.find((f) => f.type === "write");
    expect(write?.processId).toBe("term_1");
    expect(socket.frames.find((f) => f.type === "write")?.data).toContain("b");
  });

  it("output 帧 base64 解码后喂给 onData", () => {
    const session = new TermSession();
    const onData = vi.fn();
    session.onData = onData;
    session.connect("", "", 80, 24);
    const socket = FakeWebSocket.instances[0];
    socket.start();
    socket.onmessage?.({ data: JSON.stringify({ type: "started", processId: "term_1" }) });

    const payload = btoa("hello\r\n");
    socket.onmessage?.({ data: JSON.stringify({ type: "output", processId: "term_1", seq: 1, stream: "pty", data: payload }) });

    expect(onData).toHaveBeenCalledTimes(1);
    const bytes = onData.mock.calls[0][0] as Uint8Array;
    expect(Buffer.from(bytes).toString("utf8")).toBe("hello\r\n");
  });

  it("exited 帧触发 onExit", () => {
    const session = new TermSession();
    const onExit = vi.fn();
    session.onExit = onExit;
    session.connect("", "", 80, 24);
    const socket = FakeWebSocket.instances[0];
    socket.start();
    socket.onmessage?.({ data: JSON.stringify({ type: "exited", processId: "term_1", exitCode: 0 }) });

    expect(onExit).toHaveBeenCalledWith(0);
  });

  it("断线(未 dispose)时以 -1 触发 onExit", () => {
    const session = new TermSession();
    const onExit = vi.fn();
    session.onExit = onExit;
    session.connect("", "", 80, 24);
    const socket = FakeWebSocket.instances[0];
    socket.start();
    socket.close();

    expect(onExit).toHaveBeenCalledWith(-1);
  });

  it("dispose 后断线不再回调", () => {
    const session = new TermSession();
    const onExit = vi.fn();
    session.onExit = onExit;
    session.connect("", "", 80, 24);
    const socket = FakeWebSocket.instances[0];
    socket.start();
    session.dispose();
    socket.close();

    expect(onExit).not.toHaveBeenCalled();
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it("resize 发送 cols/rows", () => {
    const session = new TermSession();
    session.connect("", "", 80, 24);
    const socket = FakeWebSocket.instances[0];
    socket.start();
    socket.onmessage?.({ data: JSON.stringify({ type: "started", processId: "term_1" }) });

    session.resize(120, 30);
    const resize = socket.frames.find((f) => f.type === "resize");
    expect(resize).toMatchObject({ processId: "term_1", cols: 120, rows: 30 });
  });

  it("interrupt 发送 signal 帧", () => {
    const session = new TermSession();
    session.connect("", "", 80, 24);
    const socket = FakeWebSocket.instances[0];
    socket.start();
    socket.onmessage?.({ data: JSON.stringify({ type: "started", processId: "term_1" }) });

    session.interrupt();
    expect(socket.frames.at(-1)).toMatchObject({ type: "signal", processId: "term_1", signal: "interrupt" });
  });

  it("auth_error 触发 onError 并关闭连接", () => {
    const session = new TermSession();
    const onError = vi.fn();
    session.onError = onError;
    session.connect("", "", 80, 24);
    const socket = FakeWebSocket.instances[0];
    socket.readyState = FakeWebSocket.OPEN;
    socket.onopen?.();
    socket.onmessage?.({ data: JSON.stringify({ type: "auth_error", message: "invalid token" }) });

    expect(onError).toHaveBeenCalledWith("invalid token");
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
  });
});
