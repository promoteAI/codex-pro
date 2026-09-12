"""Inference stage — LLM call loop orchestration.

Pipeline role (mirrors reference/codex session turn control):
- InferenceStage.run(): reflection, nudge counters, plan-run status
- ToolLoop: sampling + iteration control
- ToolOrchestrator: approval → execute → writeback
- TurnEventEmitter: mid-turn outbound frames
"""
from __future__ import annotations

import asyncio
from typing import Any, TYPE_CHECKING

from loguru import logger

from codex_pro.agent.pipeline.tool_loop import LoopResult, ToolLoop
from codex_pro.agent.pipeline.tool_orchestrator import ToolOrchestrator
from codex_pro.agent.pipeline.turn_events import TurnEventEmitter
from codex_pro.agent.pipeline.types import InferenceResult, PipelineContext
from codex_pro.agent.streaming import channel_matches
from codex_pro.agent.tools.circuit_breaker import ToolCircuitBreaker
from codex_pro.models.provider import LLMResponse
from codex_pro.models.router import RouteDecision

# Historical private name still imported by tests.
_LoopResult = LoopResult

if TYPE_CHECKING:
    from codex_pro.agent.approval_gate import ApprovalGate
    from codex_pro.agent.cognitive_emitter import CognitiveEmitter
    from codex_pro.agent.planning.planner import AgentPlanner
    from codex_pro.agent.tools.registry import ToolRegistry
    from codex_pro.bus.queue import MessageBus
    from codex_pro.config.schema import Config
    from codex_pro.models.inference import InferenceController
    from codex_pro.models.provider import LLMProvider
    from codex_pro.models.router import ModelRouter
    from codex_pro.observability.monitor import TraceLogger
    from codex_pro.permissions.manager import CredentialManager


def merge_continuation(existing: str, continuation: str, overlap_window: int = 2000) -> str:
    """Join model continuation chunks while removing a repeated boundary.

    Re-exported from tool_loop for callers that historically imported it here.
    """
    from codex_pro.agent.pipeline.tool_loop import merge_continuation as _merge

    return _merge(existing, continuation, overlap_window)



