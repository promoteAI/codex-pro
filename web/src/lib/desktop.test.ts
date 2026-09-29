import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for desktop mode detection and WS URL building.
 *
 * These tests verify that the IS_DESKTOP flag correctly detects
 * when the app is running inside the Tauri desktop shell, and that
 * buildWsUrl routes WebSocket connections through the Rust proxy in
 * desktop mode (with a ws/wss scheme) and to the gateway in browser mode.
 */
describe("desktop mode", () => {
  beforeEach(() => {
    // Clear VITE_DESKTOP between tests
    delete (import.meta.env as any).VITE_DESKTOP;
    delete (import.meta.env as any).VITE_DESKTOP_ORIGIN;
  });

  afterEach(() => {
    // Clean up after each test
    delete (import.meta.env as any).VITE_DESKTOP;
    delete (import.meta.env as any).VITE_DESKTOP_ORIGIN;
    vi.resetModules();
  });

  it("detects desktop via VITE_DESKTOP env var", () => {
    (import.meta.env as any).VITE_DESKTOP = "1";
    expect((import.meta.env as any).VITE_DESKTOP).toBe("1");
  });

  it("IS_DESKTOP should be true when VITE_DESKTOP is set to 1", async () => {
    (import.meta.env as any).VITE_DESKTOP = "1";
    vi.resetModules();
    const { IS_DESKTOP } = await import("./desktop");
    expect(IS_DESKTOP).toBe(true);
  });

  it("IS_DESKTOP should be false when VITE_DESKTOP is not set", async () => {
    vi.resetModules();
    const { IS_DESKTOP } = await import("./desktop");
    expect(IS_DESKTOP).toBe(false);
  });

  it("DESKTOP_ORIGIN defaults to proxy URL", async () => {
    vi.resetModules();
    const { DESKTOP_ORIGIN } = await import("./desktop");
    expect(DESKTOP_ORIGIN).toBe("http://127.0.0.1:58124");
  });

  it("DESKTOP_ORIGIN can be overridden via env", async () => {
    (import.meta.env as any).VITE_DESKTOP_ORIGIN = "http://custom:8080";
    vi.resetModules();
    const { DESKTOP_ORIGIN } = await import("./desktop");
    expect(DESKTOP_ORIGIN).toBe("http://custom:8080");
  });
});

describe("buildWsUrl", () => {
  beforeEach(() => {
    delete (import.meta.env as any).VITE_DESKTOP;
    delete (import.meta.env as any).VITE_DESKTOP_ORIGIN;
  });

  afterEach(() => {
    delete (import.meta.env as any).VITE_DESKTOP;
    delete (import.meta.env as any).VITE_DESKTOP_ORIGIN;
    vi.resetModules();
  });

  it("desktop mode routes via proxy with a ws scheme", async () => {
    (import.meta.env as any).VITE_DESKTOP = "1";
    vi.resetModules();
    const { buildWsUrl } = await import("./desktop");
    // http://127.0.0.1:58124 -> ws://127.0.0.1:58124, path preserved
    expect(buildWsUrl("/ws/web")).toBe("ws://127.0.0.1:58124/ws/web");
    expect(buildWsUrl("/ws/term")).toBe("ws://127.0.0.1:58124/ws/term");
    expect(buildWsUrl("ws/web")).toBe("ws://127.0.0.1:58124/ws/web");
  });

  it("desktop mode keeps the full /ws path", async () => {
    (import.meta.env as any).VITE_DESKTOP = "1";
    (import.meta.env as any).VITE_DESKTOP_ORIGIN = "https://custom:9999";
    vi.resetModules();
    const { buildWsUrl } = await import("./desktop");
    // https -> wss, path fully preserved
    expect(buildWsUrl("/ws/web")).toBe("wss://custom:9999/ws/web");
  });

  it("browser mode targets the current host", async () => {
    delete (import.meta.env as any).VITE_DESKTOP;
    vi.resetModules();
    const { buildWsUrl } = await import("./desktop");
    // jsdom location.host defaults to localhost:3000
    expect(buildWsUrl("/ws/web")).toBe(`ws://${location.host}/ws/web`);
  });
});
