import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Composer } from "./Composer";
import * as api from "../../lib/api";
import { useChatStore } from "../../stores/chat";
import { useProvidersStore } from "../../stores/providers";
import { useCapabilitiesStore } from "../../stores/capabilities";

const chatDefaults = {
  project: "",
  projectPath: "",
  env: "local",
  branch: "dev",
  model: "m",
  reasoning: 2,
  perm: "full" as const,
  draft: "",
  messages: [],
  sessionId: null,
  chatting: false,
  loadingHistory: false,
  historyError: null,
  typing: false,
  activeTool: null,
  pendingEventId: null,
  streamStopped: false,
  repos: [],
  branches: [],
  loadingBranches: false,
  planMode: false,
  goalMode: false,
  planTask: "",
  isGit: false,
};

beforeEach(() => {
  useChatStore.setState({ ...chatDefaults });
  useProvidersStore.setState({ providers: [], loading: false, activeName: null });
  useCapabilitiesStore.setState({ admin: null, authRequired: null, inflight: null, generation: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockComposerApi(responses: Record<string, unknown> = {}) {
  return vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
    if (path in responses) return responses[path] as never;
    if (path === "/providers") return { providers: [] } as never;
    if (path === "/config") return {} as never;
    if (path === "/git/repos") return { repos: [] } as never;
    if (path === "/skills") return { skills: [] } as never;
    if (path === "/plugins") return { plugins: [] } as never;
    return {} as never;
  });
}

async function renderComposer() {
  useProvidersStore.setState({ loading: true });
  const result = render(
    <MemoryRouter>
      <Composer />
    </MemoryRouter>,
  );
  await waitFor(() => expect(useProvidersStore.getState().loading).toBe(false));
  return result;
}

describe("Composer 权限下拉", () => {
  it("admin 用户选择「请求批准」时 PATCH /config 写 permissions.approval.mode", async () => {
    useCapabilitiesStore.setState({ admin: true });
    const fetchSpy = vi
      .spyOn(api, "apiFetch")
      .mockImplementation(async (path: string) => {
        if (path === "/providers") return { providers: [] } as never;
        if (path === "/config") return { success: true } as never;
        throw new Error(`unexpected ${path}`);
      });

    render(
      <MemoryRouter>
        <Composer />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /完全访问/ }));
    fireEvent.click(screen.getAllByText("请求批准", { exact: true })[0]!);

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        "/config",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ changes: { "permissions.approval.mode": "manual" } }),
        }),
      ),
    );
  });
});

describe("Composer 停止按钮", () => {
  it("typing 时渲染停止按钮，点击发送 interrupt 帧并复位 typing", async () => {
    useChatStore.setState({ typing: true, sessionId: "sess-1", pendingEventId: "evt-1" });
    const sendSpy = vi
      .spyOn(useChatStore.getState().chatWS, "send")
      .mockReturnValue(true);

    render(
      <MemoryRouter>
        <Composer />
      </MemoryRouter>,
    );

    const stopBtn = screen.getByRole("button", { name: "停止" });
    fireEvent.click(stopBtn);

    expect(sendSpy).toHaveBeenCalledWith({
      type: "interrupt",
      event_id: "evt-1",
    });
    expect(useChatStore.getState().typing).toBe(false);
    expect(useChatStore.getState().pendingEventId).toBe(null);
  });

  it("非 typing 时仍渲染发送按钮而非停止", () => {
    useChatStore.setState({ typing: false });
    render(
      <MemoryRouter>
        <Composer />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "发送" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "停止" })).toBeNull();
  });
});

describe("Composer / 技能菜单", () => {
  it("把启用的技能列进菜单，点按后插入技能名到输入框", async () => {
    vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/providers") return { providers: [] } as never;
      if (path === "/git/repos") return { repos: [] } as never;
      if (path === "/skills") {
        return {
          skills: [
            { name: "web-search", description: "Search the web", enabled: true },
            { name: "docs", description: "Disabled skill", enabled: false },
          ],
        } as never;
      }
      throw new Error(`unexpected ${path}`);
    });

    render(
      <MemoryRouter>
        <Composer />
      </MemoryRouter>,
    );

    // 输入 "/" 触发菜单，只保留启用的技能。
    fireEvent.change(screen.getByPlaceholderText("随心输入"), { target: { value: "/" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /web-search/ })).toBeTruthy());
    expect(screen.queryByRole("button", { name: /docs/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /web-search/ }));
    expect(useChatStore.getState().draft).toBe("/web-search ");
  });
});

describe("Composer context usage", () => {
  it("拉取真实 context-usage 并渲染 gauge 与弹窗分段", async () => {
    useChatStore.setState({ chatting: true, sessionId: "sess-1" });
    const fetchSpy = vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/git/repos") return { repos: [] } as never;
      if (path === "/providers") return { providers: [] } as never;
      if (path === "/sessions/sess-1/context-usage") {
        return {
          max: 200_000,
          used: 30_000,
          segments: [
            { key: "system", label: "System prompt", color: "#8a8a8a", tokens: 5_000, direct: 2.5 },
            { key: "conversation", label: "Conversation", color: "#9f1239", tokens: 25_000, direct: 12.5 },
          ],
        } as never;
      }
      throw new Error(`unexpected ${path}`);
    });

    render(
      <MemoryRouter>
        <Composer />
      </MemoryRouter>,
    );

    // Gauge percentage reflects the fetched usage once the request resolves.
    await waitFor(() => expect(screen.getByText("15%")).toBeTruthy());

    // Open the context dialog and confirm segments come from the API response.
    // aria-label is i18n-driven; the default test language is zh.
    fireEvent.click(screen.getByRole("button", { name: "上下文使用量" }));
    expect(screen.getByText("System prompt")).toBeTruthy();
    expect(screen.getByText("Conversation")).toBeTruthy();
    expect(screen.getByText(/30\.0K/)).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledWith(
      "/sessions/sess-1/context-usage",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("非 chatting 时不请求 context-usage", () => {
    useChatStore.setState({ chatting: false });
    const fetchSpy = vi.spyOn(api, "apiFetch").mockResolvedValue({} as never);
    render(
      <MemoryRouter>
        <Composer />
      </MemoryRouter>,
    );
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("/context-usage"),
      expect.anything(),
    );
  });
});

