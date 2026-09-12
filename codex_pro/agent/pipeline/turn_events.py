"""Turn-scoped event emission for the inference pipeline.

Mirrors reference/codex separation of streaming/event side-effects from the
sampling loop and tool orchestrator. InferenceStage owns the LLM loop;
TurnEventEmitter owns outbound progress/cost/thinking frames.
"""
from __future__ import annotations

import time
from typing import Any, TYPE_CHECKING

from loguru import logger

from codex_pro.agent.cognitive_emitter import should_emit_cognitive
from codex_pro.agent.pipeline.types import PipelineContext
from codex_pro.bus.events import OutboundEvent

if TYPE_CHECKING:
    from codex_pro.agent.cognitive_emitter import CognitiveEmitter
    from codex_pro.bus.queue import MessageBus
    from codex_pro.config.schema import Config


class TurnEventEmitter:
    """Publishes mid-turn cognitive and progress events onto the message bus."""

    def __init__(
        self,
        *,
        bus: MessageBus,
        config: Config,
        cognitive_emitter: CognitiveEmitter | None = None,
        compressor: Any = None,
        memory_store: Any = None,
        turn_run_store: Any = None,
    ) -> None:
        self._bus = bus
        self._config = config
        self._cog = cognitive_emitter
        self._compressor = compressor
        self._memory_store = memory_store
        self._turn_runs = turn_run_store

    async def emit_progress(self, ctx: PipelineContext, text: str, *, tool_hint: bool = False) -> None:
        if not ctx.publish_response:
            return
        event = ctx.event
        out = OutboundEvent.text_reply(
            channel=event.channel, chat_id=event.chat_id, text=text, reply_to_id=event.reply_to_id,
        )
        out.is_final = False
        out.message_kind = "tool" if tool_hint else "progress"
        out.metadata = dict(event.metadata)
        out.metadata.update({"_progress": True, "_tool_hint": tool_hint, "_inbound_event_id": event.event_id})
        await self._bus.publish_outbound(out)
        # Only count this as visible feedback if it actually reached the user.
        # On uneditable channels (e.g. weixin) the ChannelManager drops progress
        # events; counting a dropped event would starve the heartbeat throttle.
        if ctx.activity is not None and not out.metadata.get("_drop"):
            ctx.activity.mark_visible_feedback()

    async def emit_tool_call(
        self, event, name, params, status, result_summary,
        *, tool_call_id: str = "", result_meta: dict | None = None,
        duration_ms: int | None = None,
    ) -> None:
        """Surface a tool invocation to the cognition stream (cli-gated).

        Emitted twice per call, paired by tool_call_id: once with
        status="running" before execution, once with the terminal status.
        result_meta carries producer-supplied counts (line/hit/entry totals)
        computed on the full result before truncation — the client turns them
        into Chinese words and must never recount the truncated result_text."""
        # The durable ledger is independent of cognitive-frame visibility.
        turn_runs = getattr(self, "_turn_runs", None)
        if turn_runs is not None:
            try:
                await turn_runs.mark_activity(
                    event.event_id,
                    status=(
                        "waiting_clarification"
                        if status == "running" and name == "clarify"
                        else "running"
                    ),
                    current_tool=name if status == "running" else "",
                )
            except Exception as e:
                logger.debug("Turn activity write failed for {}: {}", event.event_id, e)
        # Gate before slicing params: IM channels skip the comprehension too.
        if self._cog is None or not self._cog.active(event):
            return
        safe_params = {k: str(v)[:120] for k, v in (params or {}).items()}
        await self._cog.emit(
            event, "tool_call",
            {"name": name, "params": safe_params, "status": status,
             "tool_call_id": tool_call_id, "result_meta": result_meta,
             "result_text": str(result_summary)[:300],
             "duration_ms": duration_ms},
            f"🔧 {name} · {status}",
        )

    def sync_context_window(self, display_window: int) -> None:
        """Retarget the shared compressor to the model that just answered.

        display_window is the routed model's real window (for the gauge); the
        compression budget is capped by session.compression_window_cap so a
        large-window model does not defer compression until context balloons.
        """
        if not display_window or display_window <= 0:
            return
        compressor = getattr(self, "_compressor", None)
        if compressor is None or not hasattr(compressor, "update_context_window"):
            return
        cap = getattr(self._config.session, "compression_window_cap", 0) or 0
        comp_window = min(display_window, cap) if cap > 0 else display_window
        try:
            compressor.update_context_window(display_window, comp_window)
        except Exception:
            logger.debug("context window sync failed", exc_info=True)

    async def emit_cost(self, event, turn_tokens, turn_cost, total_cost,
                         model: str = "", messages: list | None = None,
                         measured_used: int = 0) -> None:
        """Surface a cost update to the cognition stream (cli-gated).

        ``measured_used`` is the provider-reported prompt-token count for the
        round — the true occupancy. It is preferred over the local estimate;
        the estimate is only a fallback when the provider omitted usage.
        """
        if self._cog is None:
            return
        context_used = 0
        context_max = 0
        compressor = getattr(self, "_compressor", None)
        if compressor is not None:
            context_max = getattr(compressor, "context_window_tokens", 0) or 0
            if measured_used and measured_used > 0:
                context_used = int(measured_used)
            elif messages:
                context_used = compressor.estimate_tokens(messages)
        memory_count = 0
        memory_store = getattr(self, "_memory_store", None)
        if memory_store is not None:
            try:
                memory_count = len(memory_store.list_all())
            except Exception:
                # This value is display-only telemetry; keep its zero fallback
                # when an optional memory backend cannot enumerate records.
                pass
        # Summaries carry TEXT ONLY, no leading glyph: the client owns the line
        # marker (cli/tui/glyphs.py) and prefixes its own, so an emoji here
        # rendered twice — and the emoji set is user-selectable client-side.
        await self._cog.emit(
            event, "cost_update",
            {"turn_tokens": int(turn_tokens), "turn_cost": round(turn_cost, 4),
             "total_cost": round(total_cost, 4),
             "model": model,
             "context_used": context_used,
             "context_max": context_max,
             "memory_count": memory_count},
            f"${round(total_cost, 4)}",
        )

    async def emit_memory_written(self, event, items) -> None:
        """Surface written/reinforced memory items to the cognition stream."""
        if self._cog is None or not items:
            return
        norm = [{"content": str(i.get("content", ""))[:200],
                 "source": i.get("source", "model_inferred"),
                 "op": i.get("op", "write")} for i in items]
        n = len(norm)
        await self._cog.emit(
            event, "memory_written", {"items": norm},
            f"写入/强化 {n} 条记忆",
        )

    def thinking_sink(self, event, stream, started_at: float):
        """Build the ``on_reasoning`` callback for one LLM round, or None.

        None when nobody renders cognitive frames on this channel: the provider
        then skips its forwarding branch entirely instead of building deltas that
        would be dropped at the emitter's gate.
        """
        if self._cog is None or not should_emit_cognitive(event.channel):
            return None

        async def on_reasoning(delta: str) -> None:
            snapshot = stream.add(delta)
            if snapshot is None:
                return
            await self.emit_thinking(
                event, int((time.monotonic() - started_at) * 1000), snapshot,
                thinking_id=stream.thinking_id, streaming=True,
            )

        return on_reasoning

    async def settle_thinking(self, event, stream, response, duration_ms) -> None:
        """Close out a round's thinking line once the response is in hand.

        Three cases, and the reason each needs handling:

        * The provider streamed and the trace survived on the response — emit a
          final non-streaming frame so the line stops saying "思考中" and gains
          its real duration.
        * The provider streamed but ``reasoning_content`` came back empty. That
          is _promote_reasoning: the reasoning WAS the answer, and it is about to
          be rendered as the reply body. Retract the trace, or the user reads the
          same text twice.
        * The provider never streamed — emit the whole trace once, exactly as
          before streaming existed.
        """
        reasoning = getattr(response, "reasoning_content", None)
        if stream.streamed:
            if reasoning:
                await self.emit_thinking(
                    event, duration_ms, reasoning,
                    thinking_id=stream.thinking_id,
                )
            else:
                await self.emit_thinking(
                    event, duration_ms, "",
                    thinking_id=stream.thinking_id, retracted=True,
                )
            return
        if reasoning:
            await self.emit_thinking(
                event, duration_ms, reasoning, thinking_id=stream.thinking_id,
            )

    async def emit_thinking(
        self, event, duration_ms, text, *,
        thinking_id: str = "", streaming: bool = False, retracted: bool = False,
    ) -> None:
        """Surface a reasoning/thinking span to the cognition stream.

        ``thinking_id`` ties the frames of one LLM round together so a client can
        update a single line in place instead of stacking a new one per frame.
        ``streaming`` marks a partial snapshot (more text is still coming);
        ``retracted`` asks the client to drop the line entirely, used when the
        reasoning turned out to BE the answer (see _promote_reasoning) and would
        otherwise appear twice.
        """
        if self._cog is None:
            return
        await self._cog.emit(
            event, "thinking",
            {"duration_ms": duration_ms, "text": str(text)[:2000],
             "thinking_id": thinking_id, "streaming": streaming,
             "retracted": retracted},
            ("思考中" if streaming else f"思考 {round(duration_ms / 1000, 1)}s"),
        )

    async def emit_evolution(self, event, phase, skill, detail) -> None:
        """Surface an evolution-engine event to the cognition stream."""
        if self._cog is None:
            return
        await self._cog.emit(
            event, "evolution",
            {"phase": phase, "skill": skill, "detail": str(detail)[:300]},
            f"{skill}: {phase}",
        )

