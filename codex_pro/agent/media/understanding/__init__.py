"""Inbound media understanding (infrastructure, not an LLM tool).

Turns inbound non-text media (audio/voice now; video later) into text the
model can read, injected into the user message by ContextBuilder.
"""
from __future__ import annotations

from codex_pro.agent.media.understanding.base import (
    MediaUnderstanding,
    UnderstandResult,
)
from codex_pro.agent.media.understanding.registry import default_understanders

__all__ = ["MediaUnderstanding", "UnderstandResult", "default_understanders"]
