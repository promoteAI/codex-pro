import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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

function mockApi() {
  return vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
    if (path === "/skills") return SKILLS as never;
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
  it("默认渲染插件页：已安装芯片与 Featured", async () => {
    mockApi();
    renderView();

    expect(screen.getByRole("heading", { name: "已安装" })).toBeInTheDocument();
    expect(screen.getByTitle("GitHub")).toBeInTheDocument();
    expect(screen.getByText("Featured")).toBeInTheDocument();
    expect(screen.getByText("Computer Use")).toBeInTheDocument();
    expect(screen.getByText("Productivity")).toBeInTheDocument();
  });

  it("公开/个人筛选", () => {
    mockApi();
    renderView();

    expect(screen.getByText("Computer Use")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "个人" }));
    expect(screen.queryByText("Computer Use")).not.toBeInTheDocument();
    // personal productivity cards share display names with public ones
    expect(screen.getAllByText("Spreadsheets").length).toBeGreaterThan(0);
  });

  it("搜索过滤插件", () => {
    mockApi();
    renderView();
    fireEvent.change(screen.getByLabelText("搜索插件"), { target: { value: "PDF" } });
    expect(screen.getByRole("heading", { name: "Productivity" })).toBeInTheDocument();
    expect(screen.getByText("Read and annotate PDFs")).toBeInTheDocument();
    expect(screen.queryByText("Computer Use")).not.toBeInTheDocument();
  });

  it("添加菜单打开添加插件市场弹窗", () => {
    mockApi();
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /添加/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "添加插件市场" }));
    expect(screen.getByRole("dialog", { name: "添加插件市场" })).toBeInTheDocument();
    expect(screen.getByLabelText("来源")).toBeInTheDocument();
    expect(screen.getByLabelText("Git 引用")).toBeInTheDocument();
    expect(screen.getByLabelText("稀疏路径")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog", { name: "添加插件市场" })).not.toBeInTheDocument();
  });

  it("添加市场需填写来源", () => {
    mockApi();
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /添加/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "添加插件市场" }));
    fireEvent.click(screen.getByRole("button", { name: "添加市场" }));
    expect(screen.getByRole("dialog", { name: "添加插件市场" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("来源"), { target: { value: "openai/plugins" } });
    fireEvent.click(screen.getByRole("button", { name: "添加市场" }));
    expect(screen.queryByRole("dialog", { name: "添加插件市场" })).not.toBeInTheDocument();
  });

  it("切换到技能页并展示已安装技能", async () => {
    mockApi();
    renderView();
    fireEvent.click(screen.getByRole("tab", { name: "技能" }));

    expect(await screen.findByRole("heading", { name: "技能", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("通过任务专用技能扩展 Codex")).toBeInTheDocument();
    expect(await screen.findAllByText("Automate")).not.toHaveLength(0);
    expect(screen.getAllByText("Create Codex Automations.").length).toBeGreaterThan(0);
  });

  it("技能分类：系统 / 推荐", async () => {
    mockApi();
    renderView();
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
    fireEvent.click(screen.getByRole("tab", { name: "技能" }));
    const cards = await screen.findAllByText("Automate");
    fireEvent.click(cards[0].closest("button")!);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("# Automate")).toBeInTheDocument();
  });

  it("设置按钮打开插件设置", () => {
    mockApi();
    renderView();
    fireEvent.click(screen.getByLabelText("插件设置"));
    expect(useShellStore.getState().settingsOpen).toBe(true);
  });
});
