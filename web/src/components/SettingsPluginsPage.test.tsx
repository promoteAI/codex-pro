import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
      name: "autopilot", version: "1.0.0", description: "Keep a PR merge-ready.",
      source: "entrypoint", path: null, status: "available",
      provides_tools: [], provides_hooks: [], depends_on: [],
    },
    {
      name: "baseline-ui", version: "1.0.0", description: "Quickly deslop UI code.",
      source: "entrypoint", path: null, status: "available",
      provides_tools: [], provides_hooks: [], depends_on: [],
    },
    {
      name: "canvas", version: "1.0.0", description: "A live React app.",
      source: "entrypoint", path: null, status: "available",
      provides_tools: [], provides_hooks: [], depends_on: [],
    },
    {
      name: "create-hook", version: "1.0.0", description: "Create Codex hooks.",
      source: "entrypoint", path: null, status: "available",
      provides_tools: [], provides_hooks: [], depends_on: [],
    },
    {
      name: "create-rule", version: "1.0.0", description: "Create Codex rules.",
      source: "entrypoint", path: null, status: "available",
      provides_tools: [], provides_hooks: [], depends_on: [],
    },
    {
      name: "create-skill", version: "1.0.0", description: "Create Codex Agent Skills.",
      source: "entrypoint", path: null, status: "available",
      provides_tools: [], provides_hooks: [], depends_on: [],
    },
    {
      name: "create-subagent", version: "1.0.0", description: "Create custom subagents.",
      source: "entrypoint", path: null, status: "available",
      provides_tools: [], provides_hooks: [], depends_on: [],
    },
    {
      name: "design-critique", version: "1.0.0", description: "Facilitate a structured team critique.",
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
      name: "browser-mcp", version: "1.0.0", description: "Control the embedded browser through MCP tools.",
      source: "entrypoint", path: null, status: "disabled",
      provides_tools: ["navigate", "click"], provides_hooks: [], depends_on: [],
    },
    {
      name: "frontend-design", version: "1.0.0", description: "Distinctive visual design guidance.",
      source: "entrypoint", path: null, status: "available",
      provides_tools: [], provides_hooks: [], depends_on: [],
    },
    {
      name: "create-rule-skill", version: "1.0.0", description: "Author persistent coding guidance rules.",
      source: "entrypoint", path: null, status: "available",
      provides_tools: [], provides_hooks: [], depends_on: [],
    },
    {
      name: "review-security", version: "1.0.0", description: "Security-focused review of local changes.",
      source: "entrypoint", path: null, status: "disabled",
      provides_tools: [], provides_hooks: [], depends_on: [],
    },
  ],
};

function mockApi() {
  return vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
    if (path === "/plugins") return MOCK_PLUGINS as never;
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

  it("插件清单对齐原型数量", async () => {
    mockApi();
    renderPage();
    await screen.findByRole("button", { name: /插件 9|Plugins 9/i });
    // Names come from the API mock, so look for a known string in the row
    expect(screen.getByText("Use this skill to create Codex Automations.")).toBeInTheDocument();
    expect(screen.getByText("Quickly deslop UI code.")).toBeInTheDocument();
  });

  it("技能标签展示列表而非空态", async () => {
    mockApi();
    renderPage();
    // No mock has provides_hooks → 0 skills from API, but 3 seed skills fallback
    await screen.findByRole("button", { name: /技能 3|Skills 3/i });
    fireEvent.click(screen.getByRole("button", { name: /技能 3|Skills 3/i }));
    expect(screen.getByText("frontend-design")).toBeInTheDocument();
    expect(screen.getByText("review-security")).toBeInTheDocument();
    expect(screen.queryByText(/暂无技能|No skills/i)).not.toBeInTheDocument();
  });

  it("MCP 标签含 sqlite / filesystem", async () => {
    mockApi();
    renderPage();
    await screen.findByRole("button", { name: /MCP 4/i });
    fireEvent.click(screen.getByRole("button", { name: /MCP 4/i }));
    expect(screen.getByText("sqlite")).toBeInTheDocument();
    expect(screen.getByText("filesystem")).toBeInTheDocument();
  });
});
