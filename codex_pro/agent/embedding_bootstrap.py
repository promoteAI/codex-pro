"""Embedding / vector-index bootstrap for AgentLoop.

Phase-B wiring extracted from the composition root so AgentLoop start stays
orchestration-only.
"""
from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

from loguru import logger

from codex_pro.agent.embedding_helpers import (
    _ProviderEmbedFn,
    _embed_model_identity,
    probe_embed_provider,
    resolve_embed_fallback,
)

if TYPE_CHECKING:
    from codex_pro.agent.loop import AgentLoop


class EmbeddingBootstrap:
    """Stateless helpers; all methods take the AgentLoop host."""

    @staticmethod
    def _resolved_vector_dimensions(loop: "AgentLoop") -> int:
        """Dimension for knowledge attach: explicit config wins, then the live
        index, then the local model's known dim, then the legacy default."""
        if loop.config.memory.vector_dimensions:
            return loop.config.memory.vector_dimensions
        if loop._vector_index is not None and loop._vector_index.dimensions:
            return loop._vector_index.dimensions
        if loop._local_embedder is not None and loop._local_embedder.dimensions:
            return loop._local_embedder.dimensions
        return 1536

    @staticmethod
    async def _resolve_embed_and_index(loop: "AgentLoop", storage: Any) -> None:
        """阶段 B：探针定案 backend，构造 VectorIndex 与依赖它的消费者。

        由 start() 在向量初始化前调用。provider 模式探针失败抛 RuntimeError（不回退），
        auto 模式探针失败静默回退 fastembed，local 模式（候选恒为 None）直接走本地兜底。
        """
        config = loop.config
        # memory.enabled 关闭时,阶段 A 的 _init_advanced_memory 整段被跳过,
        # 原实现下不存在任何向量索引/消费者,这里同样短路以保持行为一致。
        if not config.memory.enabled:
            return
        # vector_enabled=False 或无 storage 时,探针+建索引整段跳过,但消费者仍需
        # 按原语义接线(关键词模式):改造前 HybridRetriever/矛盾检测/reflection/预取
        # 的构造在向量块之外,只受各自开关+storage 控制。此处以 vector_index=None、
        # embed_fn=None 调用 _wire_vector_consumers,HybridRetriever 退化为 BM25。
        if not (config.memory.vector_enabled and storage):
            loop._wire_vector_consumers(None, None)
            return
        candidate, emb_model = loop._embed_candidate
        embed_fn = None
        loop._embed_model_id = ""
        loop._local_embedder = None
        probe_dim = 0

        use_provider = False
        if candidate is not None:
            dim = await probe_embed_provider(
                candidate,
                emb_model,
                config.memory.embed_timeout_seconds,
            )
            if dim > 0:
                use_provider = True
                probe_dim = dim
            elif loop._embed_backend == "provider":
                raise RuntimeError(
                    "memory.embedding_backend=provider but the embedding probe "
                    "failed; fix the endpoint or switch to auto/local."
                )
            else:
                use_provider = False  # auto：静默回退 fastembed
        elif loop._embed_backend == "provider":
            # provider 模式却没挑到任何 embed 候选（主 provider 无 embed 能力且无路由）：
            # 契约要求强制 provider、不回退，这里同样报错而非静默降级。
            raise RuntimeError(
                "memory.embedding_backend=provider but no embed-capable provider "
                "is available; register one or switch to auto/local."
            )

        if use_provider:
            # _ProviderEmbedFn 失败返回 []（非 None），且连续失败熔断，止损后靠重启重决策。
            embed_fn = _ProviderEmbedFn(candidate, emb_model)
            loop._embed_model_id = _embed_model_identity(candidate, emb_model)
        else:
            embed_fn, loop._embed_model_id, loop._local_embedder = resolve_embed_fallback(
                None,
                emb_model,
                config.memory.local_embedding_model,
                local_load_timeout=config.memory.embed_load_timeout_seconds,
                hf_endpoint=config.memory.hf_embedding_endpoint,
                cache_dir=config.memory.local_embedding_cache_dir,
                max_load_attempts=config.memory.local_embedding_max_load_attempts,
                retry_backoff=config.memory.local_embedding_retry_backoff_seconds,
            )

        from codex_pro.memory.vectors import VectorIndex

        # 维度优先用探针实测值（config.vector_dimensions 默认 0=自动跟随），
        # 让索引在首个向量入库前就知道正确维度。
        vector_index = VectorIndex(
            storage,
            dimensions=probe_dim or config.memory.vector_dimensions,
            model_id=loop._embed_model_id,
        )
        loop._vector_index = vector_index
        loop._embed_fn = embed_fn
        loop.memory.set_vector_index(vector_index)
        loop.memory.set_embed_fn(embed_fn)
        loop.consolidator.set_embed_fn(embed_fn)
        if loop._episodic is not None and embed_fn is not None:
            # Same vector floor as the hybrid retriever: a low-cosine episode
            # must not enter the candidate pool (it would only be filtered later
            # at the retrieve() admission gate — cheaper to drop it at source).
            loop._episodic.attach_embedding(
                embed_fn,
                vector_index,
                min_similarity=config.memory.rrf_min_similarity,
            )
        loop._wire_vector_consumers(vector_index, embed_fn)

    @staticmethod
    def _wire_vector_consumers(loop: "AgentLoop", vector_index: Any, embed_fn: Any) -> None:
        """构造依赖最终 vector_index/embed_fn 的消费者（矛盾检测/reflection/混合检索），
        并把 __init__ 阶段以 None 占位的持有者（context_stage / memory 工具 / prefetcher）
        重新指向最终对象——这些持有者在 __init__ 里按值捕获引用，不重指会永久停在 None。"""
        config = loop.config
        storage = loop._storage
        forgetting = loop.memory.forgetting_curve

        if config.memory.contradiction_detection and storage:
            from codex_pro.memory.contradiction import ContradictionDetector

            # R1 Task8:裁决 mark_superseded 走 loop 单例 service 的 maintenance
            # 通道(统一失效+审计)。矛盾镜像跟踪(unresolved 标记/清除)仍直接落 store。
            detector = ContradictionDetector(
                storage,
                vector_index,
                store=loop.memory,
                service=loop._memory_service,
            )
            loop._contradiction_detector = detector
            loop.consolidator.set_contradiction_detector(detector)
            loop.consolidator.set_auto_resolve_contradictions(config.memory.auto_resolve_contradictions)
            # memory 工具在 _register_tools 时以 None 建成，这里补上检测器引用。
            mem_tool = loop.tools.get("memory")
            if mem_tool is not None and hasattr(mem_tool, "_contradiction_detector"):
                mem_tool._contradiction_detector = detector

        if config.memory.reflection_enabled:
            from codex_pro.memory.reflection import ReflectionEngine

            # R1 Task8:reflection 的写(蒸馏 add/清 tag/裁决 mark_superseded)注入
            # loop 单例 service,统一走 maintenance 通道失效+审计。收口前就近 new 的
            # reflection service 无 audit_path,审计 no-op——收敛后一并落统一审计。
            loop.consolidator.set_reflection(
                ReflectionEngine(
                    loop._memory_service,
                    llm_call=loop.provider.chat_with_retry,
                    contradiction_detector=loop._contradiction_detector,
                )
            )

        from codex_pro.memory.retrieval import HybridRetriever

        def entries_fn() -> list:
            return list(loop.memory._entries.values())

        # Episode candidates by relevance (semantic + LIKE), assembled inside
        # retrieve() so they ride the same call the prefetcher warms — this is
        # what keeps episodic recall alive on the CLI degrade-on-miss path (a
        # cache hit now carries episodes). None-safe: no episodic manager ⇒ no
        # episode candidates, retrieval stays memory-only.
        episodic_mgr = loop._episodic

        async def _episode_search(query: str, session_key: str, limit: int) -> list:
            if episodic_mgr is None:
                return []
            return await episodic_mgr.search_episodes(query, session_key=session_key or None, limit=limit)

        # Optional cross-encoder reranker. Built once here; the rerank_fn closure
        # bounds each call with the INFERENCE budget so a slow/still-loading model
        # degrades THIS turn to the un-reranked RRF order instead of stalling the
        # reply. The model load gets its own, far larger budget: a ~1GB ONNX load
        # can never finish inside a per-turn budget, and sharing one value meant
        # every wait timed out (silent permanent degrade). start() warms the model
        # in the background so the first real turn likely finds it hot.
        rerank_fn = None
        rerank_min_score = None
        if config.memory.rerank_enabled:
            from codex_pro.memory.local_rerank import LocalReranker

            loop._reranker = LocalReranker(
                model_name=config.memory.rerank_model,
                load_timeout_seconds=config.memory.rerank_load_timeout_seconds,
                hf_endpoint=config.memory.hf_embedding_endpoint,
                cache_dir=config.memory.local_embedding_cache_dir,
                max_load_attempts=config.memory.local_embedding_max_load_attempts,
                retry_backoff_seconds=config.memory.local_embedding_retry_backoff_seconds,
            )
            _reranker = loop._reranker
            _rerank_budget = max(0.1, float(config.memory.rerank_timeout_seconds))

            async def rerank_fn(query: str, docs: list) -> "list[float] | None":
                try:
                    return await asyncio.wait_for(_reranker.rerank(query, docs), timeout=_rerank_budget)
                except (asyncio.TimeoutError, TimeoutError):
                    logger.debug("Rerank exceeded {}s budget; keeping RRF order", _rerank_budget)
                    return None

            _floor = float(config.memory.rerank_min_score)
            rerank_min_score = _floor if _floor > 0 else None

        loop._hybrid_retriever = HybridRetriever(
            entries_fn=entries_fn,
            vector_index=vector_index,
            forgetting=forgetting,
            embed_fn=embed_fn,
            embed_timeout=config.memory.embed_timeout_seconds,
            visibility_fn=loop.memory.is_visible_in_session,
            episode_search_fn=_episode_search if episodic_mgr is not None else None,
            is_unresolved_fn=loop.memory.is_unresolved,
            min_similarity=config.memory.rrf_min_similarity,
            rerank_fn=rerank_fn,
            rerank_top_k=config.memory.rerank_top_k,
            rerank_min_score=rerank_min_score,
        )
        loop.memory.set_retriever(loop._hybrid_retriever)
        # context_stage 在 __init__ 里按值持有了 None，这里重指最终检索器。
        loop._context_stage._hybrid_retriever = loop._hybrid_retriever
        # prefetcher 只在存在检索器时才有意义；__init__ 时检索器为 None 故未建，
        # 这里补建并重指 response_stage，使回复后预取重新生效。
        from codex_pro.memory.prefetch import RetrievalPrefetcher

        async def _knowledge_fetch(query: str, user_id: str, channel: str = "") -> str:
            # search_async (keyword + vector), not the keyword-only sync search —
            # see the identical closure in __init__.
            results = await loop.knowledge.search_async(
                query, limit=config.knowledge.max_results, user_id=user_id, channel=channel
            )
            return loop.knowledge.format_results(results)

        loop._prefetcher = RetrievalPrefetcher(
            # limit=8 matches the inline sync path (5 memory + 3 episode) now
            # that episodes ride the same retrieve() call.
            loop._hybrid_retriever,
            loop._put_retrieval_cache,
            limit=8,
            knowledge_fetch=_knowledge_fetch if loop.knowledge else None,
        )
        loop._response_stage._prefetcher = loop._prefetcher

    @staticmethod
    async def _warmup_embedding(loop: "AgentLoop") -> None:
        """Prime the embedding backend once at startup.

        The inline retrieval budget (memory.retrieval_miss_timeout_seconds,
        default 0.8s) is spent almost entirely on the FIRST embedding call —
        a local fastembed model lazy-loads/JITs on first use, then serves
        subsequent queries in ~10-50ms. Without a warmup the first real turn
        (and every topic-switch cache miss until the model is hot) times out
        and degrades to keyword-only — dropping the one signal that carries
        absolute relevance. A throwaway embed here moves that cost off the
        user-facing path. Best-effort: failure just leaves the old lazy
        behavior intact.
        """
        if loop._embed_fn is None:
            return
        try:
            await asyncio.wait_for(
                loop._embed_fn("warmup"),
                timeout=loop.config.memory.embed_load_timeout_seconds,
            )
            logger.info("Embedding backend warmed up")
        except Exception as e:
            logger.debug("Embedding warmup skipped ({}); first query will lazy-load", e)

    @staticmethod
    async def _warmup_reranker(loop: "AgentLoop") -> None:
        """Prime the cross-encoder reranker once at startup.

        Same reasoning as _warmup_embedding, only more so: the reranker model is
        an order of magnitude larger (~1GB ONNX), so its first-use lazy load can
        never fit inside a per-turn budget. Without a warmup the reranker is
        effectively dead weight — every turn waits out the inference budget, gets
        None, and silently keeps the RRF order, while the model file sits unused
        on disk. Warming it here moves that one-time cost off the user-facing path.

        The wait uses the LOAD budget (not the per-turn inference budget) because
        that is what is actually happening here. Outcome is logged at INFO/WARNING
        rather than DEBUG: "is the reranker actually serving?" is otherwise
        unanswerable from the logs, which is exactly how a permanently degraded
        reranker went unnoticed.
        """
        if loop._reranker is None:
            return
        budget = loop.config.memory.rerank_load_timeout_seconds
        # LocalReranker.rerank already bounds its own load wait by the load
        # budget, and only THEN runs inference. So this outer guard gets the load
        # budget plus one inference budget — sized at exactly the load budget it
        # could abort a load that had just succeeded and report a misleading
        # failure. This is only a backstop against a wedged call; the inner waits
        # are what normally decide the outcome.
        guard = budget + max(0.1, float(loop.config.memory.rerank_timeout_seconds))
        try:
            scores = await asyncio.wait_for(
                loop._reranker.rerank("warmup", ["warmup document"]),
                timeout=guard,
            )
        except Exception as e:
            logger.warning(
                "Reranker warmup failed ({}); retrieval keeps the RRF order until the model loads on a later turn",
                e,
            )
            return
        if scores:
            logger.info("Reranker warmed up: {}", loop.config.memory.rerank_model)
        else:
            # rerank() swallows its own failures and returns None, so an empty
            # result here means "not ready" — the load is still running, hit its
            # own budget, or failed. Either way retrieval degrades to RRF order,
            # and that must be visible.
            logger.warning(
                "Reranker '{}' not ready after {}s; retrieval keeps the un-reranked "
                "RRF order until the background load completes",
                loop.config.memory.rerank_model,
                budget,
            )
