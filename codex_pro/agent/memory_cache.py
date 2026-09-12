"""Session-scoped memory snapshot and retrieval-cache helpers for AgentLoop.

Keeps LRU / scope-version invalidation out of the composition root, matching
the reference Codex separation of durable context caches from turn execution.
"""

from __future__ import annotations

from collections import OrderedDict
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from codex_pro.agent.loop import AgentLoop


class MemoryCache:
    """LRU snapshot + retrieval cache with per-scope version invalidation."""

    @staticmethod
    async def lru_put(loop: "AgentLoop", cache: OrderedDict, key: str, value: Any) -> None:  # type: ignore[type-arg]
        async with loop._state_lock:
            cache[key] = value
            cache.move_to_end(key)
            while len(cache) > loop._max_cached_sessions:
                cache.popitem(last=False)

    @staticmethod
    async def put_memory_snapshot(
        loop: "AgentLoop",
        key: str,
        value: str,
        ids: frozenset[str] | None = None,
        scope: str = "",
        version: int = 0,
    ) -> None:
        """快照缓存的唯一写入入口:经统一 LRU 管控。同时写入进入快照的 entry.id 集,
        供动态召回去重。并记录构建时的 (scope, version),读侧据此按 scope 版本校验:
        某 scope 被写后 bump 版本,挂在任意 session_key 上的旧快照都因版本不符失效。"""
        await MemoryCache.lru_put(loop, loop._memory_snapshots, key, value)
        await MemoryCache.lru_put(loop, loop._memory_snapshot_ids, key, ids or frozenset())
        async with loop._state_lock:
            loop._memory_snapshot_meta[key] = (scope, version)
            # meta 不走 _lru_put,快照被 LRU 逐出后其 meta 会残留。按当前快照键集
            # 剪除孤儿 meta,保证 meta 不超出快照上限、不无界增长(读侧已先 gate
            # session_key in _memory_snapshots,孤儿 meta 不会误命中,但须防泄漏)。
            if len(loop._memory_snapshot_meta) > len(loop._memory_snapshots):
                live = set(loop._memory_snapshots)
                for k in [mk for mk in loop._memory_snapshot_meta if mk not in live]:
                    del loop._memory_snapshot_meta[k]

    @staticmethod
    def scope_version(loop: "AgentLoop", scope: str) -> int:
        return loop._scope_versions.get(scope, 0)

    @staticmethod
    async def clear_memory_snapshot(loop: "AgentLoop", session_key: str) -> None:
        async with loop._state_lock:
            loop._memory_snapshots.pop(session_key, None)
            loop._memory_snapshot_ids.pop(session_key, None)
            loop._memory_snapshot_meta.pop(session_key, None)

    @staticmethod
    async def invalidate_memory_caches(
        loop: "AgentLoop", scope: str, global_scope: bool = False,
    ) -> None:
        """记忆写操作后的缓存失效。per-scope 用版本号:bump 该 scope 的版本,
        使所有在旧版本下构建、共享该 memory_scope 的快照/检索缓存(可能挂在
        不同 session_key 上)读取时因版本不符而失效——根治按单 session_key
        pop 清不掉跨通道共享 scope 的问题。environment/矛盾裁决影响所有会话,
        仍全局 clear。"""
        async with loop._state_lock:
            if global_scope:
                loop._memory_snapshots.clear()
                loop._memory_snapshot_ids.clear()
                loop._memory_snapshot_meta.clear()
                loop._retrieval_cache.clear()
            else:
                loop._scope_versions[scope] = loop._scope_versions.get(scope, 0) + 1

    @staticmethod
    async def put_retrieval_cache(loop: "AgentLoop", session_key: str, entry: Any) -> None:
        """检索预取缓存的唯一写入入口:复用统一 LRU(锁 + 上限),
        与 snapshot 缓存共用上限策略,避免无界增长。"""
        await MemoryCache.lru_put(loop, loop._retrieval_cache, session_key, entry)

    @staticmethod
    def get_retrieval_cache(loop: "AgentLoop", session_key: str) -> Any:
        return loop._retrieval_cache.get(session_key)
