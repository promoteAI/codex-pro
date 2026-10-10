import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useChatStore, mapHistoryMessages, pruneSettledThinking, type ChatMessage } from "./chat";
import * as api from "../lib/api";
import { CogDedup } from "../lib/chat-ws-frame";

/** A stubbed interactive /ws so store tests deterministically fall through to
 *  the HTTP POST path (send returns false). The real InteractiveChatWS opens a
 *  network socket, which is unavailable under jsdom; stubbing it keeps the
 *  existing HTTP-path assertions valid while the WS-path tests assert on
 *  chatWS.send directly. */
function fakeChatWS() {
  return {
    send: vi.fn(() => false),
    connect: vi.fn(),
    disconnect: vi.fn(),
    onFrame: vi.fn(() => () => {}),
    isOpen: false,
  } as unknown as import("../lib/chat-ws").InteractiveChatWS;
}

beforeEach(() => {
  useChatStore.setState({
    project: "codex-pro",
    projectPath: "",
    env: "local",
    branch: "dev",
    model: "agnes-2.5-flash",
    reasoning: 3,
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
    streaming: null,
    thinkingBlocks: {},
    chatWS: fakeChatWS(),
    _cogDedup: new CogDedup(),
    pendingAttachments: [],
    pendingApprovals: [],
    pendingClarify: null,
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

    // 1s poll #1 → /turns returns "running" (turnCalls=1): still streaming.
    await vi.advanceTimersByTimeAsync(1000);
    expect(useChatStore.getState().typing).toBe(true);

    // 1s poll #2 → /turns returns "failed" (turnCalls=2): terminal → finish.
    await vi.advanceTimersByTimeAsync(1000);
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

  it("polls /interactions and populates pending approve/clarify", async () => {
    vi.spyOn(api, "apiFetch").mockImplementation(async (path) => {
      if (String(path).startsWith("/turns/")) {
        return { turn: { status: "running", current_tool: "exec" } };
      }
      if (String(path).startsWith("/interactions")) {
        return {
          approvals: [{ id: "req-1", tool: "exec", params: { command: "ls" }, risk: "exec" }],
          clarify: null,
        };
      }
      return { messages: [] };
    });
    useChatStore.setState({ sessionId: "cli:abc", pendingEventId: "evt-1", typing: true });
    useChatStore.getState()._pollForResponse("cli:abc", "evt-1", 0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(useChatStore.getState().pendingApprovals).toHaveLength(1);
    expect(useChatStore.getState().pendingApprovals[0].id).toBe("req-1");
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

  it("loadSessionHistory backfills projectPath only for project sessions", async () => {
    // 无项目会话(project 空,但后端持久化了 workspace):回填不得把隔离工作目录
    // 当作 projectPath,否则下一条消息会把它作为 project 发回、被后端误判成有项目
    // 会话。projectPath 必须保持空,由后端 session.workspace 复用工作区。
    vi.spyOn(api, "apiFetch").mockImplementation(async (path) => {
      if (String(path).includes("/history")) {
        return {
          messages: [{ role: "user", content: "hi" }],
          project: "",
          workspace: "C:\\no-proj-base\\2026-09-25\\session-abc",
        };
      }
      throw new Error(`unexpected path ${path}`);
    });
    await useChatStore.getState().loadSessionHistory("cli:np");
    const s = useChatStore.getState();
    expect(s.project).toBe("");
    expect(s.projectPath).toBe("");
  });

  it("loadSessionHistory backfills projectPath for a real project session", async () => {
    vi.spyOn(api, "apiFetch").mockImplementation(async (path) => {
      if (String(path).includes("/history")) {
        return {
          messages: [{ role: "user", content: "hi" }],
          project: "e:\\workspace\\codex-pro",
          workspace: "e:\\workspace\\codex-pro",
        };
      }
      throw new Error(`unexpected path ${path}`);
    });
    await useChatStore.getState().loadSessionHistory("cli:proj");
    const s = useChatStore.getState();
    expect(s.project).toBe("e:\\workspace\\codex-pro");
    expect(s.projectPath).toBe("e:\\workspace\\codex-pro");
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
    const sendSpy = vi
      .spyOn(useChatStore.getState().chatWS, "send")
      .mockReturnValue(true);

    useChatStore.getState().stopStream();

    expect(sendSpy).toHaveBeenCalledWith({
      type: "interrupt",
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
    const sendSpy = vi
      .spyOn(useChatStore.getState().chatWS, "send")
      .mockReturnValue(false);

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

describe("chat store interactive /ws path", () => {
  it("sendMessage with open WS sends a message frame and skips /message", async () => {
    const sendSpy = vi
      .spyOn(useChatStore.getState().chatWS, "send")
      .mockReturnValue(true);
    const fetchSpy = vi.spyOn(api, "apiFetch").mockResolvedValue({
      status: "accepted",
      event_id: "evt-1",
      session_key: "cli:web-1",
    });

    useChatStore.setState({ streamStopped: false, draft: "hello" });
    await useChatStore.getState().sendMessage();

    expect(sendSpy).toHaveBeenCalledWith({ type: "message", text: "hello" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(useChatStore.getState().typing).toBe(true);
  });

  it("attachments keep the HTTP /message path even when WS is open", async () => {
    const sendSpy = vi
      .spyOn(useChatStore.getState().chatWS, "send")
      .mockReturnValue(true);
    vi.spyOn(api, "apiFetch").mockImplementation(async (path, init) => {
      if (path === "/message") {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        expect(body.attachments).toEqual([{ attachment_id: "att-1" }]);
        return { status: "accepted", event_id: "evt-1", session_key: "cli:web-1" };
      }
      if (String(path).startsWith("/turns/")) return { turn: { status: "completed", response_text: "ok" } };
      return { messages: [] };
    });
    useChatStore.setState({
      pendingAttachments: [
        { attachment_id: "att-1", url: "/p", name: "note.txt", mime_type: "text/plain", size: 5 },
      ],
      draft: "hello",
    });
    await useChatStore.getState().sendMessage("hello");
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("streaming frames accumulate into a live bubble keyed by inbound event", () => {
    useChatStore.getState()._handleWsFrame({
      type: "message",
      message_kind: "streaming",
      is_final: false,
      text: "Hel",
      metadata: { _token_stream: true, _inbound_event_id: "evt-1" },
    });
    useChatStore.getState()._handleWsFrame({
      type: "message",
      message_kind: "streaming",
      is_final: false,
      text: "lo",
      metadata: { _token_stream: true, _inbound_event_id: "evt-1" },
    });
    expect(useChatStore.getState().streaming).toEqual({ eventId: "evt-1", text: "Hello" });
  });

  it("a _stream_reset frame clears the accumulated draft but keeps the bubble", () => {
    useChatStore.setState({ streaming: { eventId: "evt-1", text: "Draft preamble" } });
    useChatStore.getState()._handleWsFrame({
      type: "message",
      message_kind: "streaming",
      is_final: false,
      text: "",
      metadata: { _token_stream: true, _stream_reset: true, _inbound_event_id: "evt-1" },
    });
    expect(useChatStore.getState().streaming).toEqual({ eventId: "evt-1", text: "" });
  });

  it("a matching final frame pushes an assistant message and clears streaming", () => {
    useChatStore.setState({ streaming: { eventId: "evt-1", text: "Hello" }, typing: true });
    useChatStore.getState()._handleWsFrame({
      type: "message",
      message_kind: "final",
      is_final: true,
      text: "Hello world",
      metadata: { _inbound_event_id: "evt-1" },
    });
    const s = useChatStore.getState();
    expect(s.streaming).toBe(null);
    expect(s.typing).toBe(false);
    expect(s.messages.some((m) => m.role === "assistant" && m.content === "Hello world")).toBe(true);
  });

  it("final frame commits the answer then reloads the persisted transcript", async () => {
    useChatStore.setState({ streaming: { eventId: "evt-1", text: "" }, typing: true, sessionId: "cli:web-1" });
    // /history returns the interleaved transcript (thinking between tool rounds).
    const fetchSpy = vi.spyOn(api, "apiFetch").mockResolvedValue({
      messages: [
        { role: "user", content: "研究一下" },
        { role: "thinking", content: "用户想了解项目。", thinking_id: "t-1", duration_ms: 1200 },
        { role: "assistant", content: "好的，项目是……" },
      ],
    });
    useChatStore.getState()._handleWsFrame({
      type: "message",
      message_kind: "final",
      is_final: true,
      text: "好的，项目是……",
      metadata: { _inbound_event_id: "evt-1" },
    });
    // The reload fetch is fire-and-forget; flush the microtask.
    expect(fetchSpy).toHaveBeenCalled();
    await Promise.resolve();
    // The turn commits the answer and clears live blocks.
    const s = useChatStore.getState();
    expect(s.thinkingBlocks).toEqual({});
    // The authoritative interleaved view (with the thinking row) is reloaded.
    expect(s.messages.some((m) => m.thinking?.text === "用户想了解项目。")).toBe(true);
    expect(s.messages.some((m) => m.role === "assistant" && m.content === "好的，项目是……")).toBe(true);
  });

  it("retracted thinking blocks are excluded from the reloaded transcript", async () => {
    useChatStore.setState({ typing: true, streaming: null, sessionId: "cli:web-1" });
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "answer" },
      ],
    });
    useChatStore.getState()._handleWsFrame({
      type: "message",
      message_kind: "cognitive",
      metadata: {
        cog_type: "thinking",
        cog_event_id: "cog-2",
        _inbound_event_id: "evt-1",
        data: { thinking_id: "t-2", text: "", duration_ms: 0, streaming: false, retracted: true },
      },
    });
    useChatStore.getState()._handleWsFrame({
      type: "message",
      message_kind: "final",
      is_final: true,
      text: "answer",
      metadata: { _inbound_event_id: "evt-1" },
    });
    await Promise.resolve();
    const s = useChatStore.getState();
    expect(s.messages.filter((m) => m.thinking)).toHaveLength(0);
  });

  it("control replies (/approve) are not rendered as assistant text", () => {
    useChatStore.setState({ typing: true, streaming: null, sessionId: "cli:web-1" });
    useChatStore.getState()._handleWsFrame({
      type: "message",
      message_kind: "final",
      is_final: true,
      text: "/approve req-1",
      metadata: { _inbound_event_id: "evt-1" },
    });
    expect(useChatStore.getState().messages.filter((m) => m.role === "assistant")).toHaveLength(0);
  });

  it("cognitive thinking frames populate thinkingBlocks and a retracted frame removes", () => {
    useChatStore.getState()._handleWsFrame({
      type: "message",
      message_kind: "cognitive",
      text: "思考中",
      metadata: {
        cog_type: "thinking",
        cog_event_id: "cog-1",
        _inbound_event_id: "evt-1",
        data: { thinking_id: "th-1", text: "Let me think", streaming: true, duration_ms: 100 },
      },
    });
    expect(useChatStore.getState().thinkingBlocks["th-1"]?.text).toBe("Let me think");
    expect(useChatStore.getState().thinkingBlocks["th-1"]?.streaming).toBe(true);

    useChatStore.getState()._handleWsFrame({
      type: "message",
      message_kind: "cognitive",
      text: "思考 0.1s",
      metadata: {
        cog_type: "thinking",
        cog_event_id: "cog-2",
        _inbound_event_id: "evt-1",
        data: { thinking_id: "th-1", text: "", streaming: false, duration_ms: 100, retracted: true },
      },
    });
    expect(useChatStore.getState().thinkingBlocks["th-1"]).toBeUndefined();
  });

  it("duplicate cog_event_id re-delivery is deduped", () => {
    useChatStore.getState()._handleWsFrame({
      type: "message",
      message_kind: "cognitive",
      text: "思考中",
      metadata: { cog_type: "thinking", cog_event_id: "cog-1", _inbound_event_id: "evt-1", data: { thinking_id: "th-1", text: "a", streaming: true } },
    });
    useChatStore.getState()._handleWsFrame({
      type: "message",
      message_kind: "cognitive",
      text: "思考中",
      metadata: { cog_type: "thinking", cog_event_id: "cog-1", _inbound_event_id: "evt-1", data: { thinking_id: "th-1", text: "b", streaming: true } },
    });
    expect(useChatStore.getState().thinkingBlocks["th-1"]?.text).toBe("a");
  });

  it("cognitive tool_call frames set the running tool and refresh history", async () => {
    const fetchSpy = vi
      .spyOn(api, "apiFetch")
      .mockImplementation(async (path: string) => {
        if (path.includes("/history")) {
          return {
            messages: [
              { role: "user", content: "hi" },
              { role: "tool", content: "done", name: "exec" },
              { role: "assistant", content: "Hello" },
            ],
          };
        }
        return { messages: [] };
      });
    useChatStore.setState({ sessionId: "cli:web-1", typing: true });

    // running frame — tool starts
    useChatStore.getState()._handleWsFrame({
      type: "message",
      message_kind: "cognitive",
      text: "🔧 exec · running",
      metadata: {
        cog_type: "tool_call",
        cog_event_id: "cog-t1",
        _inbound_event_id: "evt-1",
        data: { name: "exec", status: "running", tool_call_id: "tc-1" },
      },
    });
    expect(useChatStore.getState().activeTool).toBe("exec");

    // terminal frame — tool finishes; the same name no longer runs
    useChatStore.getState()._handleWsFrame({
      type: "message",
      message_kind: "cognitive",
      text: "🔧 exec · ok",
      metadata: {
        cog_type: "tool_call",
        cog_event_id: "cog-t2",
        _inbound_event_id: "evt-1",
        data: { name: "exec", status: "ok", tool_call_id: "tc-1" },
      },
    });
    expect(useChatStore.getState().activeTool).toBe(null);

    // The turn's tool rows were re-fetched so the live TaskActivityItem shows.
    expect(fetchSpy).toHaveBeenCalledWith(
      "/sessions/cli%3Aweb-1/history?limit=100&offset=0",
    );
  });

  it("_ensureChatWS auths with platform cli and the session key", () => {
    useChatStore.setState({ sessionId: "cli:web-abc" });
    const connectSpy = vi.spyOn(useChatStore.getState().chatWS, "connect");
    useChatStore.getState()._ensureChatWS();
    expect(connectSpy).toHaveBeenCalledWith({
      platform: "cli",
      sessionKey: "cli:web-abc",
      token: "",
    });
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

  it("setWorkspace updates workspaceKey and workspacePath without clearing project", () => {
    useChatStore.getState().setProject("myproj", "/ws/myproj");
    useChatStore.getState().setWorkspace({ workspaceKey: "ws1", workspacePath: "/ws1" });
    expect(useChatStore.getState().workspaceKey).toBe("ws1");
    expect(useChatStore.getState().workspacePath).toBe("/ws1");
    // project context is untouched by a workspace switch
    expect(useChatStore.getState().project).toBe("myproj");
  });
});

describe("mapHistoryMessages", () => {
  it("maps a thinking row onto the ChatMessage.thinking field", () => {
    const rows = [
      { role: "user", content: "研究一下" },
      { role: "thinking", content: "用户想了解项目。", thinking_id: "t-1", duration_ms: 1200 },
      { role: "assistant", content: "好的。" },
    ];
    const messages = mapHistoryMessages("cli:web-1", rows);
    expect(messages).toHaveLength(3);
    // The thinking row becomes an internal assistant row carrying thinking.
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].internal).toBe(true);
    expect(messages[1].thinking).toEqual({
      thinkingId: "t-1",
      text: "用户想了解项目。",
      durationMs: 1200,
    });
    // Non-thinking rows are unchanged.
    expect(messages[0].thinking).toBeUndefined();
    expect(messages[2].thinking).toBeUndefined();
    expect(messages[2].role).toBe("assistant");
  });

  it("falls back to content when a thinking row has no explicit thinking_id", () => {
    const messages = mapHistoryMessages("cli:web-2", [
      { role: "thinking", content: "trace" },
    ]);
    expect(messages[0].thinking?.thinkingId).toBe("cli:web-2-0");
    expect(messages[0].thinking?.text).toBe("trace");
  });
});

describe("pruneSettledThinking", () => {
  it("drops live blocks whose span is already in the loaded transcript", () => {
    const messages: ChatMessage[] = [
      {
        id: "0",
        role: "assistant",
        content: "",
        internal: true,
        thinking: { thinkingId: "t-1", text: "已落盘", durationMs: 100 },
      },
    ];
    const blocks = {
      "t-1": { thinkingId: "t-1", text: "已落盘", streaming: false, durationMs: 100, retracted: false, cogEventId: "c1" },
      "t-2": { thinkingId: "t-2", text: "还没落盘", streaming: true, durationMs: 0, retracted: false, cogEventId: "c2" },
    };
    const pruned = pruneSettledThinking(messages, blocks);
    expect(pruned).toEqual({
      "t-2": blocks["t-2"],
    });
  });

  it("returns the blocks unchanged when no span is settled", () => {
    const messages: ChatMessage[] = [{ id: "0", role: "assistant", content: "hi" }];
    const blocks = {
      "t-1": { thinkingId: "t-1", text: "live", streaming: true, durationMs: 0, retracted: false, cogEventId: "c1" },
    };
    expect(pruneSettledThinking(messages, blocks)).toEqual(blocks);
  });
});
