import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { PluginsView } from "./PluginsView";
import { ConfirmProvider } from "../components/ConfirmDialog";
import * as api from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { useShellStore } from "../stores/shell";

const SKILLS = {
  skills: [
    { name: "Automate", description: "Create Codex Automations.", enabled: true },
    { name: "Canvas", description: "Live React app canvas.", enabled: true },
    { name: "frontend-design", description: "Visual design guidance.", enabled: true },
    { name: "Create Skill", description: "Author a new skill.", enabled: false },
  ],
};

const PLUGINS = {
  plugins: [
    {
      name: "computer-use",
      version: "1.0.0",
      description: "Control Windows apps",
      source: "user",
      path: null,
      status: "available",
      provides_tools: [],
      provides_hooks: [],
      depends_on: [],
    },
    {
      name: "spreadsheets",
      version: "1.0.0",
      description: "Create and edit spreadsheets",
      source: "entrypoint",
      path: null,
      status: "available",
      provides_tools: ["sheet"],
      provides_hooks: [],
      depends_on: [],
    },
    {
      name: "presentations",
      version: "1.0.0",
      description: "Create and edit presentations",
      source: "entrypoint",
      path: null,
      status: "available",
      provides_tools: ["slide"],
      provides_hooks: [],
      depends_on: [],
    },
    {
      name: "documents",
      version: "1.0.0",
      description: "Create and edit documents",
      source: "entrypoint",
      path: null,
      status: "available",
      provides_tools: ["doc"],
      provides_hooks: [],
      depends_on: [],
    },
    {
      name: "pdf",
      version: "1.0.0",
      description: "Read and annotate PDFs",
      source: "entrypoint",
      path: null,
      status: "available",
      provides_tools: ["pdf"],
      provides_hooks: [],
      depends_on: [],
    },
    {
      name: "legacy-canvas",
      version: "0.9.0",
      description: "Old canvas plugin (disabled)",
      source: "project",
      path: null,
      status: "disabled",
      provides_tools: [],
      provides_hooks: [],
      depends_on: [],
    },
  ],
};

function mockApi(togglePath: string | null = null) {
  return vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
    if (path === "/skills") return SKILLS as never;
    if (path === "/plugins") return PLUGINS as never;
    if (path === togglePath) {
      return { success: true, plugin: togglePath.split("/")[2], enabled: true } as never;
    }
    if (path.endsWith("/deps")) {
      return { name: "Automate", requires: [], missing: [], satisfied: true } as never;
    }
    if (path.startsWith("/skills/")) {
      return { name: "Automate", content: "# Automate", files: ["SKILL.md"] } as never;
    }
    return {} as never;
  });
}

function renderView() {
  return render(
    <MemoryRouter>
      <ConfirmProvider>
        <PluginsView />
      </ConfirmProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuthStore.setState({ token: "" });
  useShellStore.setState({ settingsOpen: false, settingsSection: "plugins" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PluginsView", () => {
  it("默认渲染插件页：加载状态后显示已启用和已禁用分区", async () => {
    mockApi();
    renderView();

    // Shows loading first, then populated sections
    await waitFor(() => {
      expect(screen.getByText(/已启用/)).toBeInTheDocument();
    });
  });

  it("显示已启用插件卡片", async () => {
    mockApi();
    renderView();
    await waitFor(() => {
      expect(screen.getByText("computer-use")).toBeInTheDocument();
    });
    expect(screen.getByText("Control Windows apps")).toBeInTheDocument();
  });

  it("显示已禁用插件分区", async () => {
    mockApi();
    renderView();
    await waitFor(() => {
      expect(screen.getByText(/已禁用/)).toBeInTheDocument();
    });
    expect(screen.getByText("legacy-canvas")).toBeInTheDocument();
  });

  it("搜索过滤插件", async () => {
    mockApi();
    renderView();
    await waitFor(() => {
      expect(screen.getByText("computer-use")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText("搜索插件"), { target: { value: "PDF" } });
    expect(screen.getByText("Read and annotate PDFs")).toBeInTheDocument();
    expect(screen.queryByText("Control Windows apps")).not.toBeInTheDocument();
  });

  it("切换技能页并展示已安装技能", async () => {
    mockApi();
    renderView();
    await waitFor(() => {
      expect(screen.getByText("computer-use")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("tab", { name: "技能" }));

    expect(await screen.findByRole("heading", { name: "技能", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("通过任务专用技能扩展 Codex")).toBeInTheDocument();
    expect(await screen.findAllByText("Automate")).not.toHaveLength(0);
    expect(screen.getAllByText("Create Codex Automations.").length).toBeGreaterThan(0);
  });

  it("技能分类：系统 / 推荐", async () => {
    mockApi();
    renderView();
    await waitFor(() => {
      expect(screen.getByText("computer-use")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("tab", { name: "技能" }));
    await screen.findAllByText("Automate");

    fireEvent.click(screen.getByRole("button", { name: "系统" }));
    expect(screen.getAllByText("frontend-design").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "推荐" }));
    expect(screen.getByText("Create Skill")).toBeInTheDocument();
  });

  it("点击技能打开详情抽屉", async () => {
    mockApi();
    renderView();
    await waitFor(() => {
      expect(screen.getByText("computer-use")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("tab", { name: "技能" }));
    const cards = await screen.findAllByText("Automate");
    fireEvent.click(cards[0].closest("button")!);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("# Automate")).toBeInTheDocument();
  });

  it("设置按钮打开插件设置", async () => {
    mockApi();
    renderView();
    await waitFor(() => {
      expect(screen.getByText("computer-use")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText("插件设置"));
    expect(useShellStore.getState().settingsOpen).toBe(true);
  });

  it("添加菜单打开添加插件市场弹窗", async () => {
    mockApi();
    renderView();
    await waitFor(() => {
      expect(screen.getByText("computer-use")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /添加/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "添加插件市场" }));
    expect(screen.getByRole("dialog", { name: "添加插件市场" })).toBeInTheDocument();
    expect(screen.getByLabelText("来源")).toBeInTheDocument();
    expect(screen.getByLabelText("Git 引用")).toBeInTheDocument();
    expect(screen.getByLabelText("稀疏路径")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog", { name: "添加插件市场" })).not.toBeInTheDocument();
  });

  it("添加市场需填写来源", async () => {
    mockApi();
    renderView();
    await waitFor(() => {
      expect(screen.getByText("computer-use")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /添加/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "添加插件市场" }));
    fireEvent.click(screen.getByRole("button", { name: "添加市场" }));
    expect(screen.getByRole("dialog", { name: "添加插件市场" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("来源"), { target: { value: "openai/plugins" } });
    fireEvent.click(screen.getByRole("button", { name: "添加市场" }));
    expect(screen.queryByRole("dialog", { name: "添加插件市场" })).not.toBeInTheDocument();
  });
});
