import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for desktop mode detection.
 *
 * These tests verify that the IS_DESKTOP flag correctly detects
 * when the app is running inside the Tauri desktop shell.
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
  });

  it("detects desktop via VITE_DESKTOP env var", () => {
    (import.meta.env as any).VITE_DESKTOP = "1";
    // When VITE_DESKTOP is "1", the app should detect desktop mode
    expect((import.meta.env as any).VITE_DESKTOP).toBe("1");
  });

  it("IS_DESKTOP should be true when VITE_DESKTOP is set to 1", async () => {
    (import.meta.env as any).VITE_DESKTOP = "1";
    // Force re-import to pick up the new env value
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
