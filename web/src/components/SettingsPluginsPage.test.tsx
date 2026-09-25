import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SettingsPluginsPage } from "./settings/pages/MorePages";
import { useShellStore } from "../stores/shell";
import { useAuthStore } from "../stores/auth";
import * as api from "../lib/api";

const MOCK_PLUGINS = {
  plugins: [
    {
      name: "automate", version: "1.0.0", description: "Use this skill to create Codex Automations.",
      source: "entrypoint", path: null, status: "available",
      provides_tools: [], provides_hooks: [], depends_on: [],
    },
    {
      name: "filesystem", version: "1.0.0", description: "Read and write local files through MCP.",
      source: "entrypoint", path: null, status: "available",
      provides_tools: ["read_file", "write_file"], provides_hooks: [], depends_on: [],
    },
    {
      name: "github", version: "1.0.0", description: "Issues, PRs and repository metadata via MCP.",
      source: "entrypoint", path: null, status: "disabled",
      provides_tools: ["get_issues", "get_prs"], provides_hooks: [], depends_on: [],
    },
    {
      name: "sqlite", version: "1.0.0", description: "Query local SQLite databases.",
      source: "entrypoint", path: null, status: "available",
      provides_tools: ["query_sqlite"], provides_hooks: [], depends_on: [],
    },
    {
      name: "frontend-design", version: "1.0.0", description: "Distinctive visual design guidance.",
      source: "user", path: null, status: "available",
      provides_tools: [], provides_hooks: ["pre_tool_call"], depends_on: [],
    },
    {
      name: "review-security", version: "1.0.0", description: "Security-focused review of local changes.",
      source: "user", path: null, status: "disabled",
      provides_tools: [], provides_hooks: ["post_tool_call"], depends_on: [],
    },
  ],
};

function mockApi(togglePath: string | null = null) {
  return vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
    if (path === "/plugins") return MOCK_PLUGINS as never;
    if (path === "/skills") return { skills: [] } as never;
    if (togglePath && path === togglePath) {
      return { success: true } as never;
    }
    return {} as never;
  });
}

function mockEmptyApi() {
  return vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
    if (path === "/plugins") return { plugins: [] } as never;
    if (path === "/skills") return { skills: [] } as never;
    return {} as never;
  });
}

beforeEach(() => {
  useAuthStore.setState({ token: "" });
  useShellStore.setState({ settingsOpen: true, settingsSection: "plugins" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPluginsPage />
    </MemoryRouter>,
  );
}

describe("SettingsPluginsPage", () => {
  it("浏览目录关闭设置并跳转 /plugins", () => {
    mockApi();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /浏览目录|Browse catalog/i }));
    expect(useShellStore.getState().settingsOpen).toBe(false);
  });

  it("显示真实插件数据并按来源标注 tag", async () => {
    mockApi();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("automate")).toBeInTheDocument();
    });
    // entrypoint source → "系统" tag
    expect(screen.getByText(/系统/)).toBeInTheDocument();
  });

  it("按 kind 分类显示正确计数", async () => {
    mockApi();
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /插件 1|plugins 1/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /MCP 3|mcp 3/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /技能 2|skills 2/i })).toBeInTheDocument();
    });
  });

  it("点击 MCP tab 显示带 tools 的插件", async () => {
    mockApi();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("automate")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /MCP 3/i }));
    await waitFor(() => {
      expect(screen.getByText("filesystem")).toBeInTheDocument();
      expect(screen.getByText("sqlite")).toBeInTheDocument();
      expect(screen.getByText("github")).toBeInTheDocument();
    });
  });

  it("已启用插件显示为勾选状态", async () => {
    mockApi();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("automate")).toBeInTheDocument();
    });
    // enable toggle for the enabled plugin should be checked
    const toggles = screen.getAllByRole("checkbox", { name: /已启用/ });
    expect(toggles.length).toBeGreaterThan(0);
    toggles.forEach((t) => expect(t).toBeChecked());
  });

  it("无插件时显示空态提示", async () => {
    mockEmptyApi();
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /插件 0|plugins 0/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /MCP 0|mcp 0/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /技能 0|skills 0/i })).toBeInTheDocument();
    });
    // Empty state shows the title and description
    expect(screen.getAllByText(/管理插件、技能和 MCP/i).length).toBeGreaterThan(0);
  });
});
