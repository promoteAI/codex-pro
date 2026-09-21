import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ComposerAddMenu } from "./ComposerAddMenu";
import { useAuthStore } from "../stores/auth";
import { useChatStore } from "../stores/chat";
import { toast } from "../stores/toast";
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

beforeEach(() => {
  useAuthStore.setState({ token: "" });
  useChatStore.setState({ pendingAttachments: [] });
  vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
    if (path === "/agents") return { agents: AGENTS, total: 1 } as never;
    if (path.startsWith("/agents/")) return { status: "deleted" } as never;
    return {} as never;
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function renderMenu() {
  const anchor = document.createElement("button");
  document.body.appendChild(anchor);
  const onClose = vi.fn();
  const onOpenProject = vi.fn();
  const onGoal = vi.fn();
  const onPlan = vi.fn();
  const view = render(
    <ComposerAddMenu
      open
      anchorEl={anchor}
      onClose={onClose}
      onOpenProject={onOpenProject}
      onGoal={onGoal}
      onPlan={onPlan}
    />,
  );
  return { onClose, onOpenProject, onGoal, onPlan, ...view };
}

describe("ComposerAddMenu", () => {
  it("渲染分区与插件项", async () => {
    renderMenu();
    expect(screen.getByRole("menu", { name: "添加" })).toBeInTheDocument();
    expect(screen.getByText("文件和文件夹")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("Superpowers")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Agnes 2.0 Flash")).toBeInTheDocument();
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

  it("点击智能体条目点击时 toast", async () => {
    renderMenu();
    await waitFor(() => {
      expect(screen.getByText("Agnes 2.0 Flash")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Agnes 2.0 Flash"));
    expect(toast.info).toHaveBeenCalledWith("Agnes 2.0 Flash");
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
});
