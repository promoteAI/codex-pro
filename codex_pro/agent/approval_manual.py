"""Manual approval wait + prompt publish for ApprovalGate.

Keeps the interactive human-consent path out of the policy/check orchestrator,
mirroring reference Codex separation of exec approval UX from risk policy.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from loguru import logger

from codex_pro.agent.degraded_notice import (
    REASON_APPROVAL_DELIVERY_FAILED,
    REASON_APPROVAL_TIMEOUT,
    notice_for,
)
from codex_pro.bus.delivery import DeliveryResult, DeliveryStage
from codex_pro.bus.events import InboundEvent, OutboundEvent
from codex_pro.permissions.manager import ApprovalStatus
from codex_pro.security.guards import GuardDecision
from codex_pro.security.risk_classifier import RiskLevel
from codex_pro.tools import ToolResult

if TYPE_CHECKING:
    from codex_pro.agent.approval_gate import ApprovalCheck, ApprovalGate


async def manual_approval_flow(
    gate: "ApprovalGate",
    tool_name: str,
    arguments: dict[str, Any],
    sender_id: str,
    channel: str,
    event: InboundEvent | None,
    running: bool,
    guard: GuardDecision,
    approved_actions: frozenset[str],
    session_key: str,
    pattern_key: str,
    risk: RiskLevel = RiskLevel.EXEC,
) -> "ApprovalCheck":
    from codex_pro.agent.approval_gate import APPROVAL_SOURCE_HUMAN, ApprovalCheck

    approval_req = gate._approval.request_approval(
        tool_name, tool_name=tool_name, params=arguments, user_id=sender_id,
        # Tags the request with its conversation so a channel disconnect can
        # release it instead of leaving this turn parked for the full
        # wait_timeout_seconds with the session lock held.
        session_key=session_key,
        # Reaching this flow means step 10 already found the call needs
        # approval, so instruct the manager rather than asking it again: its
        # default_policy="approve" fallback would otherwise return an
        # already-APPROVED request for any tool missing from
        # ``require_approval``, making that name list the real gate instead
        # of the risk tier. Explicit auto_approve / prior "always" grants are
        # checked ahead of this inside request_approval and still win.
        require=True,
    )
    if approval_req.status == ApprovalStatus.DENIED:
        return ApprovalCheck(ToolResult(
            success=False,
            error=f"Tool '{tool_name}' denied by approval policy: {approval_req.reason}",
        ))
    if approval_req.status == ApprovalStatus.APPROVED:
        # Pre-approved by an explicit ApprovalManager rule — an operator's
        # auto_approve entry, or a human's earlier "always" for this exact
        # signature — not by a person answering this prompt, so it stays
        # "auto" for provenance purposes.
        #
        # This can no longer be the manager's "no rule covers this action"
        # fallback: request_approval is called with require=True above, which
        # opens a real pending request instead of defaulting to approve. That
        # matters because we only reach this flow once step 10 found the call
        # DOES need approval — treating the manager's silence as consent made
        # the ``require_approval`` name list the effective gate rather than
        # the risk tier, so any EXEC-tier tool missing from that list skipped
        # the prompt on remote channels (MCP tools can never be in it).
        return ApprovalCheck(approved_actions=approved_actions)

    if event is not None:
        delivery = await publish_approval_request(
            gate, event, approval_req.id, tool_name, guard, pattern_key, arguments, risk
        )
        # MessageBus always returns DeliveryResult in production. Keep None
        # compatible with lightweight third-party/test buses written before
        # receipts existed, but require a real platform receipt whenever one
        # is available: ACCEPTED can mean the channel intentionally skipped
        # this non-final event, which is exactly how weixin lost prompts.
        if (
            isinstance(delivery, DeliveryResult)
            and delivery.stage is not DeliveryStage.DELIVERED
        ):
            detail = delivery.error or delivery.stage.value
            gate._approval.deny(
                approval_req.id,
                reason=f"approval prompt delivery failed: {detail}",
                decided_by="system",
            )
            return ApprovalCheck(
                denial=ToolResult(
                    success=False,
                    error=(
                        f"Approval prompt for '{tool_name}' was not delivered; "
                        "the action was cancelled."
                    ),
                    metadata={"approval_request_id": approval_req.id},
                ),
                notify_user=True,
                notice=notice_for(
                    REASON_APPROVAL_DELIVERY_FAILED,
                    tool=tool_name,
                    request_id=approval_req.id,
                ),
                terminal=True,
            )

    if not running and gate._is_interactive_channel(channel):
        return ApprovalCheck(ToolResult(
            success=False,
            error=(
                f"Approval required before executing '{tool_name}'. "
                f"Request id: {approval_req.id}."
            ),
            metadata={"approval_request_id": approval_req.id},
        ))

    if gate._turn_runs is not None and event is not None:
        try:
            await gate._turn_runs.mark_activity(
                event.event_id, status="waiting_approval", current_tool=tool_name,
            )
        except Exception as e:
            logger.debug("Approval wait ledger write failed: {}", e)
    try:
        decided = await gate._approval.wait_for_decision(
            approval_req.id,
            timeout_seconds=gate._config.permissions.approval.wait_timeout_seconds,
        )
    finally:
        if gate._turn_runs is not None and event is not None:
            try:
                await gate._turn_runs.mark_activity(
                    event.event_id, status="running", current_tool="",
                )
            except Exception as e:
                logger.debug("Approval resume ledger write failed: {}", e)
    if decided and decided.status == ApprovalStatus.APPROVED:
        level = gate._parse_approval_level(decided.reason)
        gate._record_approval(session_key, pattern_key, level)
        # The one path where a person saw THIS call's details and said yes.
        # Tools that mint persistent privileges (cronjob's unattended grant)
        # key off this; every other pass above is policy, not consent.
        return ApprovalCheck(
            approved_actions=approved_actions,
            approval_source=APPROVAL_SOURCE_HUMAN,
        )
    if decided and decided.status == ApprovalStatus.DENIED:
        return ApprovalCheck(ToolResult(
            success=False,
            error=f"Tool '{tool_name}' denied: {decided.reason}",
            metadata={"approval_request_id": approval_req.id},
        ))
    return ApprovalCheck(
        denial=ToolResult(
            success=False,
            error=(
                f"Approval timed out for '{tool_name}'. "
                f"Request id: {approval_req.id} has expired. "
                "Re-trigger the action to obtain a new approval request."
            ),
            metadata={"approval_request_id": approval_req.id},
        ),
        notify_user=True,
        notice=notice_for(REASON_APPROVAL_TIMEOUT, tool=tool_name, request_id=approval_req.id),
        terminal=True,
    )


async def publish_approval_request(
    gate: "ApprovalGate",
    event: InboundEvent,
    request_id: str,
    tool_name: str,
    guard: GuardDecision,
    pattern_key: str,
    arguments: dict[str, Any] | None = None,
    risk: RiskLevel = RiskLevel.EXEC,
) -> DeliveryResult | None:
    reason = guard.reason or "审批策略要求确认"
    action = gate._describe_action(tool_name, arguments)
    # The scope wording is written out in full so the user knows exactly what
    # each choice grants — the old "同类操作" was ambiguous about whether it
    # meant this one command or every command.
    family = pattern_key.split(":", 1)[0] if ":" in pattern_key else ""
    cmd_name = pattern_key.split(":", 1)[1] if ":" in pattern_key else pattern_key
    lines = [
        f"⚠️ 需要确认执行  (风险: {risk.value.upper()})",
        f"工具: {tool_name}",
        f"操作: {action}",
        f"原因: {reason}",
        "",
        "回复其一:",
        f"  /approve {request_id}          仅本次",
    ]
    # "approve all" only makes sense (and is only honoured) for EXEC-family
    # shell work — don't advertise it for DANGEROUS tools like cronjob.
    if family in gate._SESSION_ALL_FAMILIES:
        lines.append(
            f"  /approve {request_id} all      本轮任务全放行:本会话内所有命令自动执行(推荐,省去逐条确认)"
        )
        lines.append(
            f"  /approve {request_id} session  本会话内只放行相同命令({cmd_name})"
        )
    else:
        lines.append(
            f"  /approve {request_id} session  本会话内放行相同操作"
        )
    lines.append(
        f"  /approve {request_id} always   永久放行相同操作({cmd_name}),写入磁盘"
    )
    lines.append(f"  /deny {request_id} [原因]      拒绝")
    text = "\n".join(lines)
    out = OutboundEvent.text_reply(
        channel=event.channel,
        chat_id=event.chat_id,
        text=text,
        reply_to_id=event.reply_to_id,
        # Approval prompts are NOT terminal — they are interactive prompts
        # that happen to look like a message. Marking them ``final`` would
        # claim the target in the delivery ledger, and the user's real
        # answer after /approve would be suppressed as a duplicate. The
        # default message_kind="final" therefore bypasses this: it is the
        # wrong default for an interactive prompt.
        is_final=False,
        message_kind="approval_prompt",
    )
    out.metadata = dict(event.metadata)
    out.metadata["_approval_request"] = True
    out.metadata["_inbound_event_id"] = event.event_id
    delivery = await gate._bus.publish_outbound(out)
    # Additive: emit an interactive approval frame for an attached cli TUI.
    # Fires AFTER the text publish and never changes approval outcome.
    # Gate before building the params dict so IM channels pay nothing.
    if gate._cog is not None and gate._cog.active(event):
        await gate._cog.emit(
            event, "approval_request",
            {"request_id": request_id, "action": tool_name, "tool": tool_name,
             "params": {k: str(v)[:120] for k, v in (arguments or {}).items()},
             "risk": reason},
            f"⚠️ 需要确认: {tool_name}",
        )
    return delivery
