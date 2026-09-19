import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as api from "../../lib/api";
import { useShellStore } from "../../stores/shell";
import { SideFilesPanel } from "./SideFilesPanel";
import type { GitRepo } from "../../stores/chat";

const REPO: GitRepo = {
  path: "/ws/workspace/myrepo",
  name: "myrepo",
  current_branch: "dev",
};

const ENTRIES = {
  entries: [
    { path: "src", kind: "dir", icon: null },
    { path: "README.md", kind: "file", icon: "M", ext: "md" },
  ],
};

function mockApi() {
  return vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
    if (path.includes("/files/content?")) {
      return {
        path: "README.md",
        name: "README.md",
        content: "hello world",
        size: 11,
        truncated: false,
      } as never;
    }
    if (path.includes("/files?")) return ENTRIES as never;
    return {} as never;
  });
}

function renderPanel(onBack = vi.fn()) {
  return render(<SideFilesPanel repo={REPO} onBack={onBack} />);
}

beforeEach(() => {
  vi.restoreAllMocks();
  useShellStore.setState({ sessionTabs: [], activeTabId: null });
});

afterEach(() => {
  vi.restoreAllMocks();
  useShellStore.setState({ sessionTabs: [], activeTabId: null });
});

describe("SideFilesPanel", () => {
  it("加载仓库根目录并渲染目录树", async () => {
    mockApi();
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument();
    });
    expect(screen.getByText("README.md")).toBeInTheDocument();
  });

  it("点击文件时创建带 filePath 的 session tab", async () => {
    mockApi();
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("README.md")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("README.md"));
    await waitFor(() => {
      const state = useShellStore.getState();
      const tab = state.sessionTabs.find((t) => t.filePath);
      expect(tab).toBeDefined();
      expect(tab!.filePath).toEqual({ repoPath: REPO.path, filePath: "README.md" });
      expect(tab!.label).toBe("README.md");
      expect(state.activeToolPane).toBe("files");
    });
  });

  it("多次点击不同文件时打开多个标签页", async () => {
    const ENTRIES = {
      entries: [
        { path: "README.md", kind: "file", icon: "M", ext: "md" },
        { path: "src/main.ts", kind: "file", icon: "T", ext: "ts" },
        { path: "package.json", kind: "file", icon: "J", ext: "json" },
      ],
    };
    const spy = mockApi();
    spy.mockImplementation(async (path: string) => {
      if (path.includes("/files/content?")) {
        const match = ENTRIES.entries.find(
          (e) => `${encodeURIComponent(REPO.path)}/${encodeURIComponent(e.path)}` === path.split("path=")[1],
        );
        return {
          path: match!.path,
          name: match!.path.split("/").pop()!,
          content: "content",
          size: 7,
          truncated: false,
        } as never;
      }
      if (path.includes("/files?")) return ENTRIES as never;
      return {} as never;
    });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("README.md")).toBeInTheDocument();
    });

    // 第一次点击
    fireEvent.click(screen.getByText("README.md"));
    // 第二次点击
    fireEvent.click(screen.getByText("main.ts"));
    // 第三次点击
    fireEvent.click(screen.getByText("package.json"));

    await waitFor(() => {
      const state = useShellStore.getState();
      const fileTabs = state.sessionTabs.filter((t) => t.type === "files" && t.filePath);
      expect(fileTabs).toHaveLength(3);
      expect(fileTabs.map((t) => t.label)).toContain("README.md");
      expect(fileTabs.map((t) => t.label)).toContain("main.ts");
      expect(fileTabs.map((t) => t.label)).toContain("package.json");
    });
  });

  it("点击返回按钮触发 onBack", async () => {
    mockApi();
    const onBack = vi.fn();
    renderPanel(onBack);
    await waitFor(() => {
      expect(screen.getByText("README.md")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText("返回"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
