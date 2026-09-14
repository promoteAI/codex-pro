import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { McpCreateView } from "./McpCreateView";
import { toast } from "../stores/toast";

vi.mock("../stores/toast", () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("McpCreateView", () => {
  it("取消回调", () => {
    const onCancel = vi.fn();
    render(<McpCreateView onCancel={onCancel} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("空名称不可保存", () => {
    const onSaved = vi.fn();
    render(<McpCreateView onCancel={vi.fn()} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onSaved).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith("请填写名称");
  });

  it("表单保存成功", () => {
    const onSaved = vi.fn();
    render(<McpCreateView onCancel={vi.fn()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "memory" } });
    fireEvent.change(screen.getByLabelText("命令"), { target: { value: "npx" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onSaved).toHaveBeenCalledWith("memory");
    expect(toast.success).toHaveBeenCalledWith("已添加 MCP：memory");
  });

  it("可切换 JSON 视图并保存", () => {
    const onSaved = vi.fn();
    render(<McpCreateView onCancel={vi.fn()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "fs" } });
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    expect(screen.getByLabelText("完整配置")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onSaved).toHaveBeenCalledWith("fs");
  });
});