describe("Composer 输入与发送", () => {
  it("仅非空草稿可发送；Enter 发送，Shift+Enter 保留换行", async () => {
    mockComposerApi();
    const send = vi.fn();
    useChatStore.setState({ sendMessage: send });
    await renderComposer();

    const textarea = screen.getByPlaceholderText("随心输入");
    const sendButton = screen.getByRole("button", { name: "发送" });
    expect(sendButton).toBeDisabled();
    fireEvent.change(textarea, { target: { value: "   " } });
    expect(sendButton).toBeDisabled();
    fireEvent.change(textarea, { target: { value: "帮我检查这个问题" } });
    expect(sendButton).toBeEnabled();

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(send).not.toHaveBeenCalled();
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("typing 时禁用输入并阻止 Enter 重复发送", async () => {
    mockComposerApi();
    const send = vi.fn();
    useChatStore.setState({ typing: true, draft: "已有内容", sendMessage: send });
    await renderComposer();

    const textarea = screen.getByPlaceholderText("随心输入");
    expect(textarea).toBeDisabled();
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "停止" })).toBeEnabled();
  });
});

describe("Composer 模型与权限", () => {
  it("搜索模型、选择模型并调整推理强度", async () => {
    const fetchSpy = mockComposerApi({
      "/providers": { providers: [{ name: "local", models: ["zeta", "alpha", "alpha"] }] },
    });
    await renderComposer();

    fireEvent.click(screen.getByRole("button", { name: "模型" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "alpha" })).toBeInTheDocument());
    expect(screen.getAllByRole("button", { name: "alpha" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "zeta" })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("搜索模型"), { target: { value: "ZET" } });
    expect(screen.getByRole("button", { name: "zeta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "alpha" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "zeta" }));
    await waitFor(() => expect(useChatStore.getState().model).toBe("zeta"));
    expect(fetchSpy).toHaveBeenCalledWith(
      "/config",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ changes: { "models.default_model": "zeta" } }),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "模型" }));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "1" } });
    expect(useChatStore.getState().reasoning).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "重置推理强度" }));
    expect(useChatStore.getState().reasoning).toBe(3);
  });

  it("非管理员更改权限只更新本地状态", async () => {
    const fetchSpy = mockComposerApi();
    await renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "完全访问" }));
    fireEvent.click(screen.getAllByText("请求批准", { exact: true })[0]!);

    expect(useChatStore.getState().perm).toBe("ask");
    expect(fetchSpy).not.toHaveBeenCalledWith(
      "/config",
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});

describe("Composer 工作区、模式与附件", () => {
  it("切换工作区后显示并可切换 Git 分支", async () => {
    mockComposerApi({
      "/git/repos": { repos: [{ name: "repo", path: "/repo", current_branch: "main" }] },
      "/git/branches?path=%2Frepo": {
        branches: [
          { name: "main", is_current: true, is_remote: false },
          { name: "feature/test", is_current: false, is_remote: false },
        ],
        current_branch: "main",
      },
    });
    await renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "当前项目" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /repo/ }));
    await waitFor(() => expect(useChatStore.getState().project).toBe("repo"));
    expect(screen.getByRole("button", { name: "分支" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "分支" }));
    fireEvent.click(screen.getByText("feature/test"));
    expect(useChatStore.getState().branch).toBe("feature/test");
  });

  it("slash 命令可启用计划/目标模式，模式横幅可关闭", async () => {
    mockComposerApi();
    await renderComposer();
    const textarea = screen.getByPlaceholderText("随心输入");

    fireEvent.change(textarea, { target: { value: "/plan" } });
    fireEvent.click(screen.getByRole("button", { name: /\/plan/ }));
    expect(useChatStore.getState().planMode).toBe(true);
    expect(useChatStore.getState().draft).toBe("/plan ");
    fireEvent.click(screen.getByRole("button", { name: "关闭计划模式" }));
    expect(useChatStore.getState().planMode).toBe(false);

    fireEvent.change(textarea, { target: { value: "/goal" } });
    fireEvent.click(screen.getByRole("button", { name: /\/goal/ }));
    expect(useChatStore.getState().goalMode).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "关闭计划模式" }));
    expect(useChatStore.getState().goalMode).toBe(false);
  });

  it("呈现待发送附件并移除指定附件", async () => {
    mockComposerApi();
    const removeAttachment = vi.fn();
    useChatStore.setState({
      pendingAttachments: [
        { attachment_id: "att-1", url: "/a", name: "notes.txt", mime_type: "text/plain", size: 12 },
        { attachment_id: "att-2", url: "/b", name: "image.png", mime_type: "image/png", size: 24 },
      ],
      removeAttachment,
    });
    await renderComposer();

    expect(screen.getByText("notes.txt")).toBeInTheDocument();
    expect(screen.getByText("image.png")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭 notes.txt" }));
    expect(removeAttachment).toHaveBeenCalledWith("att-1");
  });
});
