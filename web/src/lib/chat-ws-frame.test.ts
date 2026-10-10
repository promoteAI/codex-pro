import { describe, it, expect } from "vitest";
import {
  parseCogFrame,
  applyThinkingFrame,
  CogDedup,
  COG_TYPES,
} from "./chat-ws-frame";

describe("parseCogFrame", () => {
  it("parses a cognitive thinking frame", () => {
    const ev = parseCogFrame({
      type: "message",
      message_kind: "cognitive",
      text: "思考中",
      metadata: {
        cog_type: "thinking",
        cog_event_id: "cog-1",
        _inbound_event_id: "evt-1",
        data: { thinking_id: "th-1", text: "x", streaming: true },
      },
    });
    expect(ev).toMatchObject({
      cog_type: "thinking",
      cog_event_id: "cog-1",
      inbound_event_id: "evt-1",
      summary: "思考中",
    });
    expect(ev?.data.text).toBe("x");
  });

  it("rejects non-cognitive frames", () => {
    expect(parseCogFrame({ type: "message", message_kind: "streaming", text: "x" })).toBe(null);
  });

  it("rejects unknown cog types", () => {
    expect(
      parseCogFrame({
        type: "message",
        message_kind: "cognitive",
        metadata: { cog_type: "not_a_real_type" },
      }),
    ).toBe(null);
  });
});

describe("applyThinkingFrame", () => {
  it("replaces the whole trace (snapshot, not delta) for a thinking_id", () => {
    let blocks = applyThinkingFrame({}, {
      cog_type: "thinking",
      cog_event_id: "cog-1",
      inbound_event_id: "evt-1",
      data: { thinking_id: "th-1", text: "Let me think", streaming: true, duration_ms: 100 },
      summary: "思考中",
    });
    blocks = applyThinkingFrame(blocks, {
      cog_type: "thinking",
      cog_event_id: "cog-2",
      inbound_event_id: "evt-1",
      data: { thinking_id: "th-1", text: "Let me think through the options", streaming: true, duration_ms: 200 },
      summary: "思考中",
    });
    // text is replaced, not appended.
    expect(blocks["th-1"]?.text).toBe("Let me think through the options");
  });

  it("a retracted frame removes the block", () => {
    const blocks = applyThinkingFrame({ "th-1": { thinkingId: "th-1", text: "x", streaming: true, durationMs: 0, retracted: false, cogEventId: "cog-1" } }, {
      cog_type: "thinking",
      cog_event_id: "cog-2",
      inbound_event_id: "evt-1",
      data: { thinking_id: "th-1", text: "", streaming: false, duration_ms: 100, retracted: true },
      summary: "思考 0.1s",
    });
    expect(blocks["th-1"]).toBeUndefined();
  });

  it("falls back to cog_event_id when thinking_id is absent", () => {
    const blocks = applyThinkingFrame({}, {
      cog_type: "thinking",
      cog_event_id: "cog-9",
      inbound_event_id: "evt-1",
      data: { text: "x", streaming: true },
      summary: "思考中",
    });
    expect(blocks["cog-9"]?.text).toBe("x");
  });
});

describe("CogDedup", () => {
  it("returns true the second time the same cog_event_id is seen", () => {
    const d = new CogDedup();
    expect(d.seenOnce("cog-1")).toBe(false);
    expect(d.seenOnce("cog-1")).toBe(true);
    expect(d.seenOnce("cog-2")).toBe(false);
  });

  it("ignores empty ids (never dedups an unkeyed frame)", () => {
    const d = new CogDedup();
    expect(d.seenOnce("")).toBe(false);
    expect(d.seenOnce("")).toBe(false);
  });
});

describe("COG_TYPES", () => {
  it("includes the types the TUI protocol recognizes", () => {
    for (const t of ["thinking", "tool_call", "approval_request", "approval_closed", "clarify_request", "clarify_closed", "memory_recalled"]) {
      expect(COG_TYPES.has(t)).toBe(true);
    }
  });
});
