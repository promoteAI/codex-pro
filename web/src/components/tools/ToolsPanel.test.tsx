import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToolsPanel } from "./ToolsPanel";
import { useShellStore } from "../../stores/shell";
import { useChatStore } from "../../stores/chat";
import { apiFetch } from "../../lib/api";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

const mockApi = vi.mocked(apiFetch);

interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  diff: string;
}
interface DiffResponse {
  base: string;
  branch: string;
  files: DiffFile[];
}

const DIFF_RESPONSE = {
  base: "master",
  branch: "dev",
  files: [
    {
      path: "web/src/App.tsx",
      additions: 2,
      deletions: 1,
      diff: "--- a/web/src/App.tsx\n+++ b/web/src/App.tsx\n@@ -1 +1 @@\n-import { Overview } from \"./pages/Overview\";\n+import { HomeView } from \"./pages/HomeView\";",
    },
    {
      path: "docs/design/index.html",
      additions: 4,
      deletions: 0,
      diff: "--- a/docs/design/index.html\n+++ b/docs/design/index.html\n@@ -1,1 +1,1 @@\n+<title>Codex</title>",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  useShellStore.setState({
    toolsOpen: true,
    activeToolPane: "review",
    sessionTabs: [{ id: "review-1", type: "review", label: "审查" }],
    activeTabId: "review-1",
  });
  useChatStore.setState({ projectPath: "/ws/myproj" });
  mockApi.mockResolvedValue(DIFF_RESPONSE as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  useShellStore.setState({ toolsOpen: false, sessionTabs: [], activeTabId: null });
  useChatStore.setState({ projectPath: "" });
});

describe("ToolsPanel ReviewPane", () => {
  it("按项目路径请求真实差异并渲染文件列表", async () => {
    render(<ToolsPanel />);
    await waitFor(() => expect(mockApi).toHaveBeenCalled());
    expect(mockApi).toHaveBeenCalledWith("/git/diff?path=%2Fws%2Fmyproj", expect.anything());
    await waitFor(() =>
      expect(screen.getByText("web/src/App.tsx")).toBeInTheDocument(),
    );
  });

  it("点击文件切换差异内容", async () => {
    render(<ToolsPanel />);
    await waitFor(() =>
      expect(screen.getByText("web/src/App.tsx")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("index.html"));
    await waitFor(() =>
      expect(screen.getByText("+<title>Codex</title>")).toBeInTheDocument(),
    );
  });

  it("筛选文件列表", async () => {
    render(<ToolsPanel />);
    await waitFor(() =>
      expect(screen.getByText("web/src/App.tsx")).toBeInTheDocument(),
    );
    const input = screen.getByLabelText("筛选文件…");
    fireEvent.change(input, { target: { value: "index" } });
    expect(screen.queryByText("web/src/App.tsx")).not.toBeInTheDocument();
    expect(screen.getByText("docs/design/index.html")).toBeInTheDocument();
  });

  it("加载失败时显示错误占位", async () => {
    mockApi.mockRejectedValue(new Error("boom"));
    render(<ToolsPanel />);
    await waitFor(() =>
      expect(screen.getByText("无法加载差异")).toBeInTheDocument(),
    );
  });

  it("快速切换项目时,慢的旧响应不覆盖当前项目数据", async () => {
    // 第一个(旧项目)请求挂起;第二个(新项目)请求立即返回。
    let resolveOld: (v: DiffResponse) => void;
    mockApi.mockImplementation((url: string) => {
      if ((url as string).includes("old")) {
        return new Promise((resolve) => { resolveOld = resolve as never; });
      }
      return Promise.resolve({
        base: "master",
        branch: "newproj",
        files: [{ path: "new/file.ts", additions: 1, deletions: 0, diff: "+new" }],
      } as never);
    });
    useChatStore.setState({ projectPath: "/ws/oldproj" });
    const { unmount } = render(<ToolsPanel />);
    // 等待旧请求已发出
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith("/git/diff?path=%2Fws%2Foldproj", expect.anything()));
    // 切换到新项目
    useChatStore.setState({ projectPath: "/ws/newproj" });
    await waitFor(() =>
      expect(screen.getByText("new/file.ts")).toBeInTheDocument(),
    );
    // 旧项目响应此刻才 resolve —— 必须被丢弃,不得覆盖新项目数据
    resolveOld!({
      base: "master",
      branch: "oldproj",
      files: [{ path: "old/file.ts", additions: 9, deletions: 9, diff: "+old" }],
    });
    await waitFor(() =>
      expect(screen.getByText("new/file.ts")).toBeInTheDocument(),
    );
    expect(screen.queryByText("old/file.ts")).not.toBeInTheDocument();
    unmount();
  });
});
