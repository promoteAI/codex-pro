import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ComposerAddMenu } from "./ComposerAddMenu";
import { useAuthStore } from "../stores/auth";
import { toast } from "../stores/toast";
import * as api from "../lib/api";

vi.mock("../stores/toast", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  useAuthStore.setState({ token: "" });
  vi.spyOn(api, "apiFetch").mockResolvedValue({ tabs: [] } as never);
  vi.spyOn(window, "open").mockImplementation(() => null);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function renderMenu() {
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
  // Flush the initial /browser/tabs fetch resolution so its state update lands
  // inside act rather than after the test body returns.
  await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith("/browser/tabs", expect.anything()));
  return { onClose, onOpenProject, onGoal, onPlan };
}

describe("ComposerAddMenu", () => {
  it("渲染分区与插件项", async () => {
    await renderMenu();
    expect(screen.getByRole("menu", { name: "添加" })).toBeInTheDocument();
    expect(screen.getByText("文件和文件夹")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("Superpowers")).toBeInTheDocument();
    expect(screen.getByText("Agnes 2.0 Flash")).toBeInTheDocument();
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

  it("文件和文件夹 toast", async () => {
    await renderMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /文件和文件夹/ }));
    expect(toast.info).toHaveBeenCalled();
  });
});

describe("ComposerAddMenu 标签页", () => {
  it("空列表显示占位并请求 /browser/tabs", async () => {
    const spy = vi.spyOn(api, "apiFetch").mockResolvedValue({ tabs: [] } as never);
    await renderMenu();
    await waitFor(() => expect(spy).toHaveBeenCalledWith("/browser/tabs", expect.anything()));
    expect(await screen.findByText("暂无标签页")).toBeInTheDocument();
  });

  it("读取真实标签页并渲染,点击打开新窗口", async () => {
    const spy = vi.spyOn(api, "apiFetch").mockResolvedValue({
      tabs: [
        { id: "t1", title: "codex", url: "https://example.com", suffix: "· Chrome" },
        { id: "t2", title: "www", url: "https://www.google.com", globe: true },
      ],
    } as never);
    const { onClose } = await renderMenu();
    expect(await screen.findByText("codex")).toBeInTheDocument();
    expect(screen.getByText("https://example.com")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /codex/ }));
    expect(window.open).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");
    expect(onClose).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith("/browser/tabs", expect.anything());
  });
});
