import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { axe } from "jest-axe";
import { Login } from "../pages/Login";
import { Overview } from "../pages/Overview";
import { Sessions } from "../pages/Sessions";
import { ConfirmProvider } from "../components/ConfirmDialog";
import { useAuthStore } from "../stores/auth";
import * as api from "../lib/api";

/**
 * Automated accessibility scan (axe-core) for key surfaces.
 *
 * These tests assert that the rendered DOM has no WCAG 2.1 AA violations
 * (color contrast, ARIA usage, landmark structure, focus management, etc.).
 * They complement the manual `:focus-visible` / `prefers-reduced-motion`
 * handling already in `index.css`.
 *
 * Note: axe runs against the jsdom DOM, so it validates semantics and
 * contrast where computed styles are available. Visual-only issues that
 * require a real browser (e.g. actual pixel rendering) are out of scope here.
 */

const HEALTH = { status: "healthy", active_sessions: 4, ws_clients: 2 };
const CHANNELS = {
  channels: [
    { name: "feishu", enabled: true, running: true },
    { name: "wecom", enabled: true, running: false },
  ],
};
const TASKS = { tasks: [{ status: "running" }, { status: "queued" }], total: 2 };

function mockApi() {
  return vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
    if (path === "/health") return HEALTH as never;
    if (path === "/channels") return CHANNELS as never;
    if (path.startsWith("/tasks")) return TASKS as never;
    if (path === "/memory/stats") return { total: 42 } as never;
    if (path.startsWith("/sessions")) return { sessions: [], total: 0 } as never;
    return {} as never;
  });
}

beforeEach(() => {
  // 不给 token,useWsSubscribe 就不会真的建连接。
  useAuthStore.setState({ token: "" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("可访问性扫描 (axe-core)", () => {
  it("登录页无 WCAG 违规", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({ authRequired: true } as never);
    const { container } = render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it("概览页无 WCAG 违规", async () => {
    mockApi();
    const { container } = render(
      <MemoryRouter>
        <Overview />
      </MemoryRouter>,
    );

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it("会话页无 WCAG 违规", async () => {
    mockApi();
    const { container } = render(
      <MemoryRouter>
        <ConfirmProvider>
          <Sessions />
        </ConfirmProvider>
      </MemoryRouter>,
    );

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
