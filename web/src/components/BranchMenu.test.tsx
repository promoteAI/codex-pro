import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BranchMenu } from "./BranchMenu";
import { useAuthStore } from "../stores/auth";

beforeEach(() => {
  useAuthStore.setState({ token: "" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderMenu(overrides: Partial<Parameters<typeof BranchMenu>[0]> = {}) {
  const anchor = document.createElement("button");
  document.body.appendChild(anchor);
  const onClose = vi.fn();
  const onSelect = vi.fn();
  render(
    <BranchMenu
      open
      anchorEl={anchor}
      project="codex-pro"
      branch="dev"
      branches={[]}
      onSelect={onSelect}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onClose, onSelect, anchor };
}

describe("BranchMenu", () => {
  it("渲染分支列表与创建操作", () => {
    renderMenu();
    expect(screen.getByRole("menu", { name: "选择分支" })).toBeInTheDocument();
    expect(screen.getByText("master")).toBeInTheDocument();
    expect(screen.getByText("dev")).toBeInTheDocument();
    expect(screen.getByText("未提交: 3 个文件")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /创建并检出新分支/ })).toBeInTheDocument();
  });

  it("选择分支", () => {
    const { onSelect, onClose } = renderMenu();
    fireEvent.click(screen.getByText("master"));
    expect(onSelect).toHaveBeenCalledWith("master");
    expect(onClose).toHaveBeenCalled();
  });

  it("搜索过滤", () => {
    renderMenu();
    fireEvent.change(screen.getByLabelText("搜索分支"), { target: { value: "mas" } });
    expect(screen.getByText("master")).toBeInTheDocument();
    expect(screen.queryByText("dev")).not.toBeInTheDocument();
  });

  it("创建新分支", () => {
    const { onSelect, onClose } = renderMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /创建并检出新分支/ }));
    fireEvent.change(screen.getByLabelText("新分支名称"), { target: { value: "feature/x" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));
    expect(onSelect).toHaveBeenCalledWith("feature/x");
    expect(onClose).toHaveBeenCalled();
  });
});
