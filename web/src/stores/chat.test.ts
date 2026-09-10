import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useChatStore } from "./chat";
import * as api from "../lib/api";

beforeEach(() => {
  useChatStore.setState({
    project: "codex-pro",
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
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("chat store", () => {
  it("sendMessage posts a cli: session key and waits for the assistant", async () => {
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

    expect(useChatStore.getState().messages).toHaveLength(1);
    expect(useChatStore.getState().chatting).toBe(true);
    expect(useChatStore.getState().typing).toBe(true);
    expect(useChatStore.getState().draft).toBe("");
    expect(useChatStore.getState().sessionId?.startsWith("cli:")).toBe(true);

    await vi.runAllTimersAsync();

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
    let historyCalls = 0;
    vi.spyOn(api, "apiFetch").mockImplementation(async (path) => {
      if (path === "/message") {
        return { status: "accepted", event_id: "evt", session_key: "cli:web-1" };
      }
      historyCalls += 1;
      return {
        messages: [
          { role: "user", content: "one" },
          ...(historyCalls >= 1 ? [{ role: "assistant", content: "ok" }] : []),
        ],
      };
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
});
