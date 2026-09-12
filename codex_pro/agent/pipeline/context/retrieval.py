"""Turn-scoped memory/knowledge retrieval helpers for ContextStage.

Extracted so the orchestrator can stay thin while dual-key wiring
(memory_scope vs episode_session_key) remains inspectable in one place.
"""

from __future__ import annotations

import asyncio
from typing import Any

from loguru import logger

from codex_pro.bus.events import InboundEvent
from codex_pro.memory.eligibility import Audience


async def fetch_knowledge(
    knowledge: Any,
    query: str,
    user_id: str,
    *,
    channel: str = "",
    max_results: int,
) -> tuple[list, str]:
    """Inline knowledge retrieval. Vector path is async; keyword-only path
    degrades internally. Scoped by user_id for access control."""
    results = await knowledge.search_async(
        query, limit=max_results, user_id=user_id, channel=channel
    )
    context = knowledge.format_results(results)
    return results, context


async def bounded_retrieve(
    event: InboundEvent,
    *,
    context_key: str = "",
    query: str = "",
    hybrid_retriever: Any = None,
    memory: Any = None,
    timeout: float = 0.0,
) -> list | None:
    """Degrade-mode cache miss: sync retrieval under a time budget.

    Latency-first CLI still deserves memory on first turns and topic
    switches — those are exactly the misses. Budget exceeded → local
    keyword search (fast, no embedding call). Budget 0 → skip entirely
    (the legacy degrade), keeping the old escape hatch configurable.
    """
    if timeout <= 0 or not hybrid_retriever:
        if timeout > 0 and not hybrid_retriever:
            # No retriever wired (vector off): keyword search IS the
            # bounded path, and it's synchronous/fast already.
            # 可见性用 memory_scope(owner-aware),与写侧 source_session 对齐。
            # audience=RETRIEVAL:兜底召回本就是"该显示的召回",与 Hybrid
            # 主路径对齐,过滤 superseded/archived/unresolved,不漏进 prompt。
            return memory.search_scored(
                query or event.text, limit=5, session_key=event.memory_scope,
                audience=Audience.RETRIEVAL,
            )
        return None
    try:
        return await asyncio.wait_for(
            hybrid_retriever.retrieve(
                query or event.text, limit=8,
                memory_scope=event.memory_scope,
                episode_session_key=context_key or event.session_key,
            ),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        logger.debug(
            "Bounded retrieval timed out after {}s; keyword fallback", timeout
        )
        try:
            return memory.search_scored(
                query or event.text, limit=5, session_key=event.memory_scope,
                audience=Audience.RETRIEVAL,
            )
        except Exception as e:
            logger.debug("Keyword fallback failed: {}", e)
            return None
    except Exception as e:
        logger.debug("Bounded retrieval failed: {}", e)
        return None
