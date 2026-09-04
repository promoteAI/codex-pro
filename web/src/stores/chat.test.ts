import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useChatStore } from "./chat";

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
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("chat store", () => {
  it("sendMessage appends user then mock assistant", () => {
    useChatStore.getState().setDraft("hello");
    useChatStore.getState().sendMessage();
    expect(useChatStore.getState().messages).toHaveLength(1);
    expect(useChatStore.getState().chatting).toBe(true);
    expect(useChatStore.getState().draft).toBe("");
    vi.runAllTimers();
    expect(useChatStore.getState().messages).toHaveLength(2);
    expect(useChatStore.getState().messages[1].role).toBe("assistant");
  });

  it("ignores empty send", () => {
    useChatStore.getState().sendMessage("   ");
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  it("clearChat resets thread", () => {
    useChatStore.getState().sendMessage("hi");
    vi.runAllTimers();
    useChatStore.getState().clearChat();
    expect(useChatStore.getState().messages).toHaveLength(0);
    expect(useChatStore.getState().chatting).toBe(false);
  });
});
