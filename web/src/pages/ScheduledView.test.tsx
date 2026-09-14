import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ScheduledView } from "./ScheduledView";
import { ConfirmProvider } from "../components/ConfirmDialog";
import * as api from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { cronToLabel, freqToCron, cronToFreq } from "./scheduledFreq";

const JOB = {
  id: "j1",
  name: "Codex-Pro 竞品研究与迭代开发",
  cron_expr: "0 * * * *",
  enabled: false,
  status: "paused",
  last_status: "",
  next_run_ms: null,
  payload: { command: "持续改进 codex-pro" },
};

function mockApi(overrides: Record<string, unknown> = {}) {
  return vi.spyOn(api, "apiFetch").mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/cron" && (!init?.method || init.method === "GET")) {
      return { jobs: [JOB] } as never;
    }
    if (path === "/cron" && init?.method === "POST") {
      return { id: "new-1" } as never;
    }
    if (path === "/cron/j1/runs?limit=20") {
      return { runs: [] } as never;
    }
    if (path in overrides) return overrides[path] as never;
    return {} as never;
  });
}

function renderView() {
  return render(
    <MemoryRouter>
      <ConfirmProvider>
        <ScheduledView />
      </ConfirmProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuthStore.setState({ token: "" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("scheduledFreq helpers", () => {
  it("maps hourly cron to label", () => {
    expect(cronToLabel("0 * * * *")).toBe("每小时");
  });

  it("builds weekday cron from frequency", () => {
    expect(freqToCron({
      repeat: "工作日",
      unit: "每周",
      interval: "1 周",
      weekday: "星期一",
      time: "08:00",
      notify: "所有运行",
      project: "codex-pro",
      model: "x",
      reasoning: "轻度",
    })).toBe("0 8 * * 1-5");
  });

  it("parses daily cron into frequency state", () => {
    const f = cronToFreq("30 20 * * *");
    expect(f.repeat).toBe("每天");
    expect(f.time).toBe("20:30");
  });
});

describe("ScheduledView", () => {
  it("渲染标题、筛选与任务列表", async () => {
    mockApi();
    renderView();

    expect(await screen.findByRole("heading", { name: "已安排的任务" })).toBeInTheDocument();
    expect(screen.getByText("Codex-Pro 竞品研究与迭代开发")).toBeInTheDocument();
    expect(screen.getByText("每小时")).toBeInTheDocument();
    expect(screen.getByText("每日简报")).toBeInTheDocument();
  });

  it("点击任务打开详情面板", async () => {
    mockApi();
    renderView();

    fireEvent.click(await screen.findByText("Codex-Pro 竞品研究与迭代开发"));

    const detail = await screen.findByLabelText("任务详情");
    expect(within(detail).getByText("已暂停")).toBeInTheDocument();
    expect(within(detail).getByLabelText("任务提示词")).toHaveValue("持续改进 codex-pro");
    expect(within(detail).getByText("运行历史记录")).toBeInTheDocument();
  });

  it("筛选已开启时隐藏已暂停任务", async () => {
    mockApi();
    renderView();
    await screen.findByText("Codex-Pro 竞品研究与迭代开发");

    fireEvent.click(screen.getByRole("button", { name: "已开启" }));

    expect(screen.queryByText("Codex-Pro 竞品研究与迭代开发")).not.toBeInTheDocument();
    expect(screen.getByText("暂无已安排任务")).toBeInTheDocument();
  });

  it("创建菜单可新建任务并打开详情", async () => {
    mockApi();
    renderView();
    await screen.findByText("已安排的任务");

    fireEvent.click(screen.getByRole("button", { name: /创建/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /手动设置/ }));

    await waitFor(() => {
      expect(api.apiFetch).toHaveBeenCalledWith(
        "/cron",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("删除确认框可取消", async () => {
    mockApi();
    renderView();
    const task = await screen.findByText("Codex-Pro 竞品研究与迭代开发");
    const row = task.closest(".sch-task")!;
    fireEvent.click(within(row as HTMLElement).getByLabelText("更多"));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除" }));

    expect(screen.getByText(/删除 Codex-Pro/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByText(/这将永久删除/)).not.toBeInTheDocument();
  });
});
