import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useChatStore } from "./chat";
import * as api from "../lib/api";
import { webWS } from "../lib/ws";

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
    streamStopped: false,
    pendingAttachments: [],
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

  it("setModel persists models.default_model via /config PATCH", async () => {
    const fetchSpy = vi.spyOn(api, "apiFetch").mockResolvedValue({ success: true });
    await useChatStore.getState().setModel("agnes-2.0-flash");
    expect(useChatStore.getState().model).toBe("agnes-2.0-flash");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/config",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ changes: { "models.default_model": "agnes-2.0-flash" } }),
      }),
    );
  });

  it("setModel keeps local model on PATCH failure", async () => {
    vi.spyOn(api, "apiFetch").mockRejectedValue(new Error("unauthorized"));
    await useChatStore.getState().setModel("o3");
    expect(useChatStore.getState().model).toBe("o3");
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

describe("chat store attachments", () => {
  it("addFile uploads via apiUpload and appends to pendingAttachments", async () => {
    const uploadSpy = vi.spyOn(api, "apiUpload").mockResolvedValue({
      attachment_id: "att-1",
      url: "/data/attachments/att-1.txt",
      name: "note.txt",
      mime_type: "text/plain",
      size: 5,
    });
    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    await useChatStore.getState().addFile(file);
    expect(uploadSpy).toHaveBeenCalledWith("/attachments", expect.any(FormData));
    expect(useChatStore.getState().pendingAttachments).toHaveLength(1);
    expect(useChatStore.getState().pendingAttachments[0].attachment_id).toBe("att-1");
  });

  it("sendMessage includes attachments in the body and clears them", async () => {
    let body: Record<string, unknown> | undefined;
    vi.spyOn(api, "apiFetch").mockImplementation(async (path, init) => {
      if (path === "/message") {
        body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return { status: "accepted", event_id: "evt-1", session_key: "cli:web-1" };
      }
      if (String(path).startsWith("/turns/")) {
        return { turn: { status: "completed", response_text: "ok" } };
      }
      if (String(path).includes("/history")) {
        return { messages: [] };
      }
      throw new Error(`unexpected path ${path}`);
    });
    useChatStore.setState({
      pendingAttachments: [
        { attachment_id: "att-1", url: "/p", name: "note.txt", mime_type: "text/plain", size: 5 },
      ],
    });
    await useChatStore.getState().sendMessage("hello");
    expect(body?.attachments).toEqual([{ attachment_id: "att-1" }]);
    expect(useChatStore.getState().pendingAttachments).toHaveLength(0);
  });

  it("removeAttachment removes a staged attachment", () => {
    useChatStore.setState({
      pendingAttachments: [
        { attachment_id: "att-1", url: "/a", name: "a.txt", mime_type: "text/plain", size: 1 },
        { attachment_id: "att-2", url: "/b", name: "b.txt", mime_type: "text/plain", size: 1 },
      ],
    });
    useChatStore.getState().removeAttachment("att-1");
    expect(useChatStore.getState().pendingAttachments.map((a) => a.attachment_id)).toEqual([
      "att-2",
    ]);
  });

  it("clearChat clears staged attachments", () => {
    useChatStore.setState({
      pendingAttachments: [
        { attachment_id: "att-1", url: "/a", name: "a.txt", mime_type: "text/plain", size: 1 },
      ],
    });
    useChatStore.getState().clearChat();
    expect(useChatStore.getState().pendingAttachments).toHaveLength(0);
  });
});

describe("perm ↔ approval mode mapping", () => {
  it("permToMode maps the three composer tiers to backend modes", async () => {
    const { permToMode } = await import("./chat");
    expect(permToMode("ask")).toBe("manual");
    expect(permToMode("agent")).toBe("smart");
    expect(permToMode("full")).toBe("off");
  });

  it("modeToPerm maps backend modes back to composer tiers", async () => {
    const { modeToPerm } = await import("./chat");
    expect(modeToPerm("manual")).toBe("ask");
    expect(modeToPerm("smart")).toBe("agent");
    expect(modeToPerm("off")).toBe("full");
    expect(modeToPerm("")).toBe("full");
    expect(modeToPerm(undefined)).toBe("full");
    expect(modeToPerm("unknown")).toBe("full");
  });
});

describe("chat store stopStream", () => {
  it("sends an interrupt frame, clears pendingEventId, and preserves messages", () => {
    useChatStore.setState({
      sessionId: "sess-1",
      pendingEventId: "evt-9",
      typing: true,
      activeTool: "bash",
      messages: [{ id: "t-1", role: "tool", content: "done", internal: true }],
    });
    const sendSpy = vi.spyOn(webWS, "send").mockReturnValue(true);

    useChatStore.getState().stopStream();

    expect(sendSpy).toHaveBeenCalledWith({
      type: "interrupt",
      session_key: "sess-1",
      event_id: "evt-9",
    });
    expect(useChatStore.getState().typing).toBe(false);
    expect(useChatStore.getState().activeTool).toBe(null);
    // The in-flight poll must not reload/overwrite the local messages, so the
    // tool cards already on screen survive the stop.
    expect(useChatStore.getState().pendingEventId).toBe(null);
    expect(useChatStore.getState().streamStopped).toBe(true);
    expect(useChatStore.getState().messages).toHaveLength(1);
  });

  it("omits session/event ids when not set and still stops the stream", () => {
    useChatStore.setState({ sessionId: null, pendingEventId: null, typing: true });
    const sendSpy = vi.spyOn(webWS, "send").mockReturnValue(false);

    useChatStore.getState().stopStream();

    expect(sendSpy).toHaveBeenCalledWith({ type: "interrupt" });
    expect(useChatStore.getState().typing).toBe(false);
    expect(useChatStore.getState().streamStopped).toBe(true);
  });

  it("sendMessage clears streamStopped so a new turn resumes polling", () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      status: "accepted",
      event_id: "evt-2",
      session_key: "cli:web-1",
    });
    useChatStore.setState({ streamStopped: true, draft: "hello" });
    const { sendMessage } = useChatStore.getState();
    // sendMessage is async; fire-and-forget like the Composer does.
    void sendMessage();
    expect(useChatStore.getState().streamStopped).toBe(false);
  });
});

describe("chat store permission persistence", () => {
  it("persistPerm PATCHes the approval mode and updates local perm", async () => {
    const fetchSpy = vi.spyOn(api, "apiFetch").mockResolvedValue({ success: true });
    await useChatStore.getState().persistPerm("ask");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/config",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ changes: { "permissions.approval.mode": "manual" } }),
      }),
    );
    expect(useChatStore.getState().perm).toBe("ask");
  });

  it("loadPerm reads the approval mode from /config", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      permissions: { approval: { mode: "smart" } },
    });
    await useChatStore.getState().loadPerm();
    expect(useChatStore.getState().perm).toBe("agent");
  });
});
