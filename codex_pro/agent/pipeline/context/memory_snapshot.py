"""Memory snapshot / live-context resolution for ContextStage.

Mirrors reference Codex separation of durable memory fragments from the
turn orchestrator: snapshot validity, narrative prefetch, and
build_memory_context dispatch live here.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from loguru import logger

from codex_pro.agent.context import build_memory_context
from codex_pro.bus.events import InboundEvent


@dataclass(frozen=True)
class MemoryContextResult:
    """Resolved memory prompt fragment plus frozen snapshot ids for recall dedup."""

    memory_ctx: str
    snapshot_ids: frozenset[str]


async def resolve_memory_context(
    *,
    event: InboundEvent,
    context_key: str,
    working_ctx: str,
    ephemeral: bool,
    memory_enabled: bool,
    snapshot_enabled: bool,
    memory: Any,
    config: Any,
    memory_snapshots: dict[str, Any],
    memory_snapshot_ids: dict[str, frozenset[str]],
    memory_snapshot_meta: dict[str, Any],
    scope_version_fn: Any,
    put_snapshot: Any,
    episodic: Any,
    narrative_episode_count: int,
) -> MemoryContextResult:
    """Build the memory section of the system prompt for one turn.

    Returns empty/working-only context when memory is disabled or the session
    is ephemeral; otherwise prefers a version-keyed snapshot and falls back to
    live store reads.
    """
    snapshot_ids: frozenset[str] = frozenset()
    if not memory_enabled:
        # 总开关关闭：不读任何长期/快照记忆，只保留本轮 working memory。
        return MemoryContextResult(working_ctx, snapshot_ids)

    if snapshot_enabled and not ephemeral:
        cur_ver = scope_version_fn(event.memory_scope) if scope_version_fn else 0
        meta = memory_snapshot_meta.get(context_key)
        snapshot_valid = (
            context_key in memory_snapshots
            and meta is not None
            and meta == (event.memory_scope, cur_ver)
        )
        if snapshot_valid:
            snapshot = memory_snapshots[context_key]
            snapshot_ids = memory_snapshot_ids.get(context_key, frozenset())
        else:
            # R3 叙事层:async 上下文预取最近 N 条 episode.summary 传入,规避
            # get_snapshot_with_ids 转 async 牵动全部调用点。叙事随快照一起
            # 缓存,scope 版本 bump 时随快照失效(属既有缓存范畴)。
            narrative_summaries: list[str] = []
            if episodic is not None and narrative_episode_count > 0:
                try:
                    episodes = await episodic.get_session_episodes(
                        context_key, narrative_episode_count
                    )
                    narrative_summaries = [e.summary for e in episodes if e.summary]
                except Exception as e:
                    logger.debug("Narrative episode prefetch failed: {}", e)
            snapshot, snapshot_ids = memory.get_snapshot_with_ids(
                session_key=event.memory_scope,
                episode_summaries=narrative_summaries or None,
            )
            if put_snapshot is not None:
                # 写入唯一入口经 loop 的统一 LRU(锁 + 上限);
                # put_snapshot 为空时本轮仍用刚算出的 snapshot,但不缓存
                # (不得回退到无界直写 dict)。记录构建时 (scope, version),
                # 该 scope 被写后 bump 版本即令此快照失效。
                await put_snapshot(
                    context_key, snapshot, snapshot_ids,
                    event.memory_scope, cur_ver,
                )
        memory_ctx = build_memory_context(
            memory,
            snapshot=snapshot,
            working_memory=working_ctx,
            allow_env_writes=config.memory.allow_model_environment_writes,
        )
        return MemoryContextResult(memory_ctx, snapshot_ids)

    if ephemeral:
        # eval/test：不读任何长期/快照记忆,只保留本轮 working memory。
        return MemoryContextResult(working_ctx, snapshot_ids)

    memory_ctx = build_memory_context(
        memory,
        session_key=event.memory_scope,
        working_memory=working_ctx,
        allow_env_writes=config.memory.allow_model_environment_writes,
    )
    return MemoryContextResult(memory_ctx, snapshot_ids)
