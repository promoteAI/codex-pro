"""Streaming parameter helpers — extracted from agent/loop.py.

Provides channel matching and stream flush configuration for the agent loop.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from codex_pro.agent.loop import AgentLoop
    from codex_pro.bus.events import InboundEvent
    from codex_pro.session.manager import Session


def channel_matches(channel: str, patterns: list[str]) -> bool:
    from codex_pro.agent.streaming import channel_matches as _channel_matches
    return _channel_matches(channel, patterns)


class StreamParams:
    """Stateless streaming parameter logic attached to AgentLoop."""

    @staticmethod
    def should_stream_channel(loop: "AgentLoop", channel: str) -> bool:
        return channel_matches(channel, loop.config.channels.stream_channels)

    @staticmethod
    def stream_flush_params(loop: "AgentLoop", channel: str) -> tuple[int, int, bool]:
        """Return (flush_chars, flush_interval_ms, paragraph_mode) for a channel."""
        ch = loop.config.channels
        if ch.stream_local_flush_chars > 0 and channel_matches(channel, ch.stream_local_channels):
            return (ch.stream_local_flush_chars, ch.stream_local_flush_interval_ms, False)
        return (ch.stream_flush_chars, ch.stream_flush_interval_ms, ch.stream_paragraph_mode)

    @staticmethod
    def should_introduce(loop: "AgentLoop", session: "Session") -> bool:
        if not loop.config.session.introduction_enabled:
            return False
        return not any(msg.get("role") == "assistant" for msg in session.messages)

    @staticmethod
    def build_introduction(loop: "AgentLoop", event: "InboundEvent") -> str:
        from loguru import logger
        template = loop.config.session.introduction_template.strip()
        if not template:
            if event.channel in {"wecom", "weixin"}:
                template = "你好，我是 {agent_name}，很高兴为你服务。"
            else:
                template = "Hello, I'm {agent_name}. How can I help?"

        values = {
            "agent_name": loop.context.agent_name,
            "channel": event.channel,
            "chat_id": event.chat_id,
            "session_key": event.session_key,
        }
        try:
            return template.format(**values).strip()
        except Exception:
            logger.warning("Invalid session introduction template, using raw text")
            return template
