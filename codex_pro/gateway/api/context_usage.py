"""Context-usage observation endpoint.

Exposes the real per-session context-window occupancy so the web Composer's
"Context Usage" gauge/dialog can render live numbers instead of mock data.

What is real here
-----------------
The backend does **not** maintain a persisted per-segment token breakdown.
``ContextStage`` assembles the full prompt and history on every turn and then
discards it. Two values *are* available truthfully at request time, so this
endpoint computes them on demand (never fabricated):

* ``max`` — the model's resolved context window, from the compressor's
  ``context_window_tokens`` (the display value; only the compression *budget* is
  capped, see ``models/model_windows.py``).
* ``segments`` — token estimates recomputed from the live session and the live
  tool registry:

  * ``conversation`` — ``ContextEngine.estimate_tokens`` over the session's
    LLM-facing history (``Session.get_history``).
  * ``system`` — the system prompt rebuilt by the same ``ContextBuilder`` the
    pipeline uses, token-estimated the same way.
  * ``tools`` — tool definitions from the live registry, token-estimated.

The mock's extra segments (rules, skills, subagents) are *not* emitted because
there is no real per-segment counter behind them; skills/capabilities are folded
into the system prompt that is actually sent. This is intentionally honest: a
gauge that splits money into a fabricated breakdown is worse than one that shows
fewer, truthful segments.
"""

from __future__ import annotations

import json
from typing import Any, TYPE_CHECKING

from aiohttp import web

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer

#: Fixed labels/colors kept in the frontend's palette so the ring renders the
#: same way regardless of which segments the backend can produce.
_SEGMENT_STYLE: dict[str, dict[str, str]] = {
    "system": {"label": "System prompt", "color": "#8a8a8a"},
    "tools": {"label": "Tool definitions", "color": "#a78bfa"},
    "conversation": {"label": "Conversation", "color": "#9f1239"},
}


class ContextUsageAPI:
    """Read-only context-usage observer for a single session."""

    def __init__(self, server: GatewayServer):
        self._server = server

    def _guard(self, request: web.Request, action: str) -> web.Response | None:
        # Read-only observability, same tier as /sessions/{key}/history.
        return self._server._require_admin_token(request, action=action)

    def _loop(self) -> Any:
        return getattr(self._server, "_agent_loop", None)

    def _count_text(self, text: str) -> int:
        """Estimate token count for a single string using the compressor's
        counter when available, else a length/4 heuristic."""
        loop = self._loop()
        compressor = getattr(loop, "compressor", None)
        counter = getattr(compressor, "_token_counter", None)
        if counter is not None:
            try:
                return int(counter.count(text)) + 4
            except Exception:  # noqa: BLE001 - counter failure degrades to heuristic
                pass
        return len(text) // 4 + 4

    def _count_messages(self, messages: list[dict[str, Any]]) -> int:
        loop = self._loop()
        compressor = getattr(loop, "compressor", None)
        if compressor is not None:
            try:
                return int(compressor.estimate_tokens(messages))
            except Exception:  # noqa: BLE001
                pass
        return sum(len(str(m.get("content", ""))) // 4 + 4 for m in messages)

    def _build_segments(self, session: Any, channel: str) -> tuple[list[dict[str, Any]], int]:
        """Return (segments, used). ``used`` sums the segment token counts."""
        loop = self._loop()
        segments: list[dict[str, Any]] = []

        # system prompt
        system_tokens = 0
        try:
            system_prompt = self._rebuild_system_prompt(session, channel)
            system_tokens = self._count_text(system_prompt)
        except Exception:  # noqa: BLE001 - prompt rebuild must never break the gauge
            system_tokens = 0
        if system_tokens:
            segments.append(self._mk_segment("system", system_tokens))

        # tool definitions
        tools = getattr(loop, "tools", None)
        tool_tokens = 0
        if tools is not None:
            try:
                tool_defs = tools.get_definitions(channel)
                if tool_defs:
                    tool_tokens = self._count_text(json.dumps(tool_defs, ensure_ascii=False))
            except Exception:  # noqa: BLE001
                tool_tokens = 0
        if tool_tokens:
            segments.append(self._mk_segment("tools", tool_tokens))

        # conversation
        conv_tokens = self._count_messages(session.get_history())
        if conv_tokens:
            segments.append(self._mk_segment("conversation", conv_tokens))

        return segments, sum(s["tokens"] for s in segments)

    def _mk_segment(self, key: str, tokens: int) -> dict[str, Any]:
        style = _SEGMENT_STYLE.get(key, {"label": key, "color": "#9d9d9d"})
        return {
            "key": key,
            "label": style["label"],
            "color": style["color"],
            "tokens": tokens,
            "direct": 0.0,
        }

    def _rebuild_system_prompt(self, session: Any, channel: str) -> str:
        """Rebuild the system prompt the pipeline would send, for token counting.

        Mirrors ``ContextStage.build``'s inputs (memory + skills + capabilities),
        using the same ``ContextBuilder``. Failures degrade to "".
        """
        from codex_pro.agent.context import (
            build_capabilities_context,
            build_memory_context,
            build_skills_context,
        )

        loop = self._loop()
        builder = loop.context
        config = getattr(loop, "config", None)
        tool_defs = loop.tools.get_definitions(channel)

        skills_ctx = ""
        skill_store = getattr(loop, "skill_store", None)
        if skill_store is not None:
            skills_ctx = build_skills_context(skill_store)

        memory_ctx = ""
        memory = getattr(loop, "memory", None)
        if memory is not None and getattr(config, "memory", None) and config.memory.enabled:
            memory_ctx = build_memory_context(
                memory,
                session_key=getattr(session, "key", ""),
                allow_env_writes=getattr(config.memory, "allow_model_environment_writes", False),
            )

        capabilities_ctx = build_capabilities_context(tool_defs)
        return builder.build_system_prompt(
            memory_context=memory_ctx,
            skills_context=skills_ctx,
            capabilities=capabilities_ctx,
            channel=channel,
        )

    async def get_context_usage(self, request: web.Request) -> web.Response:
        guard = self._guard(request, "sessions_context_usage")
        if guard is not None:
            return guard

        key = request.match_info["key"]
        session = await self._server.session_manager.get(key)
        if session is None:
            return web.json_response({"error": "not found"}, status=404)

        loop = self._loop()
        compressor = getattr(loop, "compressor", None)
        max_tokens = 0
        if compressor is not None:
            max_tokens = int(getattr(compressor, "context_window_tokens", 0) or 0)
        if not max_tokens:
            # Fallback: resolve from model windows config (global default / default model).
            try:
                from codex_pro.models.model_windows import resolve_context_window

                config = getattr(loop, "config", None)
                max_tokens = resolve_context_window(
                    getattr(loop, "_default_model", ""),
                    captured_windows=(config.models.model_windows if config else None),
                    config_default=(config.session.context_window_tokens if config else 0),
                )
            except Exception:  # noqa: BLE001
                from codex_pro.models.model_windows import DEFAULT_CONTEXT_WINDOW

                max_tokens = DEFAULT_CONTEXT_WINDOW

        channel = key.split(":", 1)[0] if ":" in key else ""
        segments, used = self._build_segments(session, channel)
        # Re-attach direct % with the real max for the ring.
        for seg in segments:
            seg["direct"] = round(seg["tokens"] / max_tokens * 100, 1) if max_tokens else 0.0

        return web.json_response(
            {
                "max": max_tokens,
                "used": used,
                "segments": segments,
            }
        )
