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
  useShellStore.setState({ pendingFilePath: null });
});

afterEach(() => {
  vi.restoreAllMocks();
  useShellStore.setState({ pendingFilePath: null });
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

  it("点击文件时设置 pendingFilePath", async () => {
    mockApi();
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("README.md")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("README.md"));
    await waitFor(() => {
      const state = useShellStore.getState();
      expect(state.pendingFilePath).toEqual({ repoPath: REPO.path, filePath: "README.md" });
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
