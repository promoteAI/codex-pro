import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProjectMenu } from "./ProjectMenu";
import { useShellStore } from "../stores/shell";
import { useAuthStore } from "../stores/auth";
import { toast } from "../stores/toast";

vi.mock("../stores/toast", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  useAuthStore.setState({ token: "" });
  useShellStore.setState({ remoteConnectOpen: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderMenu(overrides: Partial<Parameters<typeof ProjectMenu>[0]> = {}) {
  const anchor = document.createElement("button");
  document.body.appendChild(anchor);
  const onClose = vi.fn();
  const onSelect = vi.fn();
  render(
    <ProjectMenu
      open
      anchorEl={anchor}
      project="codex-pro"
      repos={[]}
      onSelect={onSelect}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onClose, onSelect, anchor };
}

describe("ProjectMenu", () => {
  it("渲染工作区列表与操作项", () => {
    renderMenu();
    expect(screen.getByRole("menu", { name: "选择工作区" })).toBeInTheDocument();
    expect(screen.getByText("codex-pro")).toBeInTheDocument();
    expect(screen.getByText("m-askkb")).toBeInTheDocument();
    expect(screen.getByText("DeepTutor")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /打开文件夹/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /远程连接/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /不在项目中工作/ })).toBeInTheDocument();
  });

  it("选择工作区", () => {
    const { onSelect, onClose } = renderMenu();
    fireEvent.click(screen.getByText("DeepTutor"));
    expect(onSelect).toHaveBeenCalledWith("DeepTutor");
    expect(onClose).toHaveBeenCalled();
  });

  it("不在项目中工作清空选择", () => {
    const { onSelect, onClose } = renderMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /不在项目中工作/ }));
    expect(onSelect).toHaveBeenCalledWith("");
    expect(onClose).toHaveBeenCalled();
  });

  it("远程连接打开 RemoteConnectModal", () => {
    const { onClose } = renderMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /远程连接/ }));
    expect(onClose).toHaveBeenCalled();
    expect(useShellStore.getState().remoteConnectOpen).toBe(true);
  });

  it("打开文件夹提示 toast", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /打开文件夹/ }));
    expect(toast.info).toHaveBeenCalled();
  });

  it("搜索过滤工作区", () => {
    renderMenu();
    fireEvent.change(screen.getByLabelText("搜索工作区"), { target: { value: "deep" } });
    expect(screen.getByText("DeepTutor")).toBeInTheDocument();
    expect(screen.queryByText("codex-pro")).not.toBeInTheDocument();
  });
});
