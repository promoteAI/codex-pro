"""Sampling + tool loop — one inference pass until the model stops calling tools.

Aligned with reference/codex `session/turn.rs` sampling path: interrupt checks,
budget gates, streaming, truncation recovery, then hand tool batches to
ToolOrchestrator. Reflection / nudge aggregation stays in InferenceStage.run().
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable, TYPE_CHECKING

from loguru import logger

from codex_pro.agent.degraded_notice import (
    REASON_LOOP_EXHAUSTED,
    REASON_OUTPUT_TRUNCATED,
    notice_for,
)
from codex_pro.agent.pipeline.tool_orchestrator import BatchCounters
from codex_pro.agent.pipeline.types import PipelineContext
from codex_pro.agent.thinking_stream import ThinkingStream
from codex_pro.cost.budget import BudgetExceeded
from codex_pro.models.provider import LLMResponse
from codex_pro.models.router import RouteDecision

if TYPE_CHECKING:
    from codex_pro.agent.pipeline.tool_orchestrator import ToolOrchestrator
    from codex_pro.agent.pipeline.turn_events import TurnEventEmitter
    from codex_pro.agent.tools.circuit_breaker import ToolCircuitBreaker
    from codex_pro.agent.tools.registry import ToolRegistry
    from codex_pro.cost.budget import CostTracker
    from codex_pro.models.inference import InferenceController
    from codex_pro.observability.monitor import TraceLogger


def merge_continuation(existing: str, continuation: str, overlap_window: int = 2000) -> str:
    """Join model continuation chunks while removing a repeated boundary."""
    if not existing:
        return continuation or ""
    if not continuation:
        return existing
    limit = min(len(existing), len(continuation), max(1, overlap_window))
    for size in range(limit, 0, -1):
        if existing[-size:] == continuation[:size]:
            return existing + continuation[size:]
    return existing + continuation


@dataclass
class LoopResult:
    """Output of one tool loop pass, used by InferenceStage.run() for reflection."""

    response_text: str = ""
    total_tool_calls: int = 0
    loop_exhausted: bool = True
    budget_halted: bool = False
    forced_convergence: bool = False
    interrupted: bool = False
    errored: bool = False
    content_filtered: bool = False
    artifact_incomplete: bool = False
    output_truncated: bool = False
    should_review_skills: bool = False
    should_review_memory: bool = False
    skill_iters: int = 0
    memory_iters: int = 0
    degraded_notices: list[str] = field(default_factory=list)


ChatStreamFn = Callable[..., Awaitable[tuple[LLMResponse, RouteDecision]]]


class ToolLoop:
    """Runs model sampling rounds and delegates tool batches to ToolOrchestrator."""

    def __init__(
        self,
        *,
        tools: ToolRegistry,
        circuit_breaker: ToolCircuitBreaker,
        tracer: TraceLogger,
        events: TurnEventEmitter,
        orchestrator: ToolOrchestrator,
        chat_stream: ChatStreamFn,
        can_retract_draft: Callable[[str], bool],
        cost_tracker: CostTracker | None = None,
        telemetry: Any = None,
        inference: InferenceController | None = None,
        interrupt_manager: Any = None,
        hook_registry: Any = None,
        default_model: str = "",
        max_iterations: int = 25,
        max_output_continuations: int = 3,
        continuation_overlap_chars: int = 2000,
        concurrency_enabled: bool = False,
        max_concurrent: int = 1,
    ) -> None:
        self._tools = tools
        self._circuit_breaker = circuit_breaker
        self._tracer = tracer
        self._events = events
        self._orchestrator = orchestrator
        self._chat_stream = chat_stream
        self._can_retract_draft = can_retract_draft
        self._cost_tracker = cost_tracker
        self._telemetry = telemetry
        self._inference = inference
        self._interrupt = interrupt_manager
        self._hook_registry = hook_registry
        self._default_model = default_model
        self._max_iterations = max_iterations
        self._max_output_continuations = max_output_continuations
        self._continuation_overlap_chars = continuation_overlap_chars
        self._concurrency_enabled = concurrency_enabled
        self._max_concurrent = max_concurrent
        self._host: Any = None

    def bind_host(self, host: Any) -> None:
        """Stage remains source of truth for attrs tests mutate after construction."""
        self._host = host

    def _live(self, name: str) -> Any:
        if self._host is not None:
            return getattr(self._host, name)
        return getattr(self, name)

    async def run(self, ctx: PipelineContext, messages: list[dict[str, Any]]) -> LoopResult:
        """Run one pass of the tool loop and return a LoopResult.

        Nudge counters are read from session.metadata but NOT written back —
        run() is responsible for persisting them after all passes complete.
        """
        event = ctx.event
        session = ctx.session
        trace_id = ctx.trace_id
        tool_defs = ctx.tool_defs
        stream_publisher = ctx.stream_publisher

        # Standard inference loop
        response_text = ""
        _repeat_tracker: dict[str, int] = {}
        loop_exhausted = True
        budget_halted = False
        # Degraded-convergence controls: force_no_tools strips tools from the
        # NEXT call (set by the truncation recovery below). forcing_final marks the last
        # iteration's forced-conclusion call; forced_convergence records that
        # the pass ended that way so run() keeps the plan resumable.
        force_no_tools = False
        empty_truncation_retried = False
        continuation_attempts = 0
        continuation_active = False
        forcing_final = False
        forced_convergence = False
        interrupted = False
        errored = False
        content_filtered = False
        artifact_incomplete = False
        output_truncated = False
        artifact_contract_retries = 0

        # Read nudge counters from session (do NOT write back — run() owns that)
        _skill_iters = session.metadata.get("_nudge_tool_iters_skill", 0)
        _memory_iters = session.metadata.get("_nudge_tool_iters_memory", 0)

        # Mutable carrier for the running totals/flags the per-batch tool
        # executor updates in place. Persists across loop iterations.
        counters = BatchCounters(
            total_tool_calls=0,
            skill_iters=_skill_iters,
            memory_iters=_memory_iters,
            should_review_skills=False,
            should_review_memory=False,
            degraded_notices=[],
        )

        on_delta = stream_publisher.on_delta if ctx.publish_response else None
        # Whether this channel may show a draft that might later be retracted.
        # Decided here (not in the provider) because only this layer knows the
        # channel; see chat_stream_with_retry's draft_policy contract.
        _draft_policy = (
            "stream" if self._can_retract_draft(event.channel) else "buffer"
        )

        for iteration in range(self._max_iterations):
            # Cooperative interrupt checkpoint. A Ctrl+C interrupt frame set this
            # flag on a lock-free path; stop cleanly at the iteration boundary so
            # session history, memory writes and tool side effects are never left
            # half-applied (the reason we do NOT hard-cancel the task). Keep any
            # text produced so far and mark the turn as user-stopped, not
            # exhausted, so run() treats it as a real (if partial) result.
            if (
                self._live("_interrupt") is not None
                and self._live("_interrupt").is_interrupted(getattr(event, "session_key", ""))
            ):
                notice = "⏹ 已按你的请求停止。"
                response_text = (
                    f"{response_text}\n\n{notice}" if response_text.strip() else notice
                )
                loop_exhausted = False
                interrupted = True
                break

            # Filter out circuit-broken tools
            unavailable = self._circuit_breaker.get_unavailable_tools()
            active_tool_defs = [
                t for t in tool_defs
                if t.get("function", {}).get("name") not in unavailable
            ] if unavailable else tool_defs

            if force_no_tools:
                active_tool_defs = []
            elif iteration == self._max_iterations - 1 and iteration > 0 and active_tool_defs:
                # Final-answer forcing: the last iteration must produce a
                # conclusion instead of yet another tool round. Without this,
                # exhausting the loop discards the entire turn's work and the
                # user gets a generic failure. Strip tools and tell the model
                # to wrap up. The LOOP_EXHAUSTED notice is appended only when
                # this forced call actually delivers content — attaching it
                # here would pair "以上是目前的进展" with a turn that may end
                # in a budget halt or provider error and show no progress.
                active_tool_defs = []
                forcing_final = True
                forced_convergence = True
                messages.append({
                    "role": "user",
                    "content": (
                        "[系统] 已达到本轮工具调用上限,不能再调用工具。"
                        "请基于已收集到的信息直接给出最终结论;"
                        "如果任务尚未完成,请说明当前进展和剩余缺口。"
                    ),
                })

            llm_span = self._tracer.start_span(trace_id, f"llm_{iteration}", "llm_call", "llm_call")

            # pre_llm_call hook
            if self._live("_hook_registry") and self._live("_hook_registry").has_hooks("pre_llm_call"):
                messages = await self._live("_hook_registry").dispatch_modify(
                    "pre_llm_call", messages, active_tool_defs, self._default_model,
                )

            # Hard budget gate: stop before spending more once the daily cap is hit.
            if self._live("_cost_tracker") is not None:
                try:
                    self._live("_cost_tracker").enforce()  # raises BudgetExceeded when daily hard cap hit
                except BudgetExceeded as e:
                    logger.warning("Budget gate stopped inference: {}", e)
                    self._tracer.end_span(llm_span, metadata={"budget_exceeded": True})
                    response_text = str(e)
                    loop_exhausted = False
                    budget_halted = True
                    break

            _llm_started = time.monotonic()
            # One thinking stream per LLM round. Built even when nothing will
            # subscribe (non-cli channel) — it is a few attribute assignments,
            # and `_thinking_sink` returning None is what actually keeps the
            # provider from paying for the callback.
            _thinking = ThinkingStream()
            response, route_decision = await self._chat_stream(
                messages=messages,
                tools=active_tool_defs if active_tool_defs else None,
                on_delta=on_delta,
                on_reasoning=self._events.thinking_sink(event, _thinking, _llm_started),
                task_type=ctx.task_type,
                content=event.text,
                draft_policy=_draft_policy,
            )

            # Optimistic streaming: the draft we just published belongs to this
            # iteration only. If the model chose to call a tool, that text was a
            # pre-tool preamble and the real answer comes from a later
            # iteration — retract it so the two never appear concatenated.
            if (
                _draft_policy == "stream"
                and on_delta is not None
                and response.has_tool_calls
            ):
                await stream_publisher.discard()

            # Surface model reasoning as a thinking event. Two shapes, one line
            # on screen: providers that stream reasoning have already published
            # partial snapshots under _thinking.thinking_id and this closes it
            # out; providers that don't emit their whole trace here for the
            # first time.
            await self._events.settle_thinking(
                event, _thinking, response,
                int((time.monotonic() - _llm_started) * 1000),
            )

            # post_llm_call hook
            if self._live("_hook_registry") and self._live("_hook_registry").has_hooks("post_llm_call"):
                response = await self._live("_hook_registry").dispatch_modify(
                    "post_llm_call", response, messages,
                )

            self._tracer.end_span(
                llm_span,
                metadata={
                    "model": route_decision.model,
                    "provider": route_decision.provider_name,
                    "route_reason": route_decision.reason,
                    "finish": response.finish_reason,
                    "raw_finish": response.raw_finish_reason,
                    "requested_max_tokens": route_decision.max_tokens,
                },
            )

            if self._live("_telemetry") and self._live("_telemetry").available and response.usage:
                from codex_pro.observability.spans import start_llm_span, record_llm_usage, end_llm_span
                otel_span = start_llm_span(self._live("_telemetry").get_tracer(), route_decision.model, route_decision.provider_name)
                record_llm_usage(otel_span, response.usage, route_decision.model)
                end_llm_span(otel_span)

            if self._live("_cost_tracker") is not None and response.usage:
                _cost_before = self._live("_cost_tracker").spent_usd
                await self._live("_cost_tracker").record(
                    route_decision.model, response.usage, route_decision.provider_name,
                    channel=event.channel,
                )
                _u = response.usage if isinstance(response.usage, dict) else {}
                _turn_tokens = int(
                    _u.get("total_tokens")
                    or (int(_u.get("prompt_tokens") or _u.get("input_tokens") or 0)
                        + int(_u.get("completion_tokens") or _u.get("output_tokens") or 0))
                )
                # Prompt tokens = the real current-window occupancy for the gauge.
                _measured_used = int(_u.get("prompt_tokens") or _u.get("input_tokens") or 0)
                # Push the routed model's real window into the (shared) compressor
                # so the gauge shows the true max and compression triggers against
                # the capped budget — both track the model that actually answered.
                self._events.sync_context_window(route_decision.context_window)
                await self._events.emit_cost(
                    event, _turn_tokens,
                    self._live("_cost_tracker").spent_usd - _cost_before,
                    self._live("_cost_tracker").spent_usd,
                    model=route_decision.model,
                    messages=messages,
                    measured_used=_measured_used,
                )

            issues = self._inference.validate_response(response)
            if issues:
                logger.warning("Inference issues: {}", issues)

            if response.finish_reason == "error":
                logger.warning("LLM returned error in iteration {}: {}", iteration, response.content)
                if not response_text:
                    response_text = "I encountered an issue processing your request. Please try again."
                loop_exhausted = False
                errored = True
                break

            if response.finish_reason == "content_filter":
                logger.warning(
                    "LLM completion blocked by provider content policy in iteration {} (model {})",
                    iteration, route_decision.model,
                )
                filtered_notice = "⚠️ 模型服务因内容安全策略未返回后续正文。请调整请求内容后重试。"
                if response.content:
                    response_text = merge_continuation(
                        response_text, response.content, self._continuation_overlap_chars,
                    )
                response_text = f"{response_text}\n\n{filtered_notice}" if response_text else filtered_notice
                loop_exhausted = False
                content_filtered = True
                break

            if response.finish_reason == "length":
                # Output hit max_tokens. Provider-level reasoning promotion may
                # already have recovered text into content; whatever we have is
                # partial. Never treat this as a clean stop.
                logger.warning(
                    "LLM output truncated at max_tokens in iteration {} "
                    "(model {}, requested_max_tokens {}, completion_tokens {}, content_len {}, raw_finish {})",
                    iteration,
                    route_decision.model,
                    route_decision.max_tokens,
                    int((response.usage or {}).get("completion_tokens") or (response.usage or {}).get("output_tokens") or 0),
                    len(response.content or ""),
                    response.raw_finish_reason or "<unreported>",
                )
                if (
                    ctx.artifact_required
                    and "artifact_deliver" not in counters.successful_tools
                ):
                    if (
                        artifact_contract_retries < self._max_output_continuations
                        and iteration + 1 < self._max_iterations
                    ):
                        artifact_contract_retries += 1
                        response_text = ""
                        continuation_active = False
                        force_no_tools = False
                        if _draft_policy == "stream" and on_delta is not None:
                            await stream_publisher.discard()
                        messages.append({
                            "role": "user",
                            "content": (
                                "[System: artifact contract recovery] Your previous prose or tool-call "
                                "payload hit the single-output limit and was not accepted as the report. "
                                "Continue the required artifact workflow now. Issue exactly one artifact "
                                "tool call in this turn; for artifact_append keep content within its schema "
                                "limit, then wait for the tool result. Do not paste report prose into chat."
                            ),
                        })
                        logger.info(
                            "Recovering truncated artifact workflow (attempt {}/{})",
                            artifact_contract_retries, self._max_output_continuations,
                        )
                        continue
                    counters.degraded_notices.append(notice_for(REASON_OUTPUT_TRUNCATED))
                    response_text = (
                        "⚠️ 报告在生成产物时连续命中单次输出上限，未能完成文件交付。"
                        "已保留会话中的草稿记录，可回复“继续”重试。"
                    )
                    loop_exhausted = False
                    artifact_incomplete = True
                    output_truncated = True
                    break
                if response.content:
                    response_text = merge_continuation(
                        response_text, response.content, self._continuation_overlap_chars,
                    )
                    if (
                        continuation_attempts < self._max_output_continuations
                        and iteration + 1 < self._max_iterations
                    ):
                        continuation_attempts += 1
                        continuation_active = True
                        force_no_tools = True
                        messages.append({"role": "assistant", "content": response.content})
                        messages.append({
                            "role": "user",
                            "content": (
                                "[系统：自动续写] 上一段因单次输出上限中断。"
                                "请从上一段最后一个字符之后继续，只输出缺失的后续正文；"
                                "不要重复标题、前言或已输出段落，不要调用工具，并完整收尾。"
                            ),
                        })
                        logger.info(
                            "Continuing truncated output (attempt {}/{}, accumulated_chars={})",
                            continuation_attempts, self._max_output_continuations, len(response_text),
                        )
                        continue
                    counters.degraded_notices.append(notice_for(REASON_OUTPUT_TRUNCATED))
                    if forcing_final:
                        counters.degraded_notices.append(notice_for(REASON_LOOP_EXHAUSTED))
                    loop_exhausted = False
                    output_truncated = True
                    break
                if not empty_truncation_retried and iteration + 1 < self._max_iterations:
                    # Nothing recoverable — retry once without tools, asking
                    # for a bounded plain-text conclusion. One extra call
                    # salvages the whole turn's collected context. Requires a
                    # remaining iteration: on the last one, continue would fall
                    # off the range and the injected instruction would never
                    # be answered, so give up below instead.
                    empty_truncation_retried = True
                    force_no_tools = True
                    messages.append({
                        "role": "user",
                        "content": (
                            "[系统] 你上一次的回复超出输出长度上限且未产生任何正文。"
                            "请不要调用工具,直接用简短的篇幅给出最终结论。"
                        ),
                    })
                    continue
                # Retry also truncated empty (or no iterations left to retry
                # in) — give up with the truncation notice.
                counters.degraded_notices.append(notice_for(REASON_OUTPUT_TRUNCATED))
                loop_exhausted = False
                output_truncated = True
                break

            if response.content:
                if continuation_active:
                    response_text = merge_continuation(
                        response_text, response.content, self._continuation_overlap_chars,
                    )
                else:
                    response_text = response.content

            # Post-LLM interrupt checkpoint. An interrupt may have arrived DURING
            # the (long) LLM call above. Check here — BEFORE the has_tool_calls
            # branch — so BOTH paths are covered: a plain-text reply (the common
            # case, which breaks just below) and a tool-call batch (discarded
            # before it runs). Keep whatever text the model produced and mark the
            # turn user-stopped, not exhausted. Placed before the assistant
            # tool_calls message is appended, so pending calls are dropped cleanly
            # with no dangling tool_calls message to corrupt the next turn.
            if (
                self._live("_interrupt") is not None
                and self._live("_interrupt").is_interrupted(getattr(event, "session_key", ""))
            ):
                notice = "⏹ 已按你的请求停止。"
                response_text = (
                    f"{response_text}\n\n{notice}" if response_text.strip() else notice
                )
                loop_exhausted = False
                interrupted = True
                break

            if not response.has_tool_calls:
                if (
                    ctx.artifact_required
                    and "artifact_deliver" not in counters.successful_tools
                ):
                    if (
                        artifact_contract_retries < self._max_output_continuations
                        and iteration + 1 < self._max_iterations
                    ):
                        artifact_contract_retries += 1
                        response_text = ""
                        continuation_active = False
                        force_no_tools = False
                        if _draft_policy == "stream" and on_delta is not None:
                            await stream_publisher.discard()
                        messages.append({
                            "role": "user",
                            "content": (
                                "[System: unmet artifact contract] A chat-only answer does not complete "
                                "this request. Use the required create, one append per turn, validate, "
                                "finalize, and deliver workflow. Issue exactly one artifact tool call now."
                            ),
                        })
                        continue
                    response_text = (
                        "⚠️ 本轮未成功生成并交付要求的报告文件，因此任务不会被标记为完成。"
                        "请回复“继续”重试产物流程。"
                    )
                    loop_exhausted = False
                    artifact_incomplete = True
                    break
                if forcing_final:
                    # The forced final call delivered its conclusion — now the
                    # "以上是目前的进展" notice is truthful. Gate on actual
                    # text so an empty forced reply doesn't claim progress
                    # that was never shown. The plan stays NOT complete: the
                    # model was cut off, not finished.
                    if response_text:
                        counters.degraded_notices.append(notice_for(REASON_LOOP_EXHAUSTED))
                elif ctx.execution_plan and not ctx.execution_plan.is_complete:
                    from codex_pro.agent.planning.models import StepStatus

                    if not any(
                        step.status == StepStatus.FAILED
                        for step in ctx.execution_plan.steps
                    ):
                        ctx.execution_plan.is_complete = True
                if ctx.activity is not None:
                    ctx.activity.set_generating()
                loop_exhausted = False
                break

            if response.content:
                await self._events.emit_progress(ctx, response.content)

            assistant_msg: dict[str, Any] = {"role": "assistant", "content": response.content}
            assistant_msg["tool_calls"] = [tc.to_openai_format() for tc in response.tool_calls]
            # Anthropic validates the signature on every thinking block and
            # requires them replayed unmodified in the turn that continues a tool
            # call. They ride alongside the text rather than replacing it so the
            # OpenAI-shaped `content` stays intact for every other provider; the
            # Anthropic converter picks them up and others drop them. Kept off the
            # persisted session history, which stays provider-neutral.
            if getattr(response, "thinking_blocks", None):
                assistant_msg["thinking_blocks"] = response.thinking_blocks
            messages.append(assistant_msg)

            tool_call_fmts = [tc.to_openai_format() for tc in response.tool_calls]
            session.add_message("assistant", response.content or "", tool_calls=tool_call_fmts)

            terminal_denial = await self._orchestrator.execute_tool_batch(
                ctx=ctx, response=response, messages=messages, session=session,
                trace_id=trace_id, iteration=iteration, event=event,
                repeat_tracker=_repeat_tracker, counters=counters,
            )
            if terminal_denial:
                # ResponseStage will replace the generic fallback below with the
                # deterministic degraded notice. Drop any pre-tool preamble so
                # the final reply cannot contradict the timeout/delivery fact.
                response_text = ""
                loop_exhausted = False
                break
            if ctx.artifact_required and "artifact_deliver" in counters.successful_tools:
                # Delivery is the artifact contract's terminal side effect. Do
                # not spend another model call merely to phrase a summary: that
                # call could fail, be filtered, or truncate after the user has
                # already received the file and falsely downgrade a success.
                response_text = "报告已生成、校验并交付。"
                loop_exhausted = False
                break

        if loop_exhausted:
            logger.warning(
                "Agent loop exhausted max iterations ({}) for session {}",
                self._max_iterations, event.session_key,
            )
            if not response_text:
                response_text = "I encountered an issue processing your request. Please try again or rephrase your question."

        # Safety net independent of loop_exhausted: empty content with no tool
        # calls breaks the loop with loop_exhausted=False, bypassing the guard
        # above. Ensure the user always receives a reply.
        if not response_text:
            response_text = "I encountered an issue processing your request. Please try again or rephrase your question."

        if isinstance(getattr(session, "metadata", None), dict):
            if ctx.artifact_required and "artifact_deliver" not in counters.successful_tools:
                from codex_pro.agent.pipeline.context.artifact_intent import (
                    ARTIFACT_CONTINUATION_VERSION,
                )

                session.metadata["_artifact_continuation"] = {
                    "version": ARTIFACT_CONTINUATION_VERSION,
                    "trace_id": trace_id,
                    "source_event_id": str(ctx.artifact_intent_id or event.event_id or ""),
                    # conversation_context_key changes on reset, so a marker
                    # from an earlier epoch can never resume into the new one.
                    "context_key": str(ctx.context_key or event.session_key),
                    "updated_at": time.time(),
                }
            else:
                # A successful delivery and every non-artifact turn both
                # supersede the old recovery marker.  Previously ordinary
                # questions left it behind indefinitely, allowing a later bare
                # "continue" to revive an unrelated report.
                session.metadata.pop("_artifact_continuation", None)
            if output_truncated:
                session.metadata["_output_continuation"] = {
                    "tail": response_text[-self._continuation_overlap_chars:],
                    "trace_id": trace_id,
                    "attempts": continuation_attempts,
                    "updated_at": time.time(),
                }
            else:
                session.metadata.pop("_output_continuation", None)

        return LoopResult(
            response_text=response_text,
            total_tool_calls=counters.total_tool_calls,
            loop_exhausted=loop_exhausted,
            budget_halted=budget_halted,
            forced_convergence=forced_convergence,
            interrupted=interrupted,
            errored=errored,
            content_filtered=content_filtered,
            artifact_incomplete=artifact_incomplete,
            output_truncated=output_truncated,
            should_review_skills=counters.should_review_skills,
            should_review_memory=counters.should_review_memory,
            skill_iters=counters.skill_iters,
            memory_iters=counters.memory_iters,
            degraded_notices=counters.degraded_notices,
        )

