import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ComposerAddMenu } from "./ComposerAddMenu";
import { useAuthStore } from "../stores/auth";
import { toast } from "../stores/toast";

vi.mock("../stores/toast", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  useAuthStore.setState({ token: "" });
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderMenu() {
  const anchor = document.createElement("button");
  document.body.appendChild(anchor);
  const onClose = vi.fn();
  const onOpenProject = vi.fn();
  const onGoal = vi.fn();
  const onPlan = vi.fn();
  render(
    <ComposerAddMenu
      open
      anchorEl={anchor}
      onClose={onClose}
      onOpenProject={onOpenProject}
      onGoal={onGoal}
      onPlan={onPlan}
    />,
  );
  return { onClose, onOpenProject, onGoal, onPlan };
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

  it("文件和文件夹 toast", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /文件和文件夹/ }));
    expect(toast.info).toHaveBeenCalled();
  });
});
