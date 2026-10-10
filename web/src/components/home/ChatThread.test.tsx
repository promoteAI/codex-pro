import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatThread, type ChatThreadSelectors } from "./ChatThread";
import type { ChatMessage } from "../../stores/chat";

afterEach(() => {
  vi.restoreAllMocks();
});

function baseSelectors(overrides: Partial<ChatThreadSelectors> = {}): ChatThreadSelectors {
  return {
    messages: [],
    loadingHistory: false,
    historyError: null,
    typing: false,
    activeTool: null,
    sessionId: "cli:web-1",
    streamStopped: false,
    streaming: null,
    thinkingBlocks: {},
    pendingApprovals: [],
    pendingClarify: null,
    decideApproval: () => {},
    answerClarify: () => {},
    loadSessionHistory: async () => {},
    wsReloadHistory: async () => {},
    ...overrides,
  };
}

describe("ChatThread thinking history rows", () => {
  it("renders a persisted thinking row as a collapsed block before the answer", () => {
    const messages: ChatMessage[] = [
      { id: "0", role: "user", content: "研究一下" },
      {
        id: "1",
        role: "assistant",
        content: "",
        internal: true,
        thinking: { thinkingId: "t-1", text: "用户想了解项目结构。", durationMs: 1200 },
      },
      { id: "2", role: "assistant", content: "好的，项目是……" },
    ];
    render(<ChatThread selectors={baseSelectors({ messages })} />);

    const thinkingRow = document.querySelector('.tr-row[data-thinking="t-1"]');
    expect(thinkingRow).toBeTruthy();
    // It renders the thinking text capsule and the assistant answer below it.
    expect(thinkingRow?.textContent).toContain("用户想了解项目结构。");
    expect(screen.getByText("好的，项目是……")).toBeTruthy();
  });

  it("does not render a thinking block for ordinary assistant messages", () => {
    const messages: ChatMessage[] = [
      { id: "0", role: "user", content: "hi" },
      { id: "1", role: "assistant", content: "hello" },
    ];
    render(<ChatThread selectors={baseSelectors({ messages })} />);
    expect(document.querySelector(".tr-row[data-thinking]")).toBeNull();
  });

  it("keeps thinking interleaved inside the same turn group as tool activity", () => {
    // user → think → toolcall → tool → think → toolcall → tool → answer
    const messages: ChatMessage[] = [
      { id: "0", role: "user", content: "搜索一下" },
      {
        id: "1",
        role: "assistant",
        content: "",
        internal: true,
        thinking: { thinkingId: "t-1", text: "先尝试 web 搜索。", durationMs: 500 },
      },
      { id: "2", role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "web_fetch", arguments: "{}" } }] },
      { id: "3", role: "tool", content: "result", tool_call_id: "c1", name: "web_fetch" },
      {
        id: "4",
        role: "assistant",
        content: "",
        internal: true,
        thinking: { thinkingId: "t-2", text: "换一个来源。", durationMs: 700 },
      },
      { id: "5", role: "assistant", content: "最终答案是……" },
    ];
    const { container } = render(<ChatThread selectors={baseSelectors({ messages })} />);

    const turnGroups = Array.from(container.querySelectorAll(".chat-turn"));
    // The thinking blocks and tool rows share ONE turn group (no split).
    expect(turnGroups).toHaveLength(1);
    // Both thinking rows and both tool rows are inside that single group.
    expect(container.querySelectorAll(".tr-row[data-thinking]")).toHaveLength(2);
    expect(container.querySelectorAll(".tr-row")).toHaveLength(4); // 2 thinking + 2 tool
  });
});
