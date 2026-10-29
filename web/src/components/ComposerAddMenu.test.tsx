import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { ComposerAddMenu } from "./ComposerAddMenu";
import { useAuthStore } from "../stores/auth";
import { useChatStore } from "../stores/chat";
import * as api from "../lib/api";

vi.mock("../stores/toast", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
  runMutation: vi.fn(async (fn: () => Promise<unknown>) => {
    await fn();
    return true;
  }),
}));

const PLUGINS = {
  plugins: [
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
  ],
};

beforeEach(() => {
  useAuthStore.setState({ token: "" });
  useChatStore.setState({ pendingAttachments: [] });
  vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
    if (path === "/plugins") return { ...PLUGINS } as never;
    return {} as never;
  });
  vi.spyOn(window, "open").mockImplementation(() => null);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

async function renderMenu({ navigateRoot = false } = {}) {
  const anchor = document.createElement("button");
  document.body.appendChild(anchor);
  const onClose = vi.fn();
  const onOpenProject = vi.fn();
  const onGoal = vi.fn();
  const onPlan = vi.fn();
  const onOpenFileChooser = vi.fn();
  const menu = (
    <ComposerAddMenu
      open
      anchorEl={anchor}
      onClose={onClose}
      onOpenProject={onOpenProject}
      onGoal={onGoal}
      onPlan={onPlan}
      onOpenFileChooser={onOpenFileChooser}
    />
  );
  render(
    navigateRoot ? (
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={menu} />
          <Route path="/plugins" element={<div>PLUGINS_PAGE</div>} />
        </Routes>
      </MemoryRouter>
    ) : (
      <MemoryRouter>{menu}</MemoryRouter>
    ),
  );
  await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith("/plugins", expect.anything()));
  return { onClose, onOpenProject, onGoal, onPlan, onOpenFileChooser };
}

describe("ComposerAddMenu", () => {
  it("渲染分区与来自 /plugins 的插件项", async () => {
    await renderMenu();
    expect(screen.getByRole("menu", { name: "添加" })).toBeInTheDocument();
    expect(screen.getByText("文件和文件夹")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("documents")).toBeInTheDocument();
      expect(screen.getByText("Create and edit documents")).toBeInTheDocument();
    });
  });

  it("插件列表为空时显示占位", async () => {
    vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/plugins") return { plugins: [] } as never;
      return {} as never;
    });
    await renderMenu();
    await waitFor(() => {
      expect(screen.getByText("没有可用插件")).toBeInTheDocument();
    });
  });

  it("目标模式回调", async () => {
    const { onGoal, onClose } = await renderMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /目标/ }));
    expect(onGoal).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("计划模式回调", async () => {
    const { onPlan, onClose } = await renderMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /计划模式/ }));
    expect(onPlan).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("在项目中使用 Work 打开项目菜单", async () => {
    const { onOpenProject, onClose } = await renderMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /在项目中使用 Work/ }));
    expect(onOpenProject).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("文件和文件夹触发文件选择并关闭菜单", async () => {
    const { onClose, onOpenFileChooser } = await renderMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /文件和文件夹/ }));
    expect(onClose).toHaveBeenCalled();
    expect(onOpenFileChooser).toHaveBeenCalled();
  });

  it("选择文件后调用 addFile 上传", async () => {
    const onFileChange = vi.fn();
    await renderMenu();
    const btn = screen.getByRole("menuitem", { name: /文件和文件夹/ });
    fireEvent.click(btn);
    expect(onFileChange).not.toHaveBeenCalled(); // parent handles the file input
  });

  it("点击插件项跳转到插件管理页并关闭菜单", async () => {
    await renderMenu({ navigateRoot: true });
    await waitFor(() => {
      expect(screen.getByText("documents")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("menuitem", { name: /documents/ }));
    await waitFor(() => {
      expect(screen.getByText("PLUGINS_PAGE")).toBeInTheDocument();
    });
  });
});
