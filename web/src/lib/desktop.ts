// web/src/lib/desktop.ts
// Whether we run inside the Tauri desktop shell. When true, API/WS requests
// go to the Rust proxy (via a localhost base URL) rather than relative paths.
export const IS_DESKTOP =
  import.meta.env.VITE_DESKTOP === "1" ||
  (typeof window !== "undefined" && "__TAURI__" in window);

// The Rust proxy listens on a fixed port; the frontend reaches the gateway
// through it. This is set at build/dev time.
export const DESKTOP_ORIGIN =
  import.meta.env.VITE_DESKTOP_ORIGIN || "http://127.0.0.1:58124";
