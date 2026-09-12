"""Inbound turn handling for AgentLoop.

Lock-free command routing (approval/clarify/interrupt) and session-locked
turn execution live here — separated from composition and lifecycle, similar
to reference/codex session handlers vs turn execution.
"""
from __future__ import annotations

import asyncio
import time
import uuid
from typing import TYPE_CHECKING, Any

from loguru import logger

from codex_pro.agent.degraded_notice import GENERIC_FALLBACK_TEXT
from codex_pro.agent.embedding_helpers import _should_publish_reply
from codex_pro.agent.pipeline.response_stage import _is_ephemeral_session
from codex_pro.agent.progress_heartbeat import ProgressHeartbeat, SharedActivityState
from codex_pro.agent.streaming import (
    ProcessResult as _ProcessResult,
    TokenStreamPublisher as _TokenStreamPublisher,
)
from codex_pro.agent.turn_run_store import DuplicateTurnClaim
from codex_pro.bus.events import EventType, InboundEvent, OutboundEvent, stamp_turn_outcome
from codex_pro.agent.commands.approval import ApprovalCommands
from codex_pro.agent.commands.clarify import ClarifyCommands
from codex_pro.agent.commands.interrupt import InterruptCommands
from codex_pro.agent.commands.stream_params import StreamParams

if TYPE_CHECKING:
    from codex_pro.agent.loop import AgentLoop


