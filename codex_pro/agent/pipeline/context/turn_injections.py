"""Turn-scoped prompt injections: artifact mode, output continuation, plans."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from loguru import logger

from codex_pro.agent.pipeline.context.artifact_intent import (
    artifact_continuation_is_live,
    artifact_output_required,
    wants_artifact_resume,
)
from codex_pro.agent.pipeline.context.turn_input import planning_context, wants_resume
from codex_pro.bus.events import InboundEvent
from codex_pro.session.manager import Session


def _append_to_last_user_message(messages: list[dict[str, Any]], text: str) -> None:
    last_content = messages[-1]["content"]
    if isinstance(last_content, list):
        last_content[0]["text"] += f"\n\n{text}"
    else:
        messages[-1]["content"] = f"{last_content}\n\n{text}"


@dataclass
class ArtifactInjectionResult:
    artifact_required: bool
    artifact_intent_id: str
    resume_artifact: bool


def apply_artifact_injection(
    *,
    event: InboundEvent,
    session: Session,
    context_key: str,
    messages: list[dict[str, Any]],
    available_names: set[str | None],
) -> ArtifactInjectionResult:
    """Mutate messages with artifact output-mode instructions when required."""
    artifact_resume_state = (
        session.metadata.get("_artifact_continuation")
        if isinstance(session.metadata, dict) else None
    )
    resume_artifact = wants_artifact_resume(event.text) and artifact_continuation_is_live(
        artifact_resume_state, context_key=context_key,
    )
    if isinstance(artifact_resume_state, dict) and not resume_artifact:
        # Any new request supersedes the failed report.  Invalid/expired
        # state is also removed eagerly so a later bare "continue" cannot
        # revive it if the current turn fails before inference cleanup.
        session.metadata.pop("_artifact_continuation", None)
        artifact_resume_state = None
    artifact_required = artifact_output_required(
        event.text,
        available_names,
        artifact_resume_state,
        context_key=context_key,
    )
    artifact_intent_id = ""
    if artifact_required:
        artifact_intent_id = str(event.event_id or "")
        if resume_artifact and isinstance(artifact_resume_state, dict):
            artifact_intent_id = str(
                artifact_resume_state.get("source_event_id") or artifact_intent_id
            )
    if artifact_required:
        if resume_artifact:
            instruction = (
                "[Output mode: artifact resume] The previous artifact workflow did not reach "
                "successful delivery. Resume from the artifact IDs and tool results already in "
                "conversation history; do not create a duplicate when a usable draft exists. "
                "Append one chunk per turn, validate, finalize, and deliver it."
            )
        else:
            instruction = (
                "[Output mode: artifact] This request requires a complete long-form document. "
                "Create it with the artifact tools in ordered chunks, validate and finalize it, "
                "then deliver it. Keep the final chat answer to a short summary and delivery status; "
                "do not paste the full document into one model response."
            )
        _append_to_last_user_message(messages, instruction)
    return ArtifactInjectionResult(
        artifact_required=artifact_required,
        artifact_intent_id=artifact_intent_id,
        resume_artifact=resume_artifact,
    )


def apply_output_continuation(
    *,
    event: InboundEvent,
    session: Session,
    messages: list[dict[str, Any]],
    artifact_required: bool,
) -> None:
    """Inject truncated-output resume instructions when applicable."""
    continuation_state = (
        session.metadata.get("_output_continuation")
        if isinstance(session.metadata, dict) else None
    )
    if (
        wants_resume(event.text)
        and not artifact_required
        and isinstance(continuation_state, dict)
    ):
        tail = str(continuation_state.get("tail") or "")[-2000:]
        resume_instruction = (
            "[Output continuation — resumed] The previous final answer was truncated. "
            "Continue exactly after the saved tail below without repeating it, and finish the answer.\n"
            f"<saved_tail>{tail}</saved_tail>"
        )
        _append_to_last_user_message(messages, resume_instruction)


@dataclass
class PlanInjectionResult:
    execution_plan: Any
    plan_run_id: str


async def apply_plan_injection(
    *,
    event: InboundEvent,
    context_key: str,
    trace_id: str,
    messages: list[dict[str, Any]],
    history: list[dict[str, Any]],
    retrieval: str,
    user_message: str,
    tool_defs: list,
    planner: Any,
    plan_run_store: Any,
) -> PlanInjectionResult:
    """Resume or create an execution plan and inject it into the turn prompt."""
    execution_plan = None
    plan_run_id = ""
    if planner and tool_defs:
        # Resume path: an interrupted multi-step plan (exhausted iterations
        # / budget halt / crash) + a bare "continue" from the user picks up
        # the stored run instead of planning from scratch. Previously
        # get_resumable() had no production caller — interrupted plans were
        # persisted but every next message re-planned.
        if plan_run_store is not None and wants_resume(event.text):
            try:
                resumable = await plan_run_store.get_resumable(context_key)
            except Exception as e:
                logger.debug("Resumable plan lookup failed: {}", e)
                resumable = None
            if resumable is not None:
                plan_run_id, execution_plan = resumable
                plan_context = execution_plan.to_prompt()
                resume_note = (
                    "[Plan — resumed]\n以下是上一轮未完成的计划及进度,"
                    f"请从中断处继续:\n{plan_context}"
                )
                _append_to_last_user_message(messages, resume_note)
                logger.info(
                    "Resuming plan run {} for session {}",
                    plan_run_id, context_key,
                )
    if planner and tool_defs and execution_plan is None:
        try:
            token_est = len(user_message) // 4
            execution_plan = await planner.create_plan(
                query=user_message,
                tools=tool_defs,
                context=planning_context(history, retrieval),
                token_estimate=token_est,
            )
            # A single-step plan ("reason and act iteratively") carries no
            # information — injecting it just burns prompt tokens.
            if execution_plan and len(execution_plan.steps) > 1:
                plan_context = execution_plan.to_prompt()
                _append_to_last_user_message(messages, f"[Plan]\n{plan_context}")
                # Persist the multi-step plan so step progress is queryable
                # and an interrupted long task can be resumed.
                if plan_run_store is not None:
                    try:
                        plan_run_id = await plan_run_store.create(
                            context_key, trace_id, execution_plan
                        )
                    except Exception as e:
                        logger.debug("Plan run persistence failed: {}", e)
        except Exception as e:
            logger.debug("Planning failed, proceeding without plan: {}", e)
    return PlanInjectionResult(execution_plan=execution_plan, plan_run_id=plan_run_id)
