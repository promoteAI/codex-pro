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

const AGENTS = [
  {
    id: "coder",
    name: "Agnes 2.0 Flash",
    description: "CCSwitchMulti managed worker pinned to 'agnes-2.0-flash'.",
    instructions: "",
    default_tools: [],
    model: "",
    provider: "",
    max_iterations: 12,
    max_tokens: 8192,
    temperature: 0.4,
  },
];

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
    if (path === "/agents") return { agents: AGENTS, total: 1 } as never;
    if (path.startsWith("/agents/")) return { status: "deleted" } as never;
    if (path === "/plugins") return { ...PLUGINS } as never;
    return {} as never;
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function renderMenu({ navigateRoot = false } = {}) {
  const anchor = document.createElement("button");
  document.body.appendChild(anchor);
  const onClose = vi.fn();
  const onOpenProject = vi.fn();
  const onGoal = vi.fn();
  const onPlan = vi.fn();
  const menu = (
    <ComposerAddMenu
      open
      anchorEl={anchor}
      onClose={onClose}
      onOpenProject={onOpenProject}
      onGoal={onGoal}
      onPlan={onPlan}
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
  return { onClose, onOpenProject, onGoal, onPlan };
}

describe("ComposerAddMenu", () => {
  it("渲染分区与来自 /plugins 的插件项", async () => {
    renderMenu();
    expect(screen.getByRole("menu", { name: "添加" })).toBeInTheDocument();
    expect(screen.getByText("文件和文件夹")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("documents")).toBeInTheDocument();
      expect(screen.getByText("Create and edit documents")).toBeInTheDocument();
    });
    expect(screen.getByText("Superpowers")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Agnes 2.0 Flash")).toBeInTheDocument();
    });
  });

  it("插件列表为空时显示占位", async () => {
    vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/plugins") return { plugins: [] } as never;
      return {} as never;
    });
    renderMenu();
    await waitFor(() => {
      expect(screen.getByText("没有可用插件")).toBeInTheDocument();
    });
  });

  it("目标模式回调", async () => {
    const { onGoal, onClose } = renderMenu();
    await screen.findByText("Agnes 2.0 Flash");
    fireEvent.click(screen.getByRole("menuitem", { name: /目标/ }));
    expect(onGoal).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("计划模式回调", async () => {
    const { onPlan, onClose } = renderMenu();
    await screen.findByText("Agnes 2.0 Flash");
    fireEvent.click(screen.getByRole("menuitem", { name: /计划模式/ }));
    expect(onPlan).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("在项目中使用 Work 打开项目菜单", async () => {
    const { onOpenProject, onClose } = renderMenu();
    await screen.findByText("Agnes 2.0 Flash");
    fireEvent.click(screen.getByRole("menuitem", { name: /在项目中使用 Work/ }));
    expect(onOpenProject).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("文件和文件夹触发文件选择并关闭菜单", () => {
    const { onClose } = renderMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /文件和文件夹/ }));
    expect(onClose).toHaveBeenCalled();
    expect(document.body.querySelector('input[type="file"]')).toBeTruthy();
  });

  it("选择文件后调用 addFile 上传", () => {
    const addFile = vi
      .spyOn(useChatStore.getState(), "addFile")
      .mockResolvedValue(undefined);
    renderMenu();
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(addFile).toHaveBeenCalledWith(file);
  });

  it("删除智能体调用 DELETE /agents/{id}", async () => {
    renderMenu();
    await waitFor(() => {
      expect(screen.getByText("Agnes 2.0 Flash")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /删除智能体/ }));
    await waitFor(() => {
      expect(api.apiFetch).toHaveBeenCalledWith(
        "/agents/coder",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("添加智能体表单提交 POST /agents", async () => {
    renderMenu();
    await screen.findByText("Agnes 2.0 Flash");
    fireEvent.click(screen.getByRole("menuitem", { name: /添加智能体/ }));
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "planner" } });
    fireEvent.change(inputs[1], { target: { value: "Planner" } });
    fireEvent.click(screen.getByRole("button", { name: /创建/ }));
    await waitFor(() => {
      expect(api.apiFetch).toHaveBeenCalledWith(
        "/agents",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"id":"planner"'),
        }),
      );
    });
  });

  it("点击插件项跳转到插件管理页并关闭菜单", async () => {
    renderMenu({ navigateRoot: true });
    await waitFor(() => {
      expect(screen.getByText("documents")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("menuitem", { name: /documents/ }));
    await waitFor(() => {
      expect(screen.getByText("PLUGINS_PAGE")).toBeInTheDocument();
    });
  });
});
