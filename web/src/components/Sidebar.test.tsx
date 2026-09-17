import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Sidebar } from "./Sidebar";
import * as api from "../lib/api";
import { useChatStore } from "../stores/chat";

describe("Sidebar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("默认中文渲染菜单", () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText("新对话")).toBeInTheDocument();
  });

  it("账户菜单可打开并包含使用统计/设置", async () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText("账户"));
    await waitFor(() => expect(screen.getByText("使用统计")).toBeInTheDocument());
    expect(screen.getByText("设置")).toBeInTheDocument();
    expect(screen.queryByText("远程连接")).not.toBeInTheDocument();
  });

  it("使用统计与设置带快捷键标注", async () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText("账户"));
    await waitFor(() => expect(screen.getByText("使用统计")).toBeInTheDocument());
    expect(screen.getByText(/Alt\+Win\+P|⌥⌘P/)).toBeInTheDocument();
    expect(screen.getByText(/Ctrl\+,|⌘,/)).toBeInTheDocument();
  });

  it("项目行下的会话按 project 归组展示", async () => {
    const repoPath = "e:\\workspace\\codex-pro";
    vi.spyOn(api, "apiFetch").mockImplementation(async (path) => {
      if (String(path) === "/git/repos") {
        return { repos: [{ path: repoPath, name: "codex-pro", current_branch: "dev" }] };
      }
      if (String(path).startsWith("/sessions")) {
        return {
          sessions: [
            {
              key: "cli:web:123",
              title: "项目下的会话",
              message_count: 2,
              updated_at: "2026-01-01T00:00:00",
              project: repoPath,
            },
          ],
        };
      }
      throw new Error(`unexpected path ${path}`);
    });
    useChatStore.setState({
      repos: [{ path: repoPath, name: "codex-pro", current_branch: "dev" }],
      project: "codex-pro",
      projectPath: repoPath,
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    // 该项目有会话，标题应渲染在项目行下。
    await waitFor(() => expect(screen.getByText("项目下的会话")).toBeInTheDocument());
    expect(screen.getAllByText("项目下的会话")).toHaveLength(1);
  });

  it("无 project 的旧会话显示在最近列表", async () => {
    const repoPath = "e:\\workspace\\codex-pro";
    vi.spyOn(api, "apiFetch").mockImplementation(async (path) => {
      if (String(path) === "/git/repos") {
        return { repos: [{ path: repoPath, name: "codex-pro", current_branch: "dev" }] };
      }
      if (String(path).startsWith("/sessions")) {
        return {
          sessions: [
            {
              key: "cli:web:old",
              title: "旧的无项目会话",
              message_count: 2,
              updated_at: "2026-01-01T00:00:00",
            },
          ],
        };
      }
      throw new Error(`unexpected path ${path}`);
    });
    useChatStore.setState({
      repos: [{ path: repoPath, name: "codex-pro", current_branch: "dev" }],
      project: "codex-pro",
      projectPath: repoPath,
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    // 无 project 的会话显示在「最近」列表（它不归到任何项目行）。
    await waitFor(() => expect(screen.getByText("旧的无项目会话")).toBeInTheDocument());
    expect(screen.getByText("最近")).toBeInTheDocument();
  });
});
