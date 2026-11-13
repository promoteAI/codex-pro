import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { axe } from "jest-axe";
import { Login } from "../pages/Login";
import { Skills } from "../pages/Skills";
import { ConfirmProvider } from "../components/ConfirmDialog";
import { useAuthStore } from "../stores/auth";
import { useCapabilitiesStore } from "../stores/capabilities";
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

const SKILLS = {
  skills: [
    { name: "web search", description: "搜索网页", enabled: true },
    { name: "shell", description: "", enabled: false },
  ],
};

function mockApi() {
  return vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
    if (path === "/capabilities") return { admin: true } as never;
    if (path === "/skills") return SKILLS as never;
    return {} as never;
  });
}

beforeEach(() => {
  // 不给 token,useWsSubscribe 就不会真的建连接。
  useAuthStore.setState({ token: "" });
  useCapabilitiesStore.setState({ admin: true, authRequired: null, inflight: null, generation: 0 });
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

  it("技能页无 WCAG 违规", async () => {
    mockApi();
    const { container } = render(
      <MemoryRouter>
        <ConfirmProvider>
          <Skills />
        </ConfirmProvider>
      </MemoryRouter>,
    );

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
