"""Clarify command handlers — extracted from agent/loop.py.

Handles /clarify, /__clarify_cancel__ commands for the agent loop.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from codex_pro.agent.loop import AgentLoop
    from codex_pro.bus.events import InboundEvent


class ClarifyCommands:
    """Stateless clarify command logic attached to AgentLoop."""

    _CLARIFY_CANCEL_CMD = "/__clarify_cancel__"

    @staticmethod
    def is_clarify_command(text: str) -> bool:
        return text.strip().split(maxsplit=1)[0].lower() == "/clarify" if text.strip() else False

    @staticmethod
    def is_clarify_cancel_command(text: str) -> bool:
        return text.strip() == ClarifyCommands._CLARIFY_CANCEL_CMD

    @staticmethod
    async def handle_clarify_command(loop: "AgentLoop", event: "InboundEvent") -> str | None:
        head = event.text.lstrip()
        parts = head.split(maxsplit=1)
        if len(parts) < 2:
            return "用法:`/clarify <id> <答案>`"
        rest = parts[1]
        clarify_id = rest.split(maxsplit=1)[0]
        answer = rest[len(clarify_id):]
        if answer[:1].isspace():
            answer = answer[1:]
        ok = loop.clarify.resolve(clarify_id, answer)
        if ok:
            return f"已回复澄清请求 {clarify_id}。"
        return f"澄清请求未找到或已处理:{clarify_id}"

    @staticmethod
    async def handle_clarify_cancel(loop: "AgentLoop", event: "InboundEvent") -> None:
        """Wake any clarify blocked on this session.

        Internal control command — no user-facing reply.
        """
        loop.clarify.cancel_session(event.session_key)
        loop.approval.cancel_session(event.session_key)

    @staticmethod
    def maybe_bind_im_clarify_answer(loop: "AgentLoop", event: "InboundEvent") -> None:
        """Bind an IM message to a pending follow-up question on its session."""
        from codex_pro.bus.events import EventType
        if event.event_type != EventType.MESSAGE or event.unattended or event.is_control:
            return
        clarify = getattr(loop, "clarify", None)
        if clarify is None:
            return
        session_key = event.session_key
        if not session_key:
            return
        if event.reply_to_text:
            clarify.clear_im_pending(session_key)
            return
        ttl = float(loop.config.session.im_clarify_pending_ttl_seconds)
        req = clarify.take_im_pending(session_key, ttl)
        if req is None:
            return
        question = (req.question or "").strip()
        if not question:
            return
        if req.options:
            choices = "；".join(f"{chr(65 + i)}. {opt}" for i, opt in enumerate(req.options))
            quoted = f"{question}\n可选项：{choices}"
        else:
            quoted = question
        event.reply_to_text = quoted
        event.reply_to_is_own = True
        event.reply_to_sender = None
