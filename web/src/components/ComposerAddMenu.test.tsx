import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ComposerAddMenu } from "./ComposerAddMenu";
import { useAuthStore } from "../stores/auth";
import { useChatStore } from "../stores/chat";

vi.mock("../stores/toast", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  useAuthStore.setState({ token: "" });
  useChatStore.setState({ pendingAttachments: [] });
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
  it("渲染分区与插件项", () => {
    renderMenu();
    expect(screen.getByRole("menu", { name: "添加" })).toBeInTheDocument();
    expect(screen.getByText("文件和文件夹")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("Superpowers")).toBeInTheDocument();
    expect(screen.getByText("Agnes 2.0 Flash")).toBeInTheDocument();
  });

  it("目标模式回调", () => {
    const { onGoal, onClose } = renderMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /目标/ }));
    expect(onGoal).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("计划模式回调", () => {
    const { onPlan, onClose } = renderMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /计划模式/ }));
    expect(onPlan).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("在项目中使用 Work 打开项目菜单", () => {
    const { onOpenProject, onClose } = renderMenu();
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
});
