import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { HooksPage } from "./settings/pages/MorePages";
import { useAuthStore } from "../stores/auth";
import * as api from "../lib/api";

const MOCK_HOOKS = {
  hooks: [
    {
      id: "h1", name: "", event: "PreToolUse", run_mode: "process",
      scope: "用户", command: "echo pre", enabled: true,
    },
    {
      id: "h2", name: "", event: "Stop", run_mode: "prompt",
      scope: "codex-pro", command: "echo stop", enabled: false,
    },
  ],
  total: 2,
  enabled: 1,
};

function mockApi() {
  return vi.spyOn(api, "apiFetch").mockImplementation(async (path: string, options?: RequestInit) => {
    const method = (options?.method ?? "GET").toUpperCase();
    if (path === "/hooks" && method === "GET") return MOCK_HOOKS as never;
    if (path === "/hooks" && method === "POST") return { hook: { ...MOCK_HOOKS.hooks[0], id: "h3" } } as never;
    if (path.startsWith("/hooks/") && method === "POST") {
      return { hook: { ...MOCK_HOOKS.hooks[0], enabled: false } } as never;
    }
    if (path.startsWith("/hooks/") && method === "DELETE") return { status: "deleted" } as never;
    return {} as never;
  });
}

function mockEmptyApi() {
  return vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
    if (path === "/hooks") return { hooks: [], total: 0, enabled: 0 } as never;
    return {} as never;
  });
}

beforeEach(() => {
  useAuthStore.setState({ token: "" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <HooksPage />
    </MemoryRouter>,
  );
}

describe("HooksPage", () => {
  it("显示真实挂钩数据并统计启用数量", async () => {
    mockApi();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("PreToolUse")).toBeInTheDocument();
    });
    expect(screen.getByText("Stop")).toBeInTheDocument();
    expect(screen.getByText("echo pre")).toBeInTheDocument();
    // 钩子总数与已安装(启用)数
    expect(screen.getByText(/钩子 2/)).toBeInTheDocument();
    expect(screen.getByText(/已安装 1/)).toBeInTheDocument();
  });

  it("切换启停调用 toggle 接口", async () => {
    const spy = mockApi();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("PreToolUse")).toBeInTheDocument();
    });
    const toggle = screen.getAllByRole("checkbox")[0];
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(
        "/hooks/h1/toggle",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("保存新钩子调用 POST 接口", async () => {
    const spy = mockApi();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("PreToolUse")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /新建/ }));
    const textarea = await screen.findByPlaceholderText(/echo/);
    fireEvent.change(textarea, { target: { value: "echo new" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(
        "/hooks",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("删除钩子调用 DELETE 接口", async () => {
    const spy = mockApi();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("PreToolUse")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /删除 PreToolUse/ }));
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith("/hooks/h1", { method: "DELETE" });
    });
  });

  it("无钩子时显示空态提示", async () => {
    mockEmptyApi();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/尚未安装钩子|No hooks installed/)).toBeInTheDocument();
    });
  });
});
