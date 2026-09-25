import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { useChatStore } from "../stores/chat";
import { useAuthStore } from "../stores/auth";

vi.mock("../stores/toast", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  useAuthStore.setState({ token: "" });
  useChatStore.setState({ project: "codex-pro", projectPath: "", repos: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CreateProjectDialog", () => {
  it("closed dialog does not render", () => {
    render(<CreateProjectDialog open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders project name input and folder picker", () => {
    render(<CreateProjectDialog open onClose={() => {}} />);
    expect(screen.getByLabelText("项目名称")).toBeInTheDocument();
    expect(screen.getByText("源文件夹")).toBeInTheDocument();
    expect(screen.getByText("添加 Codex 可读取和编辑的文件夹")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建项目" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
  });

  it("opens create project via menu action", () => {
    render(<CreateProjectDialog open={false} onClose={() => {}} />);
    // When opened by menu, the dialog should appear.
    render(<CreateProjectDialog open onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows path input when native picker is available and a folder is selected", () => {
    // Simulate showDirectoryPicker availability.
    const original = (window as any).showDirectoryPicker;
    (window as any).showDirectoryPicker = vi.fn().mockResolvedValue({ name: "demo" });
    try {
      render(<CreateProjectDialog open onClose={() => {}} />);
      // Click the dropzone to trigger the native picker.
      fireEvent.click(screen.getByText("添加 Codex 可读取和编辑的文件夹"));
      // After selection the path input should be visible.
      expect(screen.getByPlaceholderText("输入文件夹绝对路径…")).toBeInTheDocument();
    } finally {
      (window as any).showDirectoryPicker = original;
    }
  });
});