class InferenceStage:
    """Orchestrates one turn of inference: sampling loop, tools, reflection."""

    _MAX_TOOL_RESULT_CHARS = 16000

    def __init__(
        self,
        *,
        config: Config,
        bus: MessageBus,
        provider: LLMProvider,
        router: ModelRouter | None,
        tools: ToolRegistry,
        approval_gate: ApprovalGate,
        credentials: CredentialManager,
        tracer: TraceLogger,
        telemetry: Any,
        inference: InferenceController,
        circuit_breaker: ToolCircuitBreaker,
        default_model: str,
        max_iterations: int,
        planner: AgentPlanner | None = None,
        plan_run_store: Any = None,
        cost_tracker: Any = None,
        cognitive_emitter: CognitiveEmitter | None = None,
        compressor: Any = None,
        memory_store: Any = None,
        clarify_manager: Any = None,
        interrupt_manager: Any = None,
        turn_run_store: Any = None,
    ) -> None:
        self._config = config
        self._bus = bus
        self._provider = provider
        self._router = router
        self._tools = tools
        self._approval_gate = approval_gate
        self._credentials = credentials
        self._tracer = tracer
        self._telemetry = telemetry
        self._inference = inference
        self._circuit_breaker = circuit_breaker
        self._default_model = default_model
        self._max_iterations = max_iterations
        raw_continuations = getattr(config.agent, "max_output_continuations", 3)
        raw_overlap = getattr(config.agent, "continuation_overlap_chars", 2000)
        self._max_output_continuations = (
            raw_continuations if isinstance(raw_continuations, int) else 3
        )
        self._continuation_overlap_chars = raw_overlap if isinstance(raw_overlap, int) else 2000
        self._hook_registry: Any = None
        self._nudge_interval: int = (
            config.skills.creation_nudge_interval
            if hasattr(config, "skills") and hasattr(config.skills, "creation_nudge_interval")
            else 0
        )
        self._memory_nudge_interval: int = (
            config.memory.memory_nudge_interval
            if hasattr(config.memory, "memory_nudge_interval")
            else 0
        )
        self._planner = planner
        self._plan_run_store = plan_run_store
        self._cost_tracker = cost_tracker
        self._cog = cognitive_emitter
        self._compressor = compressor
        self._memory_store = memory_store
        self._clarify = clarify_manager
        self._interrupt = interrupt_manager
        self._turn_runs = turn_run_store
        _tc = getattr(getattr(config, "agent", None), "tool_concurrency", None)
        self._concurrency_enabled: bool = bool(getattr(_tc, "enabled", False))
        self._max_concurrent: int = int(getattr(_tc, "max_concurrent", 1) or 1)

        self._events = TurnEventEmitter(
            bus=bus,
            config=config,
            cognitive_emitter=cognitive_emitter,
            compressor=compressor,
            memory_store=memory_store,
            turn_run_store=turn_run_store,
        )
        self._orchestrator = ToolOrchestrator(
            tools=tools,
            approval_gate=approval_gate,
            credentials=credentials,
            circuit_breaker=self._circuit_breaker,
            events=self._events,
            clarify_manager=clarify_manager,
            cognitive_emitter=cognitive_emitter,
            nudge_interval=self._nudge_interval,
            memory_nudge_interval=self._memory_nudge_interval,
            max_tool_result_chars=self._MAX_TOOL_RESULT_CHARS,
            concurrency_enabled=self._concurrency_enabled,
            max_concurrent=self._max_concurrent,
            telemetry=telemetry,
            plan_run_store=plan_run_store,
        )
        self._orchestrator.set_tracer(tracer)
        self._tool_loop = ToolLoop(
            tools=tools,
            circuit_breaker=self._circuit_breaker,
            tracer=tracer,
            events=self._events,
            orchestrator=self._orchestrator,
            chat_stream=self._chat_stream_with_routing,
            can_retract_draft=self._can_retract_draft,
            cost_tracker=cost_tracker,
            telemetry=telemetry,
            inference=inference,
            interrupt_manager=interrupt_manager,
            default_model=default_model,
            max_iterations=max_iterations,
            max_output_continuations=self._max_output_continuations,
            continuation_overlap_chars=self._continuation_overlap_chars,
            concurrency_enabled=self._concurrency_enabled,
            max_concurrent=self._max_concurrent,
        )
        self._tool_loop.bind_host(self)
        self._orchestrator.bind_host(self)

    def set_hook_registry(self, registry: Any) -> None:
        """Inject the plugin hook registry (attached after bootstrap)."""
        self._hook_registry = registry
        self._orchestrator.set_hook_registry(registry)
        self._tool_loop._hook_registry = registry

    async def _prepare_clarify(self, tool_call: Any, event: Any) -> None:
        """Compatibility wrapper — tests and callers still use the stage API."""
        target = getattr(self, "_orchestrator", None) or self
        await ToolOrchestrator.prepare_clarify(target, tool_call, event)

    async def _finish_clarify(self, tool_call: Any, event: Any) -> None:
        """Compatibility wrapper — tests and callers still use the stage API."""
        target = getattr(self, "_orchestrator", None) or self
        await ToolOrchestrator.finish_clarify(target, tool_call, event)

    async def _run_tool_loop(self, ctx: PipelineContext, messages: list[dict[str, Any]]):
        """Compatibility wrapper for tests that call the old private API."""
        return await self._tool_loop.run(ctx, messages)

    async def _execute_tool_batch(self, **kwargs: Any) -> bool:
        """Compatibility wrapper for tests that call the old private API."""
        return await self._orchestrator.execute_tool_batch(**kwargs)

    def _compat_events(self) -> TurnEventEmitter:
        """Resolve TurnEventEmitter for legacy `_emit_*` / thinking helpers.

        Fully-constructed stages own ``_events``. Tests that build the stage via
        ``__new__`` only set ``_cog`` (and optionally compressor/memory); synthesize
        a transient emitter so the old InferenceStage private API keeps working.
        """
        events = getattr(self, "_events", None)
        if events is not None:
            # Tests often mutate stage._cog after construction; keep emitter in sync.
            if hasattr(self, "_cog"):
                events._cog = self._cog
            return events
        return TurnEventEmitter(
            bus=getattr(self, "_bus", None),
            config=getattr(self, "_config", None),
            cognitive_emitter=getattr(self, "_cog", None),
            compressor=getattr(self, "_compressor", None),
            memory_store=getattr(self, "_memory_store", None),
            turn_run_store=getattr(self, "_turn_runs", None),
        )

    async def _emit_tool_call(self, *args: Any, **kwargs: Any) -> None:
        await self._compat_events().emit_tool_call(*args, **kwargs)

    async def _emit_cost(self, *args: Any, **kwargs: Any) -> None:
        await self._compat_events().emit_cost(*args, **kwargs)

    async def _emit_memory_written(self, *args: Any, **kwargs: Any) -> None:
        await self._compat_events().emit_memory_written(*args, **kwargs)

    async def _emit_thinking(self, *args: Any, **kwargs: Any) -> None:
        await self._compat_events().emit_thinking(*args, **kwargs)

    async def _emit_evolution(self, *args: Any, **kwargs: Any) -> None:
        await self._compat_events().emit_evolution(*args, **kwargs)

    async def _emit_progress(self, *args: Any, **kwargs: Any) -> None:
        await self._compat_events().emit_progress(*args, **kwargs)

    def _sync_context_window(self, display_window: int) -> None:
        self._compat_events().sync_context_window(display_window)

    def _thinking_sink(self, *args: Any, **kwargs: Any):
        return self._compat_events().thinking_sink(*args, **kwargs)

    async def _settle_thinking(self, *args: Any, **kwargs: Any) -> None:
        await self._compat_events().settle_thinking(*args, **kwargs)

    async def run(self, ctx: PipelineContext) -> InferenceResult:
        """Execute the inference loop, returning the final result."""
        session = ctx.session
        messages = ctx.messages

        loop_result = await self._tool_loop.run(ctx, messages)

        # 反思闭环：仅在多步 plan 上触发，最多重跑 1 轮。
        # 用户中断的 turn 不反思也不重跑：中断意味着"现在就停"，再自动发起一轮
        # 推理会违背用户意图，也会覆盖掉已生成的停止文案。
        if (
            not loop_result.interrupted
            and not loop_result.output_truncated
            and not loop_result.artifact_incomplete
            and not ctx.artifact_required
            and self._planner is not None
            and ctx.execution_plan is not None
            and len(ctx.execution_plan.steps) > 1
        ):
            # reflect 是注入依赖的外部调用，必须兜底：反思失败绝不能把
            # 一个已经拿到的第一轮结果搞坏。失败时记日志并按"不重跑"处理。
            try:
                feedback = await self._planner.reflect(
                    ctx.execution_plan, [loop_result.response_text]
                )
            except Exception as exc:  # noqa: BLE001 — 边界容错，任何反思异常都不该冒泡
                logger.warning("Reflection raised, skipping rerun: {}", exc)
                feedback = None
            if feedback is not None and feedback.should_replan:
                guidance = (
                    "[Reflection] 上一轮回复可能未完全达成目标。\n"
                    f"评估意见：{feedback.critique}"
                )
                if feedback.suggestions:
                    sug = "\n".join(f"- {s}" for s in feedback.suggestions)
                    guidance += f"\n建议：\n{sug}"
                guidance += "\n请据此改进并完成任务。"
                messages.append({"role": "user", "content": guidance})

                # 先把第一轮 nudge 计数写回 session，第二轮 helper 才能从第一轮
                # 末尾续起，使整个 turn 的工具调用被完整累计（而非只数第二轮）。
                session.metadata["_nudge_tool_iters_skill"] = loop_result.skill_iters
                session.metadata["_nudge_tool_iters_memory"] = loop_result.memory_iters

                # 第二轮重跑（硬上限 1，第二轮后不再反思）
                second = await self._tool_loop.run(ctx, messages)
                loop_result = LoopResult(
                    response_text=second.response_text or loop_result.response_text,
                    total_tool_calls=loop_result.total_tool_calls + second.total_tool_calls,
                    loop_exhausted=second.loop_exhausted,
                    budget_halted=second.budget_halted,
                    # The rerun supersedes the first pass: if IT converged
                    # normally the turn is fine; only its own forcing counts.
                    forced_convergence=second.forced_convergence,
                    interrupted=second.interrupted,
                    errored=second.errored,
                    content_filtered=second.content_filtered,
                    artifact_incomplete=second.artifact_incomplete,
                    output_truncated=second.output_truncated,
                    should_review_skills=loop_result.should_review_skills or second.should_review_skills,
                    should_review_memory=loop_result.should_review_memory or second.should_review_memory,
                    skill_iters=second.skill_iters,
                    memory_iters=second.memory_iters,
                    degraded_notices=loop_result.degraded_notices + second.degraded_notices,
                )

        # Turn-based memory review trigger: fires even for pure chat (no tool calls).
        # The tool-iteration path only counts tool loops, so personal facts
        # shared in plain conversation would never be reviewed without this.
        _memory_turns = session.metadata.get("_nudge_turns_memory", 0)
        should_review_memory = loop_result.should_review_memory
        if self._memory_nudge_interval > 0 and self._tools.has("memory"):
            _memory_turns += 1
            if _memory_turns >= self._memory_nudge_interval:
                should_review_memory = True
                # NB: counter is NOT reset here. Clearing at the trigger meant a
                # failed background review left the counter at 0, so this batch
                # would never be reviewed again. The counter is now zeroed only
                # after the review SUCCEEDS (ResponseStage._background_memory_review),
                # so a failed/retried review keeps it elevated and next turn
                # re-triggers.

        # Persist nudge counters back to session metadata
        session.metadata["_nudge_tool_iters_skill"] = loop_result.skill_iters
        session.metadata["_nudge_tool_iters_memory"] = loop_result.memory_iters
        session.metadata["_nudge_turns_memory"] = _memory_turns

        # Persist plan execution state so progress is queryable and an
        # interrupted long task can be resumed. Honest status semantics: steps
        # with an explicit tool_hint advance only when that matching tool really
        # starts/finishes; uncorrelated prose steps stay pending. The run status
        # records whether the whole turn converged cleanly.
        if (
            self._plan_run_store is not None
            and ctx.plan_run_id
            and ctx.execution_plan is not None
        ):
            try:
                plan = ctx.execution_plan
                from codex_pro.agent.planning.models import StepStatus

                plan_failed = any(
                    step.status == StepStatus.FAILED for step in plan.steps
                )
                # forced_convergence means the loop hit its iteration ceiling
                # and squeezed out a conclusion — the ANSWER exists but the
                # TASK is unfinished. Treat it like exhaustion: keep the run
                # resumable.
                task_incomplete = (
                    loop_result.loop_exhausted
                    or loop_result.budget_halted
                    or loop_result.forced_convergence
                    or loop_result.interrupted
                    or loop_result.output_truncated
                    or loop_result.content_filtered
                    or loop_result.artifact_incomplete
                    or plan_failed
                )
                if task_incomplete:
                    status = "exhausted"
                elif loop_result.response_text:
                    status = "complete"
                else:
                    status = "running"
                await self._plan_run_store.update(ctx.plan_run_id, plan, status=status)
            except Exception as e:
                logger.debug("Plan run update failed: {}", e)

        plan_failed = False
        if ctx.execution_plan is not None:
            from codex_pro.agent.planning.models import StepStatus

            plan_failed = any(
                step.status == StepStatus.FAILED
                for step in ctx.execution_plan.steps
            )

        return InferenceResult(
            response_text=loop_result.response_text,
            total_tool_calls=loop_result.total_tool_calls,
            should_review_skills=loop_result.should_review_skills,
            should_review_memory=should_review_memory,
            degraded_notices=loop_result.degraded_notices,
            # Same "didn't cleanly finish" signal the plan-run status uses above,
            # plus provider error. Carried out of the stage so AgentLoop can write
            # a dispatched task back as FAILED instead of SUCCESS.
            task_incomplete=(
                loop_result.loop_exhausted
                or loop_result.budget_halted
                or loop_result.forced_convergence
                or loop_result.interrupted
                or loop_result.errored
                or loop_result.output_truncated
                or loop_result.content_filtered
                or loop_result.artifact_incomplete
                or plan_failed
            ),
            output_truncated=loop_result.output_truncated,
            termination_reason=(
                "interrupted" if loop_result.interrupted else
                "output_truncated" if loop_result.output_truncated else
                "content_filtered" if loop_result.content_filtered else
                "artifact_not_delivered" if loop_result.artifact_incomplete else
                "provider_error" if loop_result.errored else
                "forced_convergence" if loop_result.forced_convergence else
                "budget_halted" if loop_result.budget_halted else
                "loop_exhausted" if loop_result.loop_exhausted else
                "plan_step_failed" if plan_failed else ""
            ),
        )


    def _can_retract_draft(self, channel: str) -> bool:
        """True when *channel* can visually replace text it already delivered,
        which is what makes optimistic streaming safe (see
        channels.stream_optimistic_channels).

        Anything other than a real list of patterns (missing key on an older
        config, a partially-built stub) reads as "not allowed" — the buffered
        path is the safe default, so an unrecognised config must never opt a
        send-only channel into showing retractable drafts.
        """
        patterns = getattr(self._config.channels, "stream_optimistic_channels", None)
        if not isinstance(patterns, list) or not patterns:
            return False
        return channel_matches(channel, patterns)

    async def _chat_stream_with_routing(
        self,
        *,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None,
        on_delta: Any | None,
        task_type: str,
        content: str,
        draft_policy: str | None = None,
        on_reasoning: Any | None = None,
    ) -> tuple[LLMResponse, RouteDecision]:
        """Route to appropriate model with fallback chain and streaming."""
        if not self._router:
            response = await self._provider.chat_stream_with_retry(
                messages=messages,
                tools=tools,
                model=self._default_model or None,
                on_delta=on_delta,
                on_reasoning=on_reasoning,
                draft_policy=draft_policy,
            )
            return response, RouteDecision(provider_name="default", model=self._default_model, reason="no router")

        emitted = False
        # Reasoning from a FAILED candidate is not replayed by the next one:
        # snapshots accumulate into one trace, so a second provider's thinking
        # would be appended to the dead first attempt's and read as one garbled
        # thought. Same rule as chat_stream_with_retry's reasoning_open, applied
        # one level up across the fallback chain.
        reasoning_open = True

        async def routed_delta(delta: str) -> None:
            nonlocal emitted
            emitted = True
            if on_delta:
                maybe = on_delta(delta)
                if asyncio.iscoroutine(maybe):
                    await maybe

        reasoning_seen = False

        async def routed_reasoning(delta: str) -> None:
            nonlocal reasoning_seen
            if not reasoning_open or not on_reasoning:
                return
            reasoning_seen = True
            maybe = on_reasoning(delta)
            if asyncio.iscoroutine(maybe):
                await maybe

        last_response: LLMResponse | None = None
        last_decision: RouteDecision | None = None
        for provider_name, provider, decision in self._router.route_candidates(task_type, content):
            response = await provider.chat_stream_with_retry(
                messages=messages,
                tools=tools,
                model=decision.model,
                on_delta=routed_delta if on_delta else None,
                on_reasoning=routed_reasoning if on_reasoning else None,
                max_tokens=decision.max_tokens,
                temperature=decision.temperature,
                draft_policy=draft_policy,
            )
            last_response = response
            last_decision = decision
            if response.finish_reason != "error":
                self._router.mark_success(provider_name)
                return response, decision
            self._router.mark_failure(provider_name, response.content or "LLM error")
            logger.warning("LLM provider '{}' failed for model '{}': {}", provider_name, decision.model, response.content)
            if emitted:
                return response, decision
            if reasoning_seen:
                reasoning_open = False

        if last_response and last_decision:
            return last_response, last_decision
        response = await self._provider.chat_stream_with_retry(
            messages=messages,
            tools=tools,
            model=self._default_model or None,
            on_delta=on_delta,
            on_reasoning=routed_reasoning if on_reasoning else None,
            draft_policy=draft_policy,
        )
        return response, RouteDecision(provider_name="default", model=self._default_model, reason="router empty")
