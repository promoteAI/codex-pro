"""Interrupt command handlers — extracted from agent/loop.py.

Handles /__interrupt__ control events for the agent loop.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from codex_pro.agent.loop import AgentLoop
    from codex_pro.bus.events import InboundEvent


class InterruptCommands:
    """Stateless interrupt command logic attached to AgentLoop."""

    _INTERRUPT_CMD = "/__interrupt__"

    @staticmethod
    def is_interrupt_command(text: str) -> bool:
        return text.strip() == InterruptCommands._INTERRUPT_CMD

    @staticmethod
    async def handle_interrupt(loop: "AgentLoop", event: "InboundEvent") -> None:
        """Flag the session's running turn for a cooperative stop.

        Also cancel any clarify/approval parked on this session so a Ctrl+C
        unblocks them immediately rather than waiting for TTL expiration.
        Internal control command — no user-facing reply.
        """
        target_event_id = str(event.metadata.get("_interrupt_target_event_id", ""))
        targets_running = loop.interrupt.targets_running(
            event.session_key,
            target_event_id,
        )
        loop.interrupt.interrupt(event.session_key, target_event_id)
        if not targets_running:
            return
        loop.clarify.cancel_session(event.session_key)
        loop.approval.cancel_session(event.session_key, reason="interrupted by user")
