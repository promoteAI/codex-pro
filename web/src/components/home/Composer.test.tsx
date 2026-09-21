import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Composer } from "./Composer";
import * as api from "../../lib/api";
import { useChatStore } from "../../stores/chat";
import { useProvidersStore } from "../../stores/providers";
import { useCapabilitiesStore } from "../../stores/capabilities";
import { webWS } from "../../lib/ws";

const chatDefaults = {
  project: "",
  projectPath: "",
  env: "local",
  branch: "dev",
  model: "m",
  effort: 2,
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
    const sendSpy = vi.spyOn(webWS, "send").mockReturnValue(true);

    render(
      <MemoryRouter>
        <Composer />
      </MemoryRouter>,
    );

    const stopBtn = screen.getByRole("button", { name: "停止" });
    fireEvent.click(stopBtn);

    expect(sendSpy).toHaveBeenCalledWith({
      type: "interrupt",
      session_key: "sess-1",
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
    fireEvent.click(screen.getByRole("button", { name: "Context Usage" }));
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
