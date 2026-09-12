"""Tool orchestrator — approval, execution, and writeback for one tool batch.

Aligned with reference/codex `tools/orchestrator.rs`: central place for
approval gating, circuit/repeat guards, concurrent vs serial execution, and
ordered message writeback. InferenceStage owns sampling; this module owns
tool-side control flow.
"""
from __future__ import annotations

import asyncio
import hashlib
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, TYPE_CHECKING

from loguru import logger

from codex_pro.agent.cognitive_emitter import should_emit_cognitive
from codex_pro.agent.degraded_notice import REASON_REPEAT_BLOCKED, notice_for
from codex_pro.agent.pipeline.tool_concurrency import (
    ToolPlan,
    extract_paths,
    partition_concurrent,
)
from codex_pro.agent.progress_heartbeat import ActivitySnapshot, friendly_activity
from codex_pro.agent.tools.circuit_breaker import ToolCircuitBreaker
from codex_pro.tools import ToolExecutionContext, build_idempotency_key

if TYPE_CHECKING:
    from codex_pro.agent.approval_gate import ApprovalGate
    from codex_pro.agent.cognitive_emitter import CognitiveEmitter
    from codex_pro.agent.pipeline.turn_events import TurnEventEmitter
    from codex_pro.agent.tools.registry import ToolRegistry
    from codex_pro.permissions.manager import CredentialManager


@dataclass
class BatchCounters:
    """Mutable carrier threaded through execute_tool_batch so the batch can
    update the loop's running totals/flags in place (counters live in
    the tool loop, the batch mutates them)."""

    total_tool_calls: int
    skill_iters: int
    memory_iters: int
    should_review_skills: bool
    should_review_memory: bool
    degraded_notices: list
    successful_tools: set[str] = field(default_factory=set)


@dataclass
class ToolDecision:
    """Phase A outcome for one tool_call."""

    tool_call: object
    index: int
    verdict: str  # "RUN" | "BLOCKED"
    exec_ctx: object = None  # ToolExecutionContext, set when RUN
    blocked_message: str = ""  # tool message text, set when BLOCKED
    blocked_meta: dict = field(default_factory=dict)  # span end metadata
    terminal: bool = False  # deterministic denial: do not ask the LLM to rewrite it
    read_only: bool = False
    approved: bool = True
    paths: list = field(default_factory=list)
    plan_step_index: int | None = None



REPEAT_BLOCK_THRESHOLD = 4


