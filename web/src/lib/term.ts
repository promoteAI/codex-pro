import { useAuthStore } from "../stores/auth";

/**
 * One interactive terminal session over the gateway's `/ws/term` endpoint.
 *
 * The backend owns a real pseudo-terminal running a shell; this client streams
 * the user's keystrokes across the socket and forwards the raw PTY byte stream
 * back to the caller, where `xterm.js` performs terminal emulation.
 *
 * Unlike {@link WebWS} this session is deliberately NOT auto-reconnecting: a
 * terminal is stateful, and silently re-establishing a lost connection would
 * spawn a fresh shell the user did not ask for. v1 treats a drop as terminal —
 * the panel shows a hint and the user re-opens.
 */

type Listener = (data: Uint8Array) => void;

export class TermSession {
  /** Called with each raw output chunk from the PTY (feed to Terminal.write). */
  onData: Listener | null = null;
  /** Called once when the process exits, with the exit code (or -1 on drop). */
  onExit: ((code: number) => void) | null = null;
  /** Called when the socket fails to establish or the token is rejected. */
  onError: ((message: string) => void) | null = null;

  private ws: WebSocket | null = null;
  private token = "";
  private processId = "";
  private disposed = false;

  /** Establish a session and spawn a shell on the gateway. */
  connect(shell: string, cwd: string, cols: number, rows: number) {
    this.token = useAuthStore.getState().token ?? "";
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/ws/term`);
    this.ws = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token: this.token }));
    };

    ws.onmessage = (ev) => {
      let data: { type?: string; processId?: string; data?: string; exitCode?: number; message?: string; params?: Record<string, string> };
      try {
        data = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (data.type) {
        case "auth_ok":
          this.onAuthOk(shell, cwd, cols, rows);
          break;
        case "auth_error":
          this.onError?.(data.message ?? "auth failed");
          this.dispose();
          break;
        case "started":
          this.processId = data.processId ?? "";
          break;
        case "output":
          this.dispatchOutput(data.data ?? "");
          break;
        case "exited":
          this.onExit?.(typeof data.exitCode === "number" ? data.exitCode : -1);
          break;
        case "error":
          this.onError?.(data.message ?? "terminal error");
          break;
      }
    };

    ws.onclose = () => {
      if (this.disposed) return;
      this.onExit?.(-1);
    };
  }

  /** Deferred until auth_ok so the server accepts the `start` frame. */
  private onAuthOk(shell: string, cwd: string, cols: number, rows: number) {
    this.ws?.send(
      JSON.stringify({
        type: "start",
        id: "start",
        params: { shell, cwd, cols, rows },
      }),
    );
  }

  private dispatchOutput(b64: string) {
    if (!this.onData) return;
    let bytes: Uint8Array;
    try {
      const binary = atob(b64);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } catch {
      return;
    }
    this.onData(bytes);
  }

  /** Forward keystrokes (as UTF-8) to the PTY stdin. */
  write(data: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.processId) return;
    this.ws.send(
      JSON.stringify({
        type: "write",
        processId: this.processId,
        data: this.toBase64(data),
      }),
    );
  }

  resize(cols: number, rows: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.processId) return;
    this.ws.send(JSON.stringify({ type: "resize", processId: this.processId, cols, rows }));
  }

  interrupt() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.processId) return;
    this.ws.send(JSON.stringify({ type: "signal", processId: this.processId, signal: "interrupt" }));
  }

  terminate() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.processId) return;
    this.ws.send(JSON.stringify({ type: "terminate", processId: this.processId, id: "term" }));
  }

  dispose() {
    this.disposed = true;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* already closed */
      }
      this.ws = null;
    }
  }

  private toBase64(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
}