class InboundHandler:
    """Inbound event routing, turn ledger, and cron/task outcome writeback."""

    @staticmethod
    async def _mark_turn_running(loop: "AgentLoop",
        event_id: str,
        session_key: str,
        *,
        context_key: str,
        trace_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> bool:
        turn_runs = getattr(loop, "_turn_runs", None)
        if turn_runs is None:
            return True
        try:
            return await turn_runs.mark_running(
                event_id,
                session_key,
                context_key=context_key,
                trace_id=trace_id,
                metadata=metadata,
            )
        except Exception as e:
            logger.warning("Turn running ledger write failed for {}: {}", event_id, e)
            # Preserve the ledger's best-effort availability contract. Built-in
            # SQLite returns an authoritative bool; a storage outage must not
            # silently drop every otherwise valid inbound message.
            return True

    @staticmethod
    async def _mark_turn_terminal(loop: "AgentLoop",
        event_id: str,
        status: str,
        *,
        response_text: str = "",
        error: str = "",
    ) -> None:
        """Best-effort observability write; never turn it into a task failure."""
        turn_runs = getattr(loop, "_turn_runs", None)
        if turn_runs is None:
            return
        try:
            await turn_runs.mark_terminal(
                event_id,
                status,
                response_text=response_text,
                error=error,
            )
        except Exception as e:
            logger.warning("Turn terminal ledger write failed for {}: {}", event_id, e)

    @staticmethod
    async def _on_inbound_rejected(loop: "AgentLoop", event: InboundEvent, reason: str) -> None:
        """Converge ledger/task state when the bus refuses an accepted event."""
        if event.is_control:
            return
        interrupt = getattr(loop, "interrupt", None)
        discard = getattr(interrupt, "discard", None)
        if callable(discard):
            discard(event.session_key, event.event_id)
        status = "interrupted" if reason == "shutdown" else "failed"
        await loop._record_cron_outcome(event, "error", reason)
        await loop._record_task_outcome(event, "error", reason)
        await loop._mark_turn_terminal(event.event_id, status, error=reason)

    @staticmethod
    async def _record_cron_outcome(loop: "AgentLoop", event: InboundEvent, status: str, error: str = "") -> None:
        """For a fired CRON job, write the turn's terminal outcome back to the
        scheduler so last_status reflects reality instead of staying "queued".

        "completed" means the agent turn finished and its reply was published to
        the bus — NOT a confirmed channel delivery receipt (that would need the
        SendResult to propagate back from the channel, which is out of scope
        here). This is still strictly more truthful than the enqueue-time
        "queued". No-op for non-cron events or when no scheduler is wired."""
        # getattr guard: some code paths (and tests) build AgentLoop via
        # __new__, bypassing __init__ where _scheduler is set.
        scheduler = getattr(loop, "_scheduler", None)
        if scheduler is None or event.event_type != EventType.CRON:
            return
        job_id = str(event.metadata.get("job_id") or "")
        if not job_id:
            return
        try:
            await scheduler.record_run_outcome(job_id, status, error)
        except Exception as e:
            logger.debug("Cron outcome writeback failed for job {}: {}", job_id, e)

    @staticmethod
    async def _record_task_outcome(loop: "AgentLoop", event: InboundEvent, status: str, error: str = "") -> None:
        """For a dispatched board task, drive it to a terminal state after its turn
        finishes — the safety net that keeps a task from being stuck at RUNNING if
        the agent didn't close it out via the task tool itself. `status` is one of
        "completed" (clean finish → SUCCESS), "incomplete" (turn produced a reply
        but did not finish the task: provider error / budget / iteration ceiling /
        forced convergence / interrupt → FAILED) or "error" (the turn raised →
        FAILED). Idempotent: if the agent already completed/failed it (terminal),
        mark_terminal no-ops, and a task cancelled mid-run is already terminal so a
        later writeback can't resurrect it. No-op for non-task events or when no
        task_manager is wired."""
        manager = getattr(loop, "_task_manager", None)
        task_id = str(event.metadata.get("task_id") or "")
        if manager is None or not task_id:
            return
        from codex_pro.tasks.models import TERMINAL_TASK_STATUSES, TaskStatus

        target = TaskStatus.SUCCESS if status == "completed" else TaskStatus.FAILED
        if status == "incomplete" and not error:
            error = "任务未完成即结束(模型报错/预算或轮次耗尽/被中断),已按失败处理"
        try:
            # Snapshot the pre-writeback status: if the agent already closed the
            # task via the task tool, it's already terminal AND the tool already
            # advanced the workflow — mark_terminal no-ops and we must NOT advance
            # again. We only advance the workflow when THIS writeback is what
            # drove the task terminal (the agent didn't call complete/fail).
            before = await manager.get(task_id)
            was_open = before is not None and before.status not in TERMINAL_TASK_STATUSES
            after = await manager.mark_terminal(task_id, target, error=error)
        except Exception as e:
            logger.debug("Task outcome writeback failed for task {}: {}", task_id, e)
            return
        # Safety-net terminal transition on a workflow step: advance the owning
        # workflow so its next eligible steps get queued (same hook TaskTool runs
        # when the agent closes a step itself). Best-effort — the writeback
        # already persisted; a failed advance is recoverable via explicit advance.
        engine = getattr(loop, "_workflow_engine", None)
        if (
            engine is not None
            and was_open
            and after is not None
            and getattr(after, "workflow_id", "")
            and after.status in TERMINAL_TASK_STATUSES
        ):
            try:
                await engine.on_task_complete(after.id)
            except Exception as e:
                logger.debug("Workflow advance after task writeback failed for {}: {}", task_id, e)

    @staticmethod
    async def _on_inbound(loop: "AgentLoop", event: InboundEvent) -> None:
        """入站事件处理入口，负责追踪、错误处理和响应发布。"""
        if not loop._running:
            return
        # 群聊会话作用域解析：把按策略解析出的隔离键固化到 override，
        # 使下游全部 session_key 读取(锁/working memory/快照/可见性/source_session)统一按此键隔离。
        scope = loop.config.session.group_session_scope
        if not event.session_key_override:
            event.session_key_override = event.scoped_session_key(scope)
        # 记忆作用域(memory_scope)的冻结统一下沉到 _process_event,使 _on_inbound
        # 与 process_direct(A2A/CLI)两条入站路径共享同一处逻辑,避免新增入口漏设。
        # Approval decisions (/approve, /deny, /approvals) are handled BEFORE
        # acquiring the session lock — by design. A turn that is blocked waiting
        # for approval holds the session lock while parked in wait_for_decision;
        # routing the decision through a separate lock-free path (not _process_event)
        # is what lets it wake the waiter without deadlocking on that same lock.
        # Do not move this below sessions.acquire().
        if ApprovalCommands.is_approval_command(loop, event.text):
            response_text = await ApprovalCommands.handle_approval_command(loop, event)
            if response_text is not None:
                out = OutboundEvent.from_text_with_media(
                    channel=event.channel,
                    chat_id=event.chat_id,
                    text=response_text,
                    reply_to_id=event.reply_to_id,
                )
                out.metadata = dict(event.metadata)
                out.metadata["_inbound_event_id"] = event.event_id
                await loop.bus.publish_outbound(out)
                await loop._mark_turn_terminal(
                    event.event_id,
                    "completed",
                    response_text=response_text,
                )
                return
        # Clarify answers, like approval decisions, are handled BEFORE acquiring
        # the session lock — the blocked agent holds that lock while parked in
        # wait_for_answer, so resolving must run on a lock-free path. Do not move
        # this below sessions.acquire().
        if ClarifyCommands.is_clarify_command(event.text):
            response_text = await ClarifyCommands.handle_clarify_command(loop, event)
            if response_text is not None:
                out = OutboundEvent.from_text_with_media(
                    channel=event.channel,
                    chat_id=event.chat_id,
                    text=response_text,
                    reply_to_id=event.reply_to_id,
                )
                out.metadata = dict(event.metadata)
                out.metadata["_inbound_event_id"] = event.event_id
                await loop.bus.publish_outbound(out)
                await loop._mark_turn_terminal(
                    event.event_id,
                    "completed",
                    response_text=response_text,
                )
                return
        # Session-interrupt escape valve, handled BEFORE the session lock for the
        # same reason as clarify answers: the agent blocked in wait_for_answer
        # holds the lock, so the wake must run on a lock-free path. Synthesized by
        # the gateway on ws disconnect; internal control command, no reply.
        if ClarifyCommands.is_clarify_cancel_command(event.text):
            await ClarifyCommands.handle_clarify_cancel(loop, event)
            return
        # Turn-interrupt escape valve. Handled BEFORE the session lock for the
        # same reason as clarify-cancel: the running turn holds the lock, so the
        # cooperative-stop signal must be delivered on a lock-free path — the
        # inference loop polls the flag at its next checkpoint and stops cleanly.
        # Synthesized by the gateway from a Ctrl+C interrupt frame; internal
        # control command, no reply.
        if InterruptCommands.is_interrupt_command(event.text):
            await InterruptCommands.handle_interrupt(loop, event)
            return
        # IM follow-up continuation. On IM channels a clarify tool call cannot
        # block the turn, so the agent's question was remembered per session
        # (InferenceStage._prepare_clarify → register_im_pending). If this
        # session has an unanswered, unexpired follow-up, bind this message to it
        # so the model sees WHAT is being answered — otherwise a bare "A" reads
        # as an isolated, ambiguous message. This runs on IM channels only; CLI
        # uses the blocking /clarify path and never registers an IM pending.
        ClarifyCommands.maybe_bind_im_clarify_answer(loop, event)
        session_lock = await loop.sessions.acquire(event.session_key)
        async with session_lock:
            trace_id = uuid.uuid4().hex[:12]
            span = loop.tracer.start_span(trace_id, f"s_{trace_id}", "process_message", "input")
            heartbeat = ProgressHeartbeat(
                loop.bus,
                event,
                loop.config.agent.heartbeat,
                cognitive_emitter=loop.cognitive_emitter,
            )
            activity = SharedActivityState(started_at=time.monotonic())
            # Register this turn so a lock-free /__interrupt__ can flag it for a
            # cooperative stop. request() always starts un-interrupted, so a
            # stale flag from a prior turn cannot leak into this one.
            loop.interrupt.request(event.session_key, event.event_id)
            try:
                await heartbeat.start(activity)
                result = await loop._process_event(event, trace_id, publish_response=True, activity=activity)
                response_text = result.response_text

                # Delivery point. Text convergence (degraded notices, English
                # filler → Chinese fallback) already happened in
                # ResponseStage.finalize BEFORE the session was persisted, so
                # history, stream, and this publish all carry the same text.
                # Here we only decide whether an outbound message is still
                # needed: streamed turns already delivered it.
                final_text = "" if result.outbound_sent else response_text

                # Terminal state must reflect the REAL delivery fate, not merely
                # that we called publish. Only a non-streaming publish here can
                # fail: a streamed turn only sets outbound_sent when its finalize
                # receipt was ok, and a FAILED stream falls back to republishing
                # response_text (final_text non-empty) which is judged below.
                # Default True so a turn with nothing to publish (e.g. silenced
                # inspection, or an already-delivered stream) is not falsely faulted.
                delivered = True
                if final_text and _should_publish_reply(event, final_text):
                    out = OutboundEvent.from_text_with_media(
                        channel=event.channel,
                        chat_id=event.chat_id,
                        text=final_text,
                        reply_to_id=event.reply_to_id,
                    )
                    out.metadata = dict(event.metadata)
                    out.metadata["_inbound_event_id"] = event.event_id
                    if getattr(result, "task_incomplete", False):
                        outcome = "interrupted" if result.termination_reason == "interrupted" else "incomplete"
                        stamp_turn_outcome(
                            out.metadata,
                            outcome,
                            error=result.termination_reason,
                        )
                    else:
                        stamp_turn_outcome(out.metadata, "completed")
                    delivery = await loop.bus.publish_outbound(out)
                    delivered = delivery.ok
                loop.tracer.end_span(span, metadata={"response_len": len(response_text or "")})
                # A turn that returned without raising still may not have FINISHED
                # the task: a failed delivery, or a provider error / budget /
                # iteration ceiling / forced convergence / interrupt that produced
                # a reply but left the task incomplete. Fault the terminal state so
                # neither cron history nor the board shows an undelivered or
                # half-done turn as done.
                if not delivered:
                    await loop._record_cron_outcome(event, "error", "delivery failed")
                    await loop._record_task_outcome(event, "error", "delivery failed")
                    await loop._mark_turn_terminal(
                        event.event_id,
                        "failed",
                        response_text=response_text,
                        error="delivery failed",
                    )
                elif getattr(result, "task_incomplete", False):
                    await loop._record_cron_outcome(event, "completed")
                    await loop._record_task_outcome(event, "incomplete")
                    terminal = "interrupted" if result.termination_reason == "interrupted" else "incomplete"
                    await loop._mark_turn_terminal(
                        event.event_id,
                        terminal,
                        response_text=response_text,
                        error=result.termination_reason,
                    )
                else:
                    await loop._record_cron_outcome(event, "completed")
                    await loop._record_task_outcome(event, "completed")
                    await loop._mark_turn_terminal(
                        event.event_id,
                        "completed",
                        response_text=response_text,
                    )
            except DuplicateTurnClaim:
                # The first claimant owns execution, response delivery and the
                # terminal ledger transition. A duplicate must touch none of
                # those or it could contradict the authoritative run.
                logger.info("Duplicate inbound event {} skipped", event.event_id)
                loop.tracer.end_span(span, metadata={"duplicate": True})
            except asyncio.CancelledError:
                # A bus hard-stop or outer task cancellation is still a terminal
                # lifecycle event.  CancelledError is a BaseException, so the
                # generic handler cannot persist it and the ledger would otherwise
                # remain accepted/running forever.
                loop.tracer.end_span(span, error="cancelled")
                await loop._record_cron_outcome(event, "error", "cancelled")
                await loop._record_task_outcome(event, "error", "cancelled")
                await loop._mark_turn_terminal(
                    event.event_id,
                    "interrupted",
                    error="cancelled",
                )
                raise
            except Exception as e:
                logger.error("Processing failed for event {}: {}", event.event_id, e)
                loop.tracer.end_span(span, error=str(e))
                error_out = OutboundEvent.text_reply(
                    channel=event.channel,
                    chat_id=event.chat_id,
                    text=GENERIC_FALLBACK_TEXT,
                    reply_to_id=event.reply_to_id,
                )
                error_out.metadata = dict(event.metadata)
                error_out.metadata["_inbound_event_id"] = event.event_id
                stamp_turn_outcome(
                    error_out.metadata,
                    "failed",
                    error="agent processing failed",
                )
                await loop.bus.publish_outbound(error_out)
                await loop._record_cron_outcome(event, "error", str(e))
                await loop._record_task_outcome(event, "error", str(e))
                await loop._mark_turn_terminal(
                    event.event_id,
                    "failed",
                    error=str(e),
                )
            finally:
                # Deregister the turn so a finished turn leaves no residue for
                # the next one to trip over (mirrors request() above).
                loop.interrupt.clear(event.session_key)
                await heartbeat.stop()
                loop.tracer.flush_trace(trace_id)

    @staticmethod
    async def _process_event(
        loop: "AgentLoop",
        event: InboundEvent,
        trace_id: str,
        *,
        publish_response: bool = False,
        activity: Any = None,
    ) -> _ProcessResult:
        """处理单个入站事件 — 委托给 pipeline stages。"""
        # 记忆作用域键:与 session_key 解耦(后者承载会话锁/历史/投递路由,不能按人
        # 归一)。此处是所有入站路径(_on_inbound、A2A/CLI 的 process_direct)的唯一
        # 咽喉点,统一冻结可确保任何入口都拿到正确作用域。单主体下 1:1 私聊(任意通道,
        # 含 A2A/CLI)归一到 owner 键实现跨通道记忆互通,群聊保持 per_user 隔离;
        # 开关关闭时退回按会话键(旧行为)。
        if not event.memory_scope:
            if loop.config.memory.cross_channel_owner:
                scope = loop.config.session.group_session_scope
                event.memory_scope = event.memory_scope_key(
                    scope,
                    loop.config.memory.owner_key,
                    frozenset(loop.config.memory.principal_bindings),
                )
            else:
                event.memory_scope = event.session_key
        session = await loop.sessions.get_or_create(event.session_key)
        from codex_pro.session.context_epoch import conversation_context_key

        context_key = conversation_context_key(event.session_key, session)
        if context_key not in loop._working_memories:
            from codex_pro.memory.tiers import WorkingMemory

            await loop._lru_put(
                loop._working_memories,
                context_key,
                WorkingMemory(max_entries=loop.config.memory.max_working_memory),
            )
        if not event.is_control:
            from codex_pro.bus.idempotency import idempotency_ledger_metadata

            claimed = await loop._mark_turn_running(
                event.event_id,
                event.session_key,
                context_key=context_key,
                trace_id=trace_id,
                metadata=idempotency_ledger_metadata(event.metadata),
            )
            if not claimed:
                raise DuplicateTurnClaim(event.event_id)
        command_response = await ApprovalCommands.handle_approval_command(loop, event)
        if command_response is not None:
            session.add_message("user", event.text)
            session.add_message("assistant", command_response)
            await loop.sessions.save(session)
            return _ProcessResult(response_text=command_response)

        recorder = loop.evolution.recorder if loop.evolution is not None else None
        if recorder is not None and not _is_ephemeral_session(event.session_key, event.channel):
            try:
                await recorder.begin_turn(
                    session_key=event.session_key,
                    chat_id=event.chat_id,
                    channel=event.channel,
                    task_input=event.text or "",
                    model_used=loop._default_model,
                )
            except Exception as e:
                logger.debug("Recorder begin_turn failed: {}", e)

        should_introduce = StreamParams.should_introduce(loop, session)
        intro_text = StreamParams.build_introduction(loop, event) if should_introduce else ""
        _flush_chars, _flush_interval_ms, _paragraph_mode = StreamParams.stream_flush_params(
            loop, event.channel,
        )
        stream_publisher = _TokenStreamPublisher(
            loop.bus,
            event,
            enabled=publish_response and StreamParams.should_stream_channel(loop, event.channel),
            flush_chars=_flush_chars,
            flush_interval_ms=_flush_interval_ms,
            paragraph_mode=_paragraph_mode,
            intro_text=intro_text,
        )
        if publish_response:
            await stream_publisher.start()

        ctx = None
        inference_result = None
        result = None
        process_error: Exception | None = None
        try:
            # Stage 1: Context building
            ctx = await loop._context_stage.build(
                event,
                session,
                publish_response=publish_response,
                trace_id=trace_id,
                stream_publisher=stream_publisher,
                intro_text=intro_text,
            )
            if activity is not None:
                ctx.activity = activity

            # Stage 2: Inference (LLM + tool execution loop)
            inference_result = await loop._inference_stage.run(ctx)

            # Stage 3: Response finalization
            result = await loop._response_stage.finalize(ctx, inference_result)
        except Exception as e:
            process_error = e
            raise
        finally:
            if recorder is not None:
                try:
                    if process_error is not None:
                        await recorder.end_turn(
                            session_key=event.session_key,
                            error=f"{type(process_error).__name__}: {process_error}",
                            outcome="failure",
                            task_type=getattr(ctx, "task_type", "") if ctx is not None else "",
                            spawn_fn=loop._spawn_background,
                        )
                    else:
                        await recorder.end_turn(
                            session_key=event.session_key,
                            response_text=result.response_text if result else "",
                            iteration_count=getattr(inference_result, "total_tool_calls", 0) or 0,
                            task_type=getattr(ctx, "task_type", "") if ctx is not None else "",
                            spawn_fn=loop._spawn_background,
                        )
                except Exception as e:
                    logger.debug("Recorder end_turn failed: {}", e)

        return _ProcessResult(
            response_text=result.response_text,
            outbound_sent=result.outbound_sent,
            degraded_notices=result.degraded_notices,
            task_incomplete=result.task_incomplete,
            output_truncated=result.output_truncated,
            termination_reason=result.termination_reason,
        )

    @staticmethod
    async def reset_session_state(loop: "AgentLoop", session_key: str) -> None:
        """Clear every reset-bounded, prompt-bearing process-local state.

        Durable user/environment memories intentionally survive. Persisted
        episodes and plans are isolated by the incremented conversation epoch,
        so no destructive database purge is needed here.
        """
        from codex_pro.session.context_epoch import belongs_to_session

        async with loop._state_lock:
            for cache in (
                loop._working_memories,
                loop._memory_snapshots,
                loop._memory_snapshot_ids,
                loop._retrieval_cache,
            ):
                for key in list(cache):
                    if belongs_to_session(key, session_key):
                        cache.pop(key, None)
            for key in list(loop._memory_snapshot_meta):
                if belongs_to_session(key, session_key):
                    loop._memory_snapshot_meta.pop(key, None)
        loop.compressor.on_session_reset(session_key)
        loop._response_stage.on_session_reset(session_key)
        # Reset happens under the session lock in GatewayServer, so no normal
        # turn can be executing here. These are defensive cleanup for abandoned
        # prompts/control state from a disconnected client.
        loop.unblock_session_for_reset(session_key)
        loop.interrupt.clear(session_key)
        # Tool approvals are scoped to the durable session identity rather than
        # the conversation epoch.  Explicitly clear the session map here so a
        # reset cannot inherit SESSION / SESSION_ALL grants.  ALWAYS grants stay
        # effective because ApprovalAllowlist retains them in its permanent set.
        loop.approval_gate.clear_session(session_key)

    @staticmethod
    async def process_direct(
        loop: "AgentLoop",
        content: str,
        session_key: str = "cli:direct",
        channel: str = "cli",
    ) -> str:
        """Process a message directly (for CLI or testing)."""
        event = InboundEvent.text_message(
            channel=channel,
            sender_id="user",
            chat_id="direct",
            text=content,
            session_key_override=session_key,
        )
        # Hold the same per-session lock the inbound dispatcher uses so two
        # concurrent CLI calls on the same session_key serialize their writes
        # to the message history.
        session_lock = await loop.sessions.acquire(event.session_key)
        async with session_lock:
            try:
                result = await loop._process_event(
                    event,
                    uuid.uuid4().hex[:12],
                    publish_response=False,
                )
                status = "incomplete" if result.task_incomplete else "completed"
                if result.termination_reason == "interrupted":
                    status = "interrupted"
                await loop._mark_turn_terminal(
                    event.event_id,
                    status,
                    response_text=result.response_text,
                    error=result.termination_reason,
                )
            except Exception as e:
                await loop._mark_turn_terminal(
                    event.event_id,
                    "failed",
                    error=str(e),
                )
                raise
        return result.response_text or ""
