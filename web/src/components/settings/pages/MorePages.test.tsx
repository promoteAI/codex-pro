import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ArchivedPage } from "./MorePages";
import * as api from "../../../lib/api";
import { useToastStore } from "../../../stores/toast";

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function archSessions() {
  return {
    sessions: [
      { key: "cli:a", title: "打包脚本", project: "codex-pro", updated_at: "2026-07-27T09:00:00Z" },
      { key: "cli:b", title: "本地配置", project: "", updated_at: "2026-07-27T08:00:00Z" },
    ],
    total: 2,
  } as never;
}

function mockApi() {
  return vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
    if (path.startsWith("/sessions?archived=true")) return archSessions();
    return {} as never;
  });
}

describe("ArchivedPage", () => {
  it("从后端拉取归档会话并按项目分组渲染", async () => {
    mockApi();
    render(<ArchivedPage />);

    expect(await screen.findByText("打包脚本")).toBeInTheDocument();
    expect(screen.getByText("本地配置")).toBeInTheDocument();
    // 有项目的会话归入项目组,无项目的归入「无项目」组。项目名同时出现在
    // 分组标题和项目筛选下拉中,因此用 getAllByText 断言其存在。
    expect(screen.getAllByText("codex-pro").length).toBeGreaterThan(0);
    expect(screen.getAllByText("无项目").length).toBeGreaterThan(0);
  });

  it("取消归档调用 POST /sessions/{key}/unarchive 并把该会话移出列表", async () => {
    const spy = mockApi();
    render(<ArchivedPage />);

    // 两个会话各有一个「取消归档」按钮。
    const unarchiveBtns = await screen.findAllByText("取消归档");
    expect(unarchiveBtns).toHaveLength(2);
    fireEvent.click(unarchiveBtns[0]);

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith("/sessions/cli%3Aa/unarchive", { method: "POST" }),
    );
    await waitFor(() => expect(screen.queryByText("打包脚本")).not.toBeInTheDocument());
    // 另一个会话仍在。
    expect(screen.getByText("本地配置")).toBeInTheDocument();
  });

  it("删除调用 DELETE /sessions/{key} 并把该会话移出列表", async () => {
    const spy = mockApi();
    render(<ArchivedPage />);

    const deleteBtns = await screen.findAllByLabelText("删除");
    expect(deleteBtns).toHaveLength(2);
    fireEvent.click(deleteBtns[0]);

    await waitFor(() => expect(spy).toHaveBeenCalledWith("/sessions/cli%3Aa", { method: "DELETE" }));
    await waitFor(() => expect(screen.queryByText("打包脚本")).not.toBeInTheDocument());
  });

  it("全部删除对每个归档会话调用 DELETE 并清空列表", async () => {
    const spy = mockApi();
    render(<ArchivedPage />);

    fireEvent.click(await screen.findByText("全部删除"));

    await waitFor(() => {
      const deletes = spy.mock.calls
        .filter((c) => c[1]?.method === "DELETE")
        .map((c) => c[0]);
      expect(deletes).toContain("/sessions/cli%3Aa");
      expect(deletes).toContain("/sessions/cli%3Ab");
    });
    await waitFor(() => expect(screen.queryByText("打包脚本")).not.toBeInTheDocument());
  });

  it("加载失败时显示错误信息", async () => {
    vi.spyOn(api, "apiFetch").mockRejectedValue(new Error("boom"));
    render(<ArchivedPage />);

    expect(await screen.findByText(/加载归档失败/)).toBeInTheDocument();
  });

  it("没有归档会话时显示空状态", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({ sessions: [], total: 0 } as never);
    render(<ArchivedPage />);

    expect(await screen.findByText("没有已归档的聊天")).toBeInTheDocument();
  });
});
