import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { PrView } from "./PrView";
import * as api from "../lib/api";

afterEach(() => {
  vi.restoreAllMocks();
});

const PRS = {
  prs: [
    {
      id: "42",
      title: "feat: shell redesign",
      meta: "#42 · open",
      tabs: ["all", "mine", "review"],
      body: "将运维面板重构为 IDE 壳层。",
      status: "open",
      url: "https://github.com/x/y/pull/42",
      branch: "feat/shell",
      default_branch: "dev",
      files: [
        { file: "web/src/App.tsx", additions: 12, deletions: 4 },
        { file: "web/src/index.css", additions: 20, deletions: 0 },
      ],
    },
    {
      id: "41",
      title: "chore: bundle gate",
      meta: "#41 · merged",
      tabs: ["all", "mine"],
      body: "构建后检查主包体积上限。",
      status: "merged",
      branch: "chore/gate",
      default_branch: "dev",
      files: [],
    },
    {
      id: "40",
      title: "review needed",
      meta: "#40 · review",
      tabs: ["all", "review"],
      body: "等待审查。",
      status: "review",
      branch: "wip/x",
      default_branch: "dev",
    },
  ],
};

function mockApi() {
  return vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
    if (path === "/prs") return PRS as never;
    return {} as never;
  });
}

/** 标题同时出现在列表项与默认详情面板,用 getAllByText 以避开歧义。 */
function listText(text: string) {
  return screen.queryAllByText(text);
}

describe("PrView", () => {
  it("渲染 PR 列表与状态徽章", async () => {
    mockApi();
    render(<PrView />);
    await screen.findByText("将运维面板重构为 IDE 壳层。");
    expect(listText("feat: shell redesign").length).toBe(2); // 列表 + 详情
    expect(listText("chore: bundle gate").length).toBe(1);
    expect(screen.getByText("正在审查")).toBeInTheDocument();
  });

  it("搜索只匹配 title/meta,不再把 tab 混入过滤(回归锁定 bug 修复)", async () => {
    mockApi();
    render(<PrView />);
    await screen.findByText("将运维面板重构为 IDE 壳层。");

    fireEvent.change(screen.getByLabelText("搜索 Pull Request"), { target: { value: "bundle" } });
    // 过滤后详情默认选中第一条命中项,故 bundle gate 同时出现在列表与详情。
    expect(listText("chore: bundle gate").length).toBe(2);
    expect(listText("feat: shell redesign").length).toBe(0);
    expect(listText("review needed").length).toBe(0);
  });

  it("tab 筛选只显示对应条目", async () => {
    mockApi();
    render(<PrView />);
    await screen.findByText("将运维面板重构为 IDE 壳层。");

    fireEvent.click(screen.getByRole("tab", { name: "正在审查" }));
    // 详情默认选中过滤后第一条 (feat),故 feat 出现于列表+详情。
    expect(listText("feat: shell redesign").length).toBe(2);
    expect(listText("review needed").length).toBe(1);
    expect(listText("chore: bundle gate").length).toBe(0);

    fireEvent.click(screen.getByRole("tab", { name: "由我创建" }));
    expect(listText("feat: shell redesign").length).toBe(2);
    expect(listText("chore: bundle gate").length).toBe(1);
    expect(listText("review needed").length).toBe(0);
  });

  it("默认显示第一条 PR 详情", async () => {
    mockApi();
    render(<PrView />);
    expect(await screen.findByText("将运维面板重构为 IDE 壳层。")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "feat: shell redesign" })).toBeInTheDocument();
  });

  it("点击列表切换详情", async () => {
    mockApi();
    render(<PrView />);
    await screen.findByText("将运维面板重构为 IDE 壳层。");

    const listPane = document.querySelector(".pr-list-body") as HTMLElement;
    fireEvent.click(within(listPane).getByText("chore: bundle gate"));
    expect(await screen.findByText("构建后检查主包体积上限。")).toBeInTheDocument();
  });

  it("详情渲染文件变更列表 (+/- 行数)", async () => {
    mockApi();
    render(<PrView />);
    await screen.findByText("将运维面板重构为 IDE 壳层。");

    expect(screen.getByText("web/src/App.tsx")).toBeInTheDocument();
    expect(screen.getByText("+12")).toBeInTheDocument();
    expect(screen.getByText("-4")).toBeInTheDocument();
    expect(screen.getByText("web/src/index.css")).toBeInTheDocument();
    expect(screen.getByText("+20")).toBeInTheDocument();
  });

  it("无 files 时不渲染文件区", async () => {
    mockApi();
    render(<PrView />);
    await screen.findByText("将运维面板重构为 IDE 壳层。");

    const listPane = document.querySelector(".pr-list-body") as HTMLElement;
    fireEvent.click(within(listPane).getByText("chore: bundle gate"));
    expect(await screen.findByText("构建后检查主包体积上限。")).toBeInTheDocument();
    expect(screen.queryByText("web/src/App.tsx")).not.toBeInTheDocument();
  });

  it("详情展示 branch 与 default_branch", async () => {
    mockApi();
    render(<PrView />);
    await screen.findByText("将运维面板重构为 IDE 壳层。");
    expect(screen.getByText("分支 feat/shell")).toBeInTheDocument();
    expect(screen.getByText("目标 dev")).toBeInTheDocument();
  });

  it("有 url 时显示 GitHub 外链", async () => {
    mockApi();
    render(<PrView />);
    await screen.findByText("将运维面板重构为 IDE 壳层。");
    const link = screen.getByRole("link", { name: /在 GitHub 查看/ });
    expect(link).toHaveAttribute("href", "https://github.com/x/y/pull/42");
  });

  it("空列表显示未找到提示", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({ prs: [] } as never);
    render(<PrView />);
    expect(await screen.findByText("未找到 Pull Request")).toBeInTheDocument();
  });

  it("加载失败显示错误", async () => {
    vi.spyOn(api, "apiFetch").mockRejectedValue(new Error("boom"));
    render(<PrView />);
    expect(await screen.findByText(/加载失败：boom/)).toBeInTheDocument();
  });
});
