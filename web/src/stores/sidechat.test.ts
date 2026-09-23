import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useSidechatStore } from "./sidechat";
import { useChatStore } from "./chat";
import * as api from "../lib/api";
import { webWS } from "../lib/ws";

beforeEach(() => {
  useSidechatStore.setState({
    messages: [],
    sessionId: null,
    draft: "",
    chatting: false,
    loadingHistory: false,
    historyError: null,
    typing: false,
    activeTool: null,
    pendingEventId: null,
    pendingApprovals: [],
    pendingClarify: null,
    streamStopped: false,
  });
  useChatStore.setState({ projectPath: "/ws/myproj" });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("sidechat store", () => {
  it("sendMessage mints a cli:web-side key, posts /message with the project, and polls to a real assistant reply", async () => {
    let turnCalls = 0;
    const fetchSpy = vi.spyOn(api, "apiFetch").mockImplementation(async (path, init) => {
      if (path === "/message") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { session_key: string; project?: string };
        expect(body.session_key.startsWith("cli:web-side-")).toBe(true);
        expect(body.project).toBe("/ws/myproj");
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
            status: turnCalls >= 2 ? "completed" : "running",
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

    useSidechatStore.getState().sendMessage("hello");

    expect(fetchSpy).toHaveBeenCalledWith(
      "/message",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      }),
    );
    expect(useSidechatStore.getState().typing).toBe(true);
    expect(useSidechatStore.getState().sessionId).toMatch(/^cli:web-side-/);

    await vi.advanceTimersByTimeAsync(2000);

    const msgs = useSidechatStore.getState().messages;
    expect(msgs.some((m) => m.role === "user" && m.content === "hello")).toBe(true);
    expect(msgs.some((m) => m.role === "assistant" && m.content === "hi there")).toBe(true);
    expect(useSidechatStore.getState().typing).toBe(false);
  });

  it("ignores an empty draft and does not fire a request", () => {
    const fetchSpy = vi.spyOn(api, "apiFetch");
    useSidechatStore.getState().sendMessage("   ");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(useSidechatStore.getState().messages).toHaveLength(0);
  });

  it("stopStream sends an interrupt frame with the side session + event ids", () => {
    useSidechatStore.setState({ typing: true, sessionId: "cli:web-side-1", pendingEventId: "evt-9" });
    const sendSpy = vi.spyOn(webWS, "send").mockReturnValue(true);

    useSidechatStore.getState().stopStream();

    expect(sendSpy).toHaveBeenCalledWith({
      type: "interrupt",
      session_key: "cli:web-side-1",
      event_id: "evt-9",
    });
    expect(useSidechatStore.getState().typing).toBe(false);
    expect(useSidechatStore.getState().pendingEventId).toBe(null);
  });

  it("clear resets the messages and session so the next send mints a fresh key", () => {
    useSidechatStore.setState({ messages: [{ id: "u-1", role: "user", content: "x" }], sessionId: "cli:web-side-1" });
    useSidechatStore.getState().clear();
    expect(useSidechatStore.getState().messages).toHaveLength(0);
    expect(useSidechatStore.getState().sessionId).toBe(null);
  });

  it("decideApproval sends a force:true /approve command and clears the ticket", () => {
    useSidechatStore.setState({
      pendingApprovals: [{ id: "app-1", tool: "bash", params: { cmd: "rm -rf" }, risk: "exec" }],
    });
    const fetchSpy = vi.spyOn(api, "apiFetch").mockImplementation(async (path) => {
      if (path === "/message") {
        return { status: "accepted", event_id: "e1", session_key: "cli:web-side-99" };
      }
      throw new Error(`unexpected ${path}`);
    });

    useSidechatStore.getState().decideApproval("app-1", "once");

    expect(fetchSpy).toHaveBeenCalledWith(
      "/message",
      expect.objectContaining({
        body: expect.stringContaining("/approve app-1"),
      }),
    );
    expect(useSidechatStore.getState().pendingApprovals).toHaveLength(0);
  });

  it("answerClarify sends the answer as a force message and clears pendingClarify", () => {
    useSidechatStore.setState({
      pendingClarify: { id: "c1", question: "Which one?", options: ["A", "B"] },
    });
    const fetchSpy = vi.spyOn(api, "apiFetch").mockImplementation(async (path) => {
      if (path === "/message") {
        return { status: "accepted", event_id: "e2", session_key: "cli:web-side-88" };
      }
      throw new Error(`unexpected ${path}`);
    });

    useSidechatStore.getState().answerClarify("A");

    expect(fetchSpy).toHaveBeenCalledWith(
      "/message",
      expect.objectContaining({ body: expect.stringContaining("A") }),
    );
    expect(useSidechatStore.getState().pendingClarify).toBe(null);
  });

  it("_refreshInteractions loads approvals and clarify into state", async () => {
    useSidechatStore.setState({ sessionId: "cli:web-side-10" });
    const fetchSpy = vi.spyOn(api, "apiFetch").mockImplementation(async (path) => {
      if (String(path).includes("/interactions")) {
        return {
          approvals: [{ id: "a1", tool: "bash", params: {}, risk: "exec" }],
          clarify: null,
        };
      }
      throw new Error(`unexpected ${path}`);
    });

    await useSidechatStore.getState()._refreshInteractions("cli:web-side-10");

    expect(useSidechatStore.getState().pendingApprovals).toHaveLength(1);
    expect(useSidechatStore.getState().pendingClarify).toBe(null);
    expect(fetchSpy).toHaveBeenCalledWith("/interactions?session_key=cli%3Aweb-side-10");
  });
});
