import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useChatStore } from "./chat";
import * as api from "../lib/api";

beforeEach(() => {
  useChatStore.setState({
    project: "codex-pro",
    projectPath: "",
    env: "local",
    branch: "dev",
    model: "agnes-2.5-flash",
    effort: 3,
    perm: "full",
    draft: "",
    messages: [],
    sessionId: null,
    chatting: false,
    loadingHistory: false,
    historyError: null,
    typing: false,
    pendingEventId: null,
    activeTool: null,
    planMode: false,
    goalMode: false,
    planTask: "",
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("chat store", () => {
  it("sendMessage polls /turns until terminal then reloads history", async () => {
    let turnCalls = 0;
    const fetchSpy = vi.spyOn(api, "apiFetch").mockImplementation(async (path, init) => {
      if (path === "/message") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { session_key: string };
        expect(body.session_key.startsWith("cli:")).toBe(true);
        return {
          status: "accepted",
          event_id: "evt-1",
          session_key: body.session_key,
        };
      }
      if (String(path).startsWith("/turns/")) {
        turnCalls += 1;
        return {
          turn: {
            status: turnCalls >= 2 ? "failed" : "running",
            response_text: turnCalls >= 2 ? "hi there" : "",
          },
        };
      }
      if (String(path).includes("/history")) {
        return {
          messages: [
            { role: "user", content: "hello" },
            { role: "assistant", content: "hi there" },
          ],
        };
      }
      throw new Error(`unexpected path ${path}`);
    });

    useChatStore.getState().setDraft("hello");
    await useChatStore.getState().sendMessage();

    expect(useChatStore.getState().typing).toBe(true);
    expect(useChatStore.getState().pendingEventId).toBe("evt-1");

    await vi.advanceTimersByTimeAsync(2000);
    expect(useChatStore.getState().typing).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();

    expect(useChatStore.getState().typing).toBe(false);
    expect(useChatStore.getState().messages.some((m) => m.role === "assistant")).toBe(true);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("rejects bare local-* style keys by never generating them", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      status: "accepted",
      event_id: "evt-1",
      session_key: "cli:web-1",
    });

    await useChatStore.getState().sendMessage("ping");
    const key = useChatStore.getState().sessionId;
    expect(key).toMatch(/^cli:/);
    expect(key?.startsWith("local-")).toBe(false);
  });

  it("ignores empty send", async () => {
    await useChatStore.getState().sendMessage("   ");
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  it("does not block a second send after the first turn finishes", async () => {
    let turnCalls = 0;
    vi.spyOn(api, "apiFetch").mockImplementation(async (path) => {
      if (path === "/message") {
        return { status: "accepted", event_id: `evt-${turnCalls}`, session_key: "cli:web-1" };
      }
      if (String(path).startsWith("/turns/")) {
        turnCalls += 1;
        return { turn: { status: "completed", response_text: "ok" } };
      }
      if (String(path).includes("/history")) {
        return {
          messages: [
            { role: "user", content: "one" },
            { role: "assistant", content: "ok" },
          ],
        };
      }
      throw new Error(`unexpected path ${path}`);
    });

    await useChatStore.getState().sendMessage("one");
    await vi.runAllTimersAsync();
    expect(useChatStore.getState().typing).toBe(false);
    expect(useChatStore.getState().chatting).toBe(true);

    await useChatStore.getState().sendMessage("two");
    expect(useChatStore.getState().typing).toBe(true);
    expect(useChatStore.getState().messages.filter((m) => m.role === "user")).toHaveLength(2);
  });

  it("clearChat resets thread", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      status: "accepted",
      event_id: "evt-1",
      session_key: "cli:web-1",
    });
    await useChatStore.getState().sendMessage("hi");
    useChatStore.getState().clearChat();
    expect(useChatStore.getState().messages).toHaveLength(0);
    expect(useChatStore.getState().chatting).toBe(false);
  });

  it("sendMessage includes project path when selected", async () => {
    let messageBody: Record<string, unknown> | undefined;
    vi.spyOn(api, "apiFetch").mockImplementation(async (path, init) => {
      if (path === "/message") {
        messageBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return { status: "accepted", event_id: "evt-1", session_key: "cli:web-1" };
      }
      if (String(path).startsWith("/turns/")) {
        return { turn: { status: "completed", response_text: "ok" } };
      }
      if (String(path).includes("/history")) {
        return { messages: [{ role: "assistant", content: "ok" }] };
      }
      throw new Error(`unexpected path ${path}`);
    });

    useChatStore.setState({ projectPath: "/ws/myproj" });
    await useChatStore.getState().sendMessage("hello");
    expect(messageBody?.project).toBe("/ws/myproj");
  });

  it("sendMessage omits project when none selected", async () => {
    let messageBody: Record<string, unknown> | undefined;
    vi.spyOn(api, "apiFetch").mockImplementation(async (path, init) => {
      if (path === "/message") {
        messageBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return { status: "accepted", event_id: "evt-1", session_key: "cli:web-1" };
      }
      if (String(path).startsWith("/turns/")) {
        return { turn: { status: "completed", response_text: "ok" } };
      }
      if (String(path).includes("/history")) {
        return { messages: [{ role: "assistant", content: "ok" }] };
      }
      throw new Error(`unexpected path ${path}`);
    });

    useChatStore.setState({ projectPath: "" });
    await useChatStore.getState().sendMessage("hello");
    expect(messageBody?.project).toBeUndefined();
  });

  it("createProject posts then selects the new repo", async () => {
    const fetchSpy = vi.spyOn(api, "apiFetch").mockImplementation(async (path, init) => {
      if (path === "/git/repos" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { name: string };
        expect(body.name).toBe("newproj");
        return { path: "/ws/newproj", name: "newproj", current_branch: "main" };
      }
      if (path === "/git/repos") {
        return { repos: [{ path: "/ws/newproj", name: "newproj", current_branch: "main" }] };
      }
      if (String(path).startsWith("/git/branches")) {
        return { branches: [], current_branch: "main" };
      }
      throw new Error(`unexpected path ${path}`);
    });

    await useChatStore.getState().createProject("newproj");
    expect(useChatStore.getState().project).toBe("newproj");
    expect(useChatStore.getState().projectPath).toBe("/ws/newproj");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/git/repos",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("selectProject sets name, path and branch", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({ branches: [], current_branch: "main" });
    useChatStore.getState().selectProject({
      path: "/ws/abc",
      name: "abc",
      current_branch: "dev",
    });
    expect(useChatStore.getState().project).toBe("abc");
    expect(useChatStore.getState().projectPath).toBe("/ws/abc");
    expect(useChatStore.getState().branch).toBe("dev");
    expect(useChatStore.getState().messages).toHaveLength(0);
  });
});
