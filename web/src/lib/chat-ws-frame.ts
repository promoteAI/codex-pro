import type { ChatFrame } from "./chat-ws";

/** Cognitive types emitted by the agent loop, ported from
 *  codex_pro/cli/tui/protocol.py:parse_cog_frame. */
export const COG_TYPES = new Set([
  "memory_recalled",
  "memory_written",
  "thinking",
  "tool_call",
  "approval_request",
  "approval_closed",
  "cost_update",
  "heartbeat",
  "evolution",
  "clarify_request",
  "clarify_closed",
]);

export interface CogEvent {
  cog_type: string;
  cog_event_id: string;
  inbound_event_id: string;
  data: Record<string, unknown>;
  summary: string;
}

/** Extract a cognitive event from a frame, or null. Mirrors
 *  codex_pro/cli/tui/protocol.py:parse_cog_frame. */
export function parseCogFrame(frame: ChatFrame): CogEvent | null {
  if (frame.message_kind !== "cognitive") return null;
  const meta = frame.metadata ?? {};
  const cogType = String(meta.cog_type ?? "");
  if (!COG_TYPES.has(cogType)) return null;
  return {
    cog_type: cogType,
    cog_event_id: String(meta.cog_event_id ?? ""),
    inbound_event_id: String(meta._inbound_event_id ?? ""),
    data: (meta.data ?? {}) as Record<string, unknown>,
    summary: frame.text ?? "",
  };
}

/** A live thinking/trace block keyed by thinking_id (fallback cog_event_id). */
export interface ThinkingBlock {
  thinkingId: string;
  text: string;
  streaming: boolean;
  durationMs: number;
  retracted: boolean;
  cogEventId: string;
}

export type ThinkingBlocks = Record<string, ThinkingBlock>;

/** Update the thinking block for a thinking cognitive event.
 *
 *  Thinking frames carry the WHOLE trace so far (a replaceable snapshot,
 *  see codex_pro/agent/thinking_stream.py) — never a delta — so we replace
 *  `text` rather than append. A `retracted` frame removes the block entirely
 *  (the reasoning turned out to BE the answer). */
export function applyThinkingFrame(
  blocks: ThinkingBlocks,
  ev: CogEvent,
): ThinkingBlocks {
  const data = ev.data;
  const thinkingId = String(data.thinking_id ?? "") || ev.cog_event_id;
  const text = String(data.text ?? "");
  const retracted = Boolean(data.retracted);

  if (retracted) {
    const next = { ...blocks };
    delete next[thinkingId];
    return next;
  }

  return {
    ...blocks,
    [thinkingId]: {
      thinkingId,
      text,
      streaming: Boolean(data.streaming),
      durationMs: Number(data.duration_ms ?? 0),
      retracted: false,
      cogEventId: ev.cog_event_id,
    },
  };
}

/** Dedup of seen cog_event_ids so a reconnect re-delivery does not double-render. */
export class CogDedup {
  private seen = new Set<string>();

  seenOnce(cogEventId: string): boolean {
    if (!cogEventId) return false;
    if (this.seen.has(cogEventId)) return true;
    this.seen.add(cogEventId);
    return false;
  }
}
