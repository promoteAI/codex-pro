"""Approval command handlers — extracted from agent/loop.py.

Handles /approve, /deny, /approvals commands for the agent loop.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from codex_pro.agent.loop import AgentLoop


class ApprovalCommands:
    """Stateless approval command logic attached to AgentLoop."""

    @staticmethod
    def is_approval_command(loop: "AgentLoop", text: str) -> bool:
        stripped = text.strip()
        if not stripped.startswith("/"):
            return False
        command = stripped.split(maxsplit=1)[0].lower()
        return command in {"/approvals", "/approve", "/deny"}

    @staticmethod
    async def handle_approval_command(loop: "AgentLoop", event: Any) -> str | None:
        text = event.text.strip()
        if not ApprovalCommands.is_approval_command(loop, text):
            return None
        parts = text.split(maxsplit=2)
        command = parts[0].lower()

        if command == "/approvals":
            pending = loop.approval.get_pending()
            visible = [req for req in pending if ApprovalCommands.can_decide_approval(loop, event.sender_id, req)]
            if not visible:
                return "No pending approval requests."
            lines = ["Pending approval requests:"]
            for req in visible:
                lines.append(f"- {req.id}: {req.tool_name or req.action} requested by {req.user_id}")
            return "\n".join(lines)

        if len(parts) < 2:
            return f"Usage: `{command} <request_id>`"
        request_id = parts[1]
        req = loop.approval.get(request_id)
        if not req:
            return ApprovalCommands.describe_inactive_approval(loop, request_id)
        if not ApprovalCommands.can_decide_approval(loop, event.sender_id, req):
            return "You are not allowed to decide this approval request."

        if command == "/approve":
            level = parts[2] if len(parts) >= 3 else ""
            ok = loop.approval.approve(request_id, level=level, decided_by=event.sender_id)
            return f"Approval request {request_id} approved." if ok else ApprovalCommands.describe_inactive_approval(loop, request_id)

        reason = parts[2] if len(parts) >= 3 else ""
        ok = loop.approval.deny(request_id, reason=reason, decided_by=event.sender_id)
        return f"Approval request {request_id} denied." if ok else ApprovalCommands.describe_inactive_approval(loop, request_id)

    @staticmethod
    def describe_inactive_approval(loop: "AgentLoop", request_id: str) -> str:
        """Explain why a non-pending request can't be acted on."""
        from codex_pro.agent.approval_gate import ApprovalStatus
        historic = loop.approval._find_history(request_id)
        if historic is None:
            return f"Approval request not found: {request_id}"
        status = historic.status
        if status == ApprovalStatus.APPROVED:
            when = historic.decided_at or "earlier"
            return f"Approval request {request_id} was already approved ({when}); no action needed."
        if status == ApprovalStatus.DENIED:
            suffix = f": {historic.reason}" if historic.reason else ""
            return f"Approval request {request_id} was already denied{suffix}."
        if status == ApprovalStatus.EXPIRED:
            return (
                f"Approval request {request_id} expired before it was approved; "
                "the action did not run. Please re-trigger it to get a fresh request."
            )
        return f"Approval request not found: {request_id}"

    @staticmethod
    def can_decide_approval(loop: "AgentLoop", user_id: str, request: Any) -> bool:
        if user_id in (loop.config.permissions.admin_users or []):
            return True
        if not loop.config.permissions.admin_users:
            return not request.user_id or request.user_id == user_id
        return False
