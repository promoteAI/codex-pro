import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import * as api from "./lib/api";
import { App } from "./App";
import { useAuthStore } from "./stores/auth";
import { useCapabilitiesStore } from "./stores/capabilities";
import { useShellStore } from "./stores/shell";

/**
 * Mocks every HTTP call the shell makes. `/setup/status` is what FirstRunGate
 * reads; `/setup/providers` is what the mounted wizard reads; `/capabilities`
 * is what Layout's AuthGate probes (returned as open mode so the shell renders);
 * everything else falls back to `{}` so the dashboard's own fetches settle.
 */
function mockApi(configured: boolean) {
  return vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
    if (path === "/setup/status") return { configured, workspace: "" } as never;
    if (path === "/setup/providers") {
      return {
        groups: [
          {
            id: "mainstream",
            label: "mainstream",
            entries: [
              { id: "openai", label: "OpenAI", dialect: "openai", api_base: "", needs_api_base: false },
            ],
          },
        ],
      } as never;
    }
    if (path === "/capabilities") return { admin: true, authRequired: false } as never;
    return {} as never;
  });
}

beforeEach(() => {
  localStorage.clear();
  // App 用 BrowserRouter,其路由状态挂在共享的 window.history 上。第一个用例
  // 的 <Navigate to="/setup"> 会把 history 留在 /setup,导致下一个用例直接从
  // 向导页开始而不是根路径。每个用例前重置到根,保证独立。
  window.history.replaceState({}, "", "/");
  useAuthStore.setState({ token: null });
  useCapabilitiesStore.getState().reset();
  // 共享的 shell store 状态在用例间泄漏会互相污染(例如 tools/term panel)。
  useShellStore.setState({
    toolsOpen: false,
    termOpen: false,
    settingsOpen: false,
    searchOpen: false,
    mobileRemoteOpen: false,
    remoteConnectOpen: false,
    botsOpen: false,
    layoutMode: "side",
    activeToolPane: "hub",
    sessionTabs: [],
    activeTabId: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App 首次运行门控", () => {
  it("未配置时重定向到 /setup 向导", async () => {
    mockApi(false);

    render(<App />);

    // SetupWizard 标题(zh),证明已到达向导页。
    expect(await screen.findByText("首次配置")).toBeInTheDocument();
    // 不应渲染主界面侧边栏。
    expect(screen.queryByText("新对话")).toBeNull();
  });

  it("已配置时渲染主界面", async () => {
    mockApi(true);

    render(<App />);

    // 侧边栏「新对话」入口,证明已进入主 shell。
    expect(await screen.findByText("新对话")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("首次配置")).toBeNull());
  });
});