class ToolOrchestrator:
    """Drives approval → execute → writeback for a model tool_calls batch."""

    def __init__(
        self,
        *,
        tools: ToolRegistry,
        approval_gate: ApprovalGate,
        credentials: CredentialManager,
        circuit_breaker: ToolCircuitBreaker,
        events: TurnEventEmitter,
        clarify_manager: Any = None,
        cognitive_emitter: CognitiveEmitter | None = None,
        nudge_interval: int = 0,
        memory_nudge_interval: int = 0,
        max_tool_result_chars: int = 16000,
        concurrency_enabled: bool = False,
        max_concurrent: int = 1,
        telemetry: Any = None,
        plan_run_store: Any = None,
    ) -> None:
        self._tools = tools
        self._approval_gate = approval_gate
        self._credentials = credentials
        self._circuit_breaker = circuit_breaker
        self._events = events
        self._clarify = clarify_manager
        self._cog = cognitive_emitter
        self._nudge_interval = nudge_interval
        self._memory_nudge_interval = memory_nudge_interval
        self._max_tool_result_chars = max_tool_result_chars
        self._concurrency_enabled = concurrency_enabled
        self._max_concurrent = max_concurrent
        self._telemetry = telemetry
        self._plan_run_store = plan_run_store
        self._hook_registry: Any = None
        self._tracer: Any = None
        self._host: Any = None

    def bind_host(self, host: Any) -> None:
        """Stage remains source of truth for attrs tests mutate after construction."""
        self._host = host

    def _live(self, name: str) -> Any:
        if self._host is not None:
            return getattr(self._host, name)
        return getattr(self, name)

    def set_hook_registry(self, registry: Any) -> None:
        self._hook_registry = registry

    def set_tracer(self, tracer: Any) -> None:
        self._tracer = tracer

    async def prepare_clarify(self, tool_call: Any, event: Any) -> None:
        """Wire a clarify tool call to the follow-up machinery.

        CLI channel: register a pending request, inject its id into the tool
        arguments, and emit a clarify_request frame so the TUI can render the
        choices. The tool then blocks on ClarifyManager.wait_for_answer.

        IM channels (non-CLI): the tool cannot block (callback-style transport,
        no long-held lock), so instead we remember the question per session via
        register_im_pending. The tool still returns the question as text this
        turn; _on_inbound consumes the *next* message on this session as the
        answer. No id injection, no frame — those are CLI/TUI-only."""
        if tool_call.name != "clarify" or self._clarify is None:
            return
        # Registering a pending request is a side effect on session state, so it
        # must not happen for a call that is about to be rejected. Validation
        # lives in ToolRegistry.execute, which runs AFTER this — so malformed
        # arguments (options as a JSON string, question as a dict) left a pending
        # request behind that nothing would ever resolve. On IM that is worse than
        # cosmetic: _on_inbound treats the user's next message as the answer to a
        # question they were never asked, swallowing it.
        #
        # Deliberately delegating to the tool's own validate_params rather than
        # re-checking the shape here: two copies of the rules would drift, and the
        # only correct predicate is "would execute() reject this?".
        registry = getattr(self, "_tools", None)
        tool = registry.get(tool_call.name) if registry is not None else None
        if tool is not None and tool.validate_params(tool_call.arguments):
            return
        question = tool_call.arguments.get("question", "")
        options = tool_call.arguments.get("options", []) or []
        if not should_emit_cognitive(event.channel):
            # IM path: remember the question keyed by session so the next inbound
            # message is routed as its answer (see AgentLoop._on_inbound).
            session_key = getattr(event, "session_key", "")
            if session_key:
                self._clarify.register_im_pending(
                    session_key, question, options,
                    user_id=getattr(event, "sender_id", ""),
                )
            return
        req = self._clarify.request(
            question, options,
            user_id=getattr(event, "sender_id", ""),
            session_key=getattr(event, "session_key", ""),
        )
        tool_call.arguments["_clarify_id"] = req.id
        if self._cog is not None:
            await self._cog.emit(
                event, "clarify_request",
                {"clarify_id": req.id, "question": question, "options": options},
                question,
            )

    async def finish_clarify(self, tool_call: Any, event: Any) -> None:
        """Tell the TUI a clarify prompt is closed, once its tool call returns.

        The CLI clarify has no timeout — the only unblock is resolve() — so the
        client cannot infer "this prompt is dead" from anything else on the wire.
        It used to guess from the intermediate is_final frames the gateway emits
        mid-turn, which fired while the prompt was still live: the picker went
        inert, the next thing the user typed became a NEW turn, and that turn
        queued forever behind the very turn still parked on this clarify.

        Emitted for CLI only (matching _prepare_clarify) and best-effort: a
        failure here must not fault an otherwise successful tool call."""
        if tool_call.name != "clarify" or self._cog is None:
            return
        clarify_id = str(tool_call.arguments.get("_clarify_id", ""))
        if not clarify_id or not should_emit_cognitive(event.channel):
            return
        try:
            await self._cog.emit(
                event, "clarify_closed", {"clarify_id": clarify_id}, "",
            )
        except Exception:  # noqa: BLE001 — never fault the tool call on this
            logger.debug("clarify_closed emit failed", exc_info=True)


    async def run_pre_tool_hook(self, tool_call: Any, exec_ctx: Any) -> tuple[Any, Any]:
        """Dispatch the pre_tool_call hook chain.

        Mutates ``tool_call.arguments`` in place for any hook returning modified
        args (faithful to the original loop), and returns
        ``(cancel_reason_or_None, modified_args_or_None)``. A non-None cancel
        reason signals the caller to mark the decision BLOCKED.
        """
        hook_results = await self._live("_hook_registry").dispatch(
            "pre_tool_call", tool_call.name, tool_call.arguments, exec_ctx,
        )
        modified_args = None
        for hr in hook_results:
            if hr.cancel:
                return hr.cancel_reason, modified_args
            if hr.modified is not None:
                tool_call.arguments = hr.modified
                modified_args = hr.modified
        return None, modified_args

    def respill(self, tool_name: str, exec_ctx: Any, result: Any) -> Any:
        """post_tool_call 之后补一次 spill。

        registry 在 execute 内部已经 spill 过一次,但那不是最终写回边界:插件
        可以替换 result,而替换后的超长文本只会撞上 _MAX_TOOL_RESULT_CHARS 的
        哑截断。registry 侧的 apply 幂等,所以这次补调对未被插件改动的结果是
        no-op。registry 没装 spill 或不是本类型时静默跳过。
        """
        applier = getattr(self._tools, "apply_spill", None)
        if applier is None:
            return result
        try:
            return applier(tool_name, exec_ctx, result)
        except Exception as e:  # noqa: BLE001
            logger.debug("post_tool_call 后的 spill 补调失败,保留插件结果: {}", e)
            return result

    async def execute_tool_batch(self, *, ctx, response, messages, session,
                                  trace_id, iteration, event, repeat_tracker, counters) -> bool:
        """Execute one batch of tool_calls in three phases:

        A. serial decision (approval / repeat guard / pre_tool_call hook) ->
           a ToolDecision per tool_call;
        B. execution split into a concurrent read-only group and a serial group
           (Task 3: conc_idx is always empty so everything is serial);
        C. serial writeback in ORIGINAL tool_call order so message/session/span
           ordering and circuit/nudge counters stay byte-equivalent.

        Mutates ``messages``/``session`` in place and updates ``counters``.
        """
        REPEAT_BLOCK_THRESHOLD = 4  # was a local in _run_tool_loop; value kept identical
        decisions: list[ToolDecision] = []

        # ---- Phase A: serial decision (approval / repeat / pre-hook) ----
        for tool_index, tool_call in enumerate(response.tool_calls):
            d = ToolDecision(tool_call=tool_call, index=tool_index, verdict="RUN")
            if ctx.execution_plan is not None:
                for step in ctx.execution_plan.steps:
                    hint = (step.tool_hint or "").strip().lower()
                    if hint and tool_call.name.lower() in {
                        part.strip() for part in hint.replace("/", ",").split(",")
                    } and step.status.value in {"pending", "failed"}:
                        d.plan_step_index = step.index
                        break

            # Emit "Using tool" BEFORE approval so BLOCKED tools (denied /
            # repeat-guarded / hook-cancelled) still surface this progress,
            # matching the pre-refactor loop where it fired at the top of the
            # body. Phase B must NOT re-emit it for RUN tools.
            _friendly = friendly_activity(ActivitySnapshot(0.0, "calling_tool", tool_call.name))
            await self._events.emit_progress(ctx, _friendly, tool_hint=True)

            approval_check = await self._approval_gate.check(
                tool_call.name,
                tool_call.arguments,
                event.sender_id,
                channel=event.channel,
                event=event,
                running=True,
            )
            if approval_check.denial:
                d.verdict = "BLOCKED"
                d.blocked_message = approval_check.denial.text
                d.blocked_meta = {"success": False, "denied": True}
                d.terminal = approval_check.terminal is True
                if approval_check.notify_user and approval_check.notice:
                    counters.degraded_notices.append(approval_check.notice)
                decisions.append(d)
                continue
            d.approved = True

            # Circuit-breaker probe permit. Schema filtering above uses the
            # side-effect-free peek, so the OPEN→HALF_OPEN transition and the
            # half_open_max probe budget are enforced HERE, on the real call
            # path — without this acquire the recovery state machine never
            # runs and an opened circuit can only "recover" by accident.
            # Runs serially in Phase A so probe accounting has no races.
            if not self._live("_circuit_breaker").is_available(tool_call.name):
                d.verdict = "BLOCKED"
                d.blocked_message = (
                    f"[Blocked] Tool '{tool_call.name}' is temporarily disabled "
                    "(circuit open after repeated failures). Try again later or "
                    "use a different approach."
                )
                d.blocked_meta = {"success": False, "circuit_open": True}
                logger.warning("Circuit breaker blocked tool call: {}", tool_call.name)
                decisions.append(d)
                continue

            # Repeat-call guard: count BEFORE executing so identical calls don't
            # keep firing side effects. The N-th identical call is short-circuited
            # with an error message instead.
            _call_key = f"{tool_call.name}:{hashlib.md5(str(sorted(tool_call.arguments.items())).encode()).hexdigest()[:8]}"
            repeat_tracker[_call_key] = repeat_tracker.get(_call_key, 0) + 1
            if repeat_tracker[_call_key] >= REPEAT_BLOCK_THRESHOLD:
                d.verdict = "BLOCKED"
                d.blocked_message = (
                    f"[Blocked] Tool '{tool_call.name}' called with identical arguments "
                    f"{repeat_tracker[_call_key]} times. Stopping repeated calls — "
                    "vary the arguments or take a different action."
                )
                d.blocked_meta = {"success": False, "repeat_blocked": True}
                logger.warning(
                    "Blocked repeated tool call: {} ({}x)",
                    tool_call.name, repeat_tracker[_call_key],
                )
                counters.degraded_notices.append(notice_for(REASON_REPEAT_BLOCKED))
                decisions.append(d)
                continue

            d.exec_ctx = ToolExecutionContext(
                execution_id=uuid.uuid4().hex[:12],
                trace_id=trace_id,
                session_key=event.session_key,
                memory_scope=getattr(event, "memory_scope", ""),
                user_id=event.sender_id,
                attempt_index=0,
                idempotency_key=build_idempotency_key(trace_id, tool_call.name, tool_index, tool_call.arguments),
                credentials=self._credentials.get_for_tool(tool_call.name),
                approved_actions=approval_check.approved_actions,
                approval_source=approval_check.approval_source,
                channel=event.channel,
                chat_id=event.chat_id,
                reply_to_id=event.reply_to_id or "",
                inbound_event_id=event.event_id,
                artifact_intent_id=ctx.artifact_intent_id,
                # Trust facts travel with the context so a nested call (a
                # delegate/spawn worker) can be gated on them. Read from the
                # typed InboundEvent fields only — never metadata, which external
                # channels populate from untrusted input.
                unattended=bool(getattr(event, "unattended", False)),
                cron_authorized=bool(getattr(event, "cron_authorized", False)),
            )

            # pre_tool_call hook (may cancel/modify); modifications applied in place
            if self._live("_hook_registry") and self._live("_hook_registry").has_hooks("pre_tool_call"):
                cancelled, _modified = await self.run_pre_tool_hook(tool_call, d.exec_ctx)
                if cancelled:
                    d.verdict = "BLOCKED"
                    d.blocked_message = f"Blocked by plugin: {cancelled}"
                    d.blocked_meta = {"success": False, "hook_cancelled": True}
                    decisions.append(d)
                    continue

            # classify for concurrency (Task 4 consumes this; harmless in Task 3)
            tool_obj = self._tools.get(tool_call.name)
            try:
                d.read_only = bool(tool_obj and tool_obj.execution_mode(tool_call.arguments) == "read_only")
            except Exception:
                d.read_only = False
            d.paths = extract_paths(tool_call.arguments)
            if d.plan_step_index is not None:
                ctx.execution_plan.mark_step_running(d.plan_step_index)
            decisions.append(d)

        # ---- Phase B: split RUN decisions into concurrent / serial groups ----
        run_decisions = [d for d in decisions if d.verdict == "RUN"]
        results: dict[int, object] = {}  # index -> ToolResult (or Exception)

        if self._live("_concurrency_enabled") and self._live("_max_concurrent") > 1 and len(run_decisions) > 1:
            plans = [ToolPlan(index=d.index, name=d.tool_call.name,
                              read_only=d.read_only, paths=d.paths, approved=d.approved)
                     for d in run_decisions]
            conc_plans, _serial_plans = partition_concurrent(plans)
            conc_idx = {p.index for p in conc_plans}
        else:
            conc_idx = set()  # Task 3: everything serial. Task 4 flips this on.

        by_index = {d.index: d for d in run_decisions}

        # concurrent group (Task 3: conc_idx is empty, this never runs)
        if conc_idx:
            await self._events.emit_progress(
                ctx, f"并行执行 {len(conc_idx)} 个只读工具", tool_hint=True,
            )
            sem = asyncio.Semaphore(self._live("_max_concurrent"))

            async def _run_one(d):
                async with sem:
                    # Emit a "running" frame before execution so the cli TUI can
                    # flip this tool line into an in-progress state; the terminal
                    # frame below shares tool_call_id to pair with it.
                    await self._events.emit_tool_call(
                        ctx.event, d.tool_call.name, d.tool_call.arguments,
                        "running", "", tool_call_id=d.tool_call.id,
                    )
                    result = await self._tools.execute(
                        d.tool_call.name, d.tool_call.arguments, d.exec_ctx)
                    # post_tool_call hook — kept consistent with the serial group
                    # below so concurrently-executed read-only tools still honor
                    # the hook contract (e.g. evolution trajectory recording).
                    # `result` is a local var per decision; the gather'd tasks
                    # share no mutable state here. If a hook raises, it propagates
                    # out and is captured by gather(return_exceptions=True).
                    if self._live("_hook_registry") and self._live("_hook_registry").has_hooks("post_tool_call"):
                        result = await self._live("_hook_registry").dispatch_modify(
                            "post_tool_call", result, d.tool_call.name,
                            d.tool_call.arguments, d.exec_ctx,
                        )
                        # 插件可能把结果换成一段超长文本。此处才是最终写回边界,
                        # 不再过一遍 spill 就会掉进下方 16000 字符的哑截断。
                        result = self.respill(d.tool_call.name, d.exec_ctx, result)
                    return result

            conc_order = list(conc_idx)
            gathered = await asyncio.gather(
                *[_run_one(by_index[i]) for i in conc_order],
                return_exceptions=True,
            )
            for i, res in zip(conc_order, gathered):
                results[i] = res
                # Emit a tool_call frame per concurrent tool too — the serial
                # group emits inline, so without this the cli TUI would drop
                # every concurrently-executed tool once Task 4 turns concurrency
                # on. Exceptions surface as status="err".
                d = by_index[i]
                if isinstance(res, BaseException):
                    await self._events.emit_tool_call(
                        ctx.event, d.tool_call.name, d.tool_call.arguments,
                        "err", f"{type(res).__name__}: {res}"[:500],
                        tool_call_id=d.tool_call.id,
                    )
                else:
                    await self._events.emit_tool_call(
                        ctx.event, d.tool_call.name, d.tool_call.arguments,
                        "ok" if res.success else "err", res.text,
                        tool_call_id=d.tool_call.id,
                        result_meta=dict(res.metadata) if res.metadata else None,
                    )

        # serial group (runs after concurrent batch; preserves read-before-write
        # ordering because overlapping readers were demoted into this group).
        # Per-tool progress/started/done events and the post_tool_call hook are
        # kept here so serial execution stays behavior-equivalent to the original
        # loop.
        for d in run_decisions:
            if d.index in conc_idx:
                continue
            tool_call = d.tool_call

            _tool_start_ts = time.monotonic()
            if ctx.activity is not None:
                ctx.activity.enter_tool(tool_call.name)
            # Emit a "running" frame before execution so the cli TUI can flip
            # this tool line into an in-progress state; the terminal frame below
            # shares tool_call_id to pair with it.
            await self._events.emit_tool_call(
                ctx.event, tool_call.name, tool_call.arguments,
                "running", "", tool_call_id=tool_call.id,
            )
            await self.prepare_clarify(tool_call, ctx.event)

            try:
                result = await self._tools.execute(
                    tool_call.name, tool_call.arguments, d.exec_ctx)

                # post_tool_call hook
                if self._live("_hook_registry") and self._live("_hook_registry").has_hooks("post_tool_call"):
                    result = await self._live("_hook_registry").dispatch_modify(
                        "post_tool_call", result, tool_call.name, tool_call.arguments, d.exec_ctx,
                    )
                    result = self.respill(tool_call.name, d.exec_ctx, result)

                _tool_duration_ms = int((time.monotonic() - _tool_start_ts) * 1000)
                await self._events.emit_tool_call(
                    ctx.event, tool_call.name, tool_call.arguments,
                    "ok" if result.success else "err", result.text,
                    tool_call_id=tool_call.id,
                    result_meta=dict(result.metadata) if result.metadata else None,
                    duration_ms=_tool_duration_ms,
                )
                if ctx.activity is not None:
                    ctx.activity.exit_tool()

                results[d.index] = result
            except BaseException as exc:  # noqa: BLE001 — recorded per-tool in Phase C
                # Fail-fast: mirror the original serial loop's `raise` on the
                # first tool exception. Record this failure but DO NOT run any
                # later serial tool — their side effects must not fire once a
                # sibling has crashed. Phase C raises at this decision's index
                # (in original order) before reaching the unexecuted ones.
                # Emit a terminal tool_call frame so the cli TUI doesn't leave
                # the "started" progress hanging with no resolution — a real
                # crash was previously invisible in the cognitive stream.
                if ctx.activity is not None:
                    ctx.activity.exit_tool()
                await self._events.emit_tool_call(
                    ctx.event, tool_call.name, tool_call.arguments,
                    "err", f"{type(exc).__name__}: {exc}"[:500],
                    tool_call_id=tool_call.id,
                )
                results[d.index] = exc
                break
            finally:
                # The clarify prompt (if this was one) is no longer answerable
                # once execute() has returned, by answer OR by crash. Tell the
                # client explicitly on both paths so it never has to infer it.
                await self.finish_clarify(tool_call, ctx.event)

        # ---- Phase C: serial writeback in ORIGINAL tool_call order ----
        for d in decisions:
            tool_call = d.tool_call
            tool_span = self._tracer.start_span(
                trace_id, f"tool_{iteration}_{d.index}", f"tool:{tool_call.name}", "tool_call")

            if d.verdict == "BLOCKED":
                messages.append({"role": "tool", "tool_call_id": tool_call.id,
                                 "name": tool_call.name, "content": d.blocked_message})
                session.add_message("tool", d.blocked_message,
                                    tool_call_id=tool_call.id, name=tool_call.name)
                self._tracer.end_span(tool_span, metadata=d.blocked_meta)
                counters.total_tool_calls += 1
                if d.plan_step_index is not None and ctx.execution_plan is not None:
                    ctx.execution_plan.mark_step_failed(
                        d.plan_step_index, d.blocked_message[:500],
                    )
                continue

            res = results.get(d.index)
            if isinstance(res, BaseException):
                # Every announced tool_call must get a paired tool message, and
                # the failure is counted by the circuit breaker. What differs is
                # whether the exception propagates:
                #   - concurrent group -> failure isolation: append an error tool
                #     message, record the failure, but DO NOT raise — sibling
                #     read-only tools have already completed and the batch must
                #     not be aborted by one tool crashing.
                #   - serial group -> fail-fast: preserve the original loop's
                #     behavior and re-raise so later writeback is skipped.
                # A bare asyncio.CancelledError must NEVER be swallowed
                # regardless of source: a cancellation signal is not an ordinary
                # tool failure and must always propagate.
                err_text = "Tool execution interrupted before producing a result."
                messages.append({"role": "tool", "tool_call_id": tool_call.id,
                                 "name": tool_call.name, "content": err_text})
                try:
                    session.add_message("tool", err_text, tool_call_id=tool_call.id, name=tool_call.name)
                except Exception as e:
                    logger.debug("Failed to record interrupted-tool message for {}: {}", tool_call.name, e)
                try:
                    self._tracer.end_span(tool_span, error="interrupted")
                except Exception as e:
                    logger.debug("Failed to end span for interrupted tool {}: {}", tool_call.name, e)
                try:
                    self._live("_circuit_breaker").record_failure(tool_call.name)
                except Exception as e:
                    logger.debug("Failed to record circuit-breaker failure for {}: {}", tool_call.name, e)
                counters.total_tool_calls += 1
                if d.plan_step_index is not None and ctx.execution_plan is not None:
                    ctx.execution_plan.mark_step_failed(d.plan_step_index, err_text)
                if isinstance(res, asyncio.CancelledError):
                    raise res
                if d.index in conc_idx:
                    # Isolated concurrent-group failure: keep writing back the
                    # remaining decisions instead of aborting the batch.
                    continue
                raise res

            result = res
            result_text = result.text
            if len(result_text) > self._max_tool_result_chars:
                result_text = result_text[:self._max_tool_result_chars] + "\n...(truncated)"

            self._tracer.end_span(tool_span, metadata={"success": result.success})

            if self._live("_telemetry") and self._live("_telemetry").available:
                from codex_pro.observability.spans import start_tool_span, end_tool_span
                otel_tool = start_tool_span(self._live("_telemetry").get_tracer(), tool_call.name)
                end_tool_span(otel_tool, error=None if result.success else result.error)

            messages.append({"role": "tool", "tool_call_id": tool_call.id,
                             "name": tool_call.name, "content": result_text})
            session.add_message("tool", result_text, tool_call_id=tool_call.id, name=tool_call.name)

            counters.total_tool_calls += 1
            counters.skill_iters += 1
            counters.memory_iters += 1

            # Per-tool circuit breaker. Only infrastructure failures (timeout/
            # dependency/internal) count toward opening the circuit — validation
            # and business failures are part of normal interaction; counting
            # them lets one session's bad arguments disable the tool for every
            # session (the breaker is process-global).
            if result.success:
                self._live("_circuit_breaker").record_success(tool_call.name)
                counters.successful_tools.add(tool_call.name)
            elif result.is_infra_failure:
                self._live("_circuit_breaker").record_failure(tool_call.name)

            if d.plan_step_index is not None and ctx.execution_plan is not None:
                if result.success:
                    ctx.execution_plan.mark_step_complete(
                        d.plan_step_index, result_text[:500],
                    )
                else:
                    ctx.execution_plan.mark_step_failed(
                        d.plan_step_index, (result.error or result_text)[:500],
                    )

            if (self._nudge_interval > 0 and counters.skill_iters >= self._nudge_interval
                    and self._tools.has("skill_manage")):
                counters.should_review_skills = True
                counters.skill_iters = 0
            if (self._memory_nudge_interval > 0 and counters.memory_iters >= self._memory_nudge_interval
                    and self._tools.has("memory")):
                counters.should_review_memory = True
                # Counter NOT reset here — see run(): it is zeroed only after the
                # background review succeeds, so a failed review re-triggers next
                # turn instead of dropping this batch permanently.

        if self._live("_plan_run_store") is not None and ctx.plan_run_id and ctx.execution_plan is not None:
            try:
                await self._live("_plan_run_store").update(
                    ctx.plan_run_id, ctx.execution_plan, status="running",
                )
            except Exception as e:
                logger.debug("Plan step progress persistence failed: {}", e)

        return any(d.terminal for d in decisions)

