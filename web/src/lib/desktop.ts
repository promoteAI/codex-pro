// web/src/lib/desktop.ts
// Single source of truth for desktop-shell detection and the proxy origin.
// Both api.ts and ws.ts read from here so the IS_DESKTOP / DESKTOP_ORIGIN
// values are never duplicated.

/** Whether we run inside the Tauri desktop shell. When true, API/WS requests
 *  go to the Rust proxy (via a localhost base URL) rather than relative paths.
 *
 *  Detected either by a build-time VITE_DESKTOP=1 flag, or at runtime by the
 *  `__TAURI__` global that `withGlobalTauri: true` injects into the webview. */
export const IS_DESKTOP =
  import.meta.env.VITE_DESKTOP === "1" ||
  (typeof window !== "undefined" && "__TAURI__" in window);

/** The Rust proxy listens on a fixed port; the frontend reaches the gateway
 *  through it. Set at build/dev time. */
export const DESKTOP_ORIGIN =
  import.meta.env.VITE_DESKTOP_ORIGIN || "http://127.0.0.1:58124";

/** Whether the app is running inside the Tauri desktop shell. */
export function isDesktop(): boolean {
  return IS_DESKTOP;
}

/** Build a WebSocket URL for a `/ws/...` path.
 *
 *  In desktop mode the request is routed through the Rust proxy on
 *  `DESKTOP_ORIGIN` (with the scheme rewritten to ws/wss), which relays to the
 *  gateway and bypasses its cross-site CSRF gate. Otherwise it targets the
 *  gateway on the current host.
 *
 *  `path` must already include the `/ws` prefix (e.g. `/ws/web`, `/ws/term`);
 *  a leading slash is added if missing.
 */
export function buildWsUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (IS_DESKTOP) {
    return `${DESKTOP_ORIGIN.replace(/^http/i, "ws")}${p}`;
  }
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}${p}`;
}
