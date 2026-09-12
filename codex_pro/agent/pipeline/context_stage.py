"""Context stage — assembles system prompt, memory, retrieval, and messages for LLM."""

from __future__ import annotations

import copy
import time
from collections import OrderedDict
from typing import Any, TYPE_CHECKING

from loguru import logger

from codex_pro.agent.context import (
    ContextBuilder,
    build_capabilities_context,
    build_skills_context,
)
from codex_pro.agent.pipeline.context.artifact_intent import (
    artifact_continuation_is_live,
    artifact_output_required,
    expects_artifact,
    wants_artifact_resume,
)
from codex_pro.agent.pipeline.context.memory_snapshot import resolve_memory_context
from codex_pro.agent.pipeline.context.recall import filter_recall_by_snapshot
from codex_pro.agent.pipeline.context.turn_injections import (
    apply_artifact_injection,
    apply_output_continuation,
    apply_plan_injection,
)
from codex_pro.agent.pipeline.context.turn_input import (
    build_user_message_with_reply,
    contextual_retrieval_query,
    planning_context,
    wants_resume,
)
from codex_pro.agent.pipeline.response_stage import _is_ephemeral_session
from codex_pro.agent.pipeline.types import PipelineContext
from codex_pro.bus.events import InboundEvent
from codex_pro.memory.eligibility import Audience
from codex_pro.session.manager import Session

# Re-export helpers historically imported from this module.
__all__ = [
    "ContextStage",
    "artifact_continuation_is_live",
    "artifact_output_required",
    "build_user_message_with_reply",
    "contextual_retrieval_query",
    "filter_recall_by_snapshot",
    "planning_context",
    "wants_artifact_resume",
    "wants_resume",
]

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from codex_pro.agent.compression import ConversationCompressor
    from codex_pro.agent.cognitive_emitter import CognitiveEmitter
    from codex_pro.agent.planning.planner import AgentPlanner
    from codex_pro.config.schema import Config
    from codex_pro.knowledge.index import KnowledgeIndex
    from codex_pro.memory.retriever import HybridRetriever
    from codex_pro.memory.store import MemoryStore
    from codex_pro.models.inference import InferenceController
    from codex_pro.session.manager import SessionManager
    from codex_pro.skills.store import SkillStore


class ContextStage:
    """Builds the full pipeline context: system prompt, messages, retrieval, tool defs."""

    _TASK_MARKERS = {
        "document": (
            "审校", "校对", "报告", "文档", "全文", "完整稿", "白皮书", "说明书",
            "proofread", "report", "document", "manuscript", "full review",
        ),
        "code": ("代码", "报错", "bug", "函数", "class ", "def ", "typescript", "python"),
        "research": ("搜索", "查找", "search", "find", "look up", "查一下"),
        "planning": ("计划", "规划", "plan", "schedule", "安排"),
    }

    def __init__(
        self,
        *,
        config: Config,
        sessions: SessionManager,
        memory: MemoryStore,
        compressor: ConversationCompressor,
        context_builder: ContextBuilder,
        skill_store: SkillStore | None,
        knowledge: KnowledgeIndex | None,
        hybrid_retriever: HybridRetriever | None,
        planner: AgentPlanner | None,
        inference: InferenceController,
        working_memories: OrderedDict,
        memory_snapshots: OrderedDict,
        memory_snapshot_ids: "OrderedDict | None" = None,
        put_snapshot: "Callable[[str, str, frozenset], Awaitable[None]] | None" = None,
        memory_snapshot_meta: "dict[str, tuple[str, int]] | None" = None,
        scope_version_fn: "Callable[[str], int] | None" = None,
        snapshot_enabled: bool,
        memory_enabled: bool = True,
        tool_definitions_fn: Any,
        episodic: Any = None,
        narrative_episode_count: int = 3,
        plan_run_store: Any = None,
        retrieval_cache_get: "Callable[[str], Any] | None" = None,
        retrieval_on_miss: str = "degrade",
        retrieval_miss_timeout: float = 0.8,
        cache_ttl: float = 60.0,
        cache_jaccard_min: float = 0.3,
        cognitive_emitter: "CognitiveEmitter | None" = None,
    ):
        self._config = config
        self._sessions = sessions
        self._memory = memory
        self._compressor = compressor
        self._context_builder = context_builder
        self._skill_store = skill_store
        self._knowledge = knowledge
        self._hybrid_retriever = hybrid_retriever
        self._planner = planner
        self._inference = inference
        self._working_memories = working_memories
        self._memory_snapshots = memory_snapshots
        self._memory_snapshot_ids = memory_snapshot_ids if memory_snapshot_ids is not None else {}
        self._put_snapshot = put_snapshot
        self._memory_snapshot_meta = memory_snapshot_meta if memory_snapshot_meta is not None else {}
        self._scope_version_fn = scope_version_fn
        self._snapshot_enabled = snapshot_enabled
        self._memory_enabled = memory_enabled
        self._tool_definitions_fn = tool_definitions_fn
        self._episodic = episodic
        self._narrative_episode_count = narrative_episode_count
        self._plan_run_store = plan_run_store
        self._retrieval_cache_get = retrieval_cache_get
        self._retrieval_on_miss = retrieval_on_miss
        self._retrieval_miss_timeout = retrieval_miss_timeout
        self._cache_ttl = cache_ttl
        self._cache_jaccard_min = cache_jaccard_min
        self._cog = cognitive_emitter

    async def _emit_memory_recalled(self, event: InboundEvent, scored: list) -> None:
        """Emit a `memory_recalled` cognitive frame carrying each recalled
        memory's content/source-grade/score. Called from build() after the
        turn's memory items are known.

        Normalizes BOTH shapes deliberately: the real call site passes
        `(entry, score)` tuples (entry has `.content`/`.source`), while unit
        tests and any structured-dict caller pass `{"content","source","score"}`
        dicts. Handling both keeps the emitter robust to either provenance
        without a shared type dependency — not overbuilding.
        """
        # Gate before building items: on IM channels this skips the whole
        # slice/round loop, not just a discarded emit() payload.
        if self._cog is None or not scored or not self._cog.active(event):
            return
        items: list[dict[str, Any]] = []
        for s in scored[:12]:
            if isinstance(s, dict):
                content = s.get("content", "")
                source = s.get("source", "legacy")
                score = s.get("score", 0.0)
            elif isinstance(s, tuple):  # real call site: (entry, score)
                entry, score = s[0], (s[1] if len(s) > 1 else 0.0)
                content = getattr(entry, "content", "")
                source = getattr(entry, "source", "legacy")
            else:  # bare entry object
                content = getattr(s, "content", str(s))
                source = getattr(s, "source", "legacy")
                score = getattr(s, "score", 0.0)
            items.append({
                "content": str(content)[:200],
                "source": source or "legacy",
                "score": round(float(score or 0.0), 3),
            })
        await self._cog.emit(
            event, "memory_recalled", {"items": items},
            f"召回 {len(items)} 条记忆",
        )

    async def _fetch_knowledge(self, query: str, user_id: str, *, channel: str = "") -> tuple[list, str]:
        """Compatibility wrapper — knowledge fetch lives in context.retrieval."""
        from codex_pro.agent.pipeline.context.retrieval import fetch_knowledge

        return await fetch_knowledge(
            self._knowledge,
            query,
            user_id,
            channel=channel,
            max_results=self._config.knowledge.max_results,
        )

    async def _bounded_retrieve(
        self, event: InboundEvent, context_key: str = "", query: str = "",
    ) -> list | None:
        """Compatibility wrapper — bounded retrieve lives in context.retrieval."""
        from codex_pro.agent.pipeline.context.retrieval import bounded_retrieve

        return await bounded_retrieve(
            event,
            context_key=context_key,
            query=query,
            hybrid_retriever=self._hybrid_retriever,
            memory=self._memory,
            timeout=self._retrieval_miss_timeout,
        )

    async def build(
        self,
        event: InboundEvent,
        session: Session,
        *,
        publish_response: bool,
        trace_id: str,
        stream_publisher: Any,
        intro_text: str,
    ) -> PipelineContext:
        from codex_pro.session.context_epoch import conversation_context_key

        context_key = conversation_context_key(event.session_key, session)
        ephemeral = _is_ephemeral_session(event.session_key, event.channel)
        working_ctx = ""
        if context_key in self._working_memories:
            working_ctx = self._working_memories[context_key].get_context()

        mem_result = await resolve_memory_context(
            event=event,
            context_key=context_key,
            working_ctx=working_ctx,
            ephemeral=ephemeral,
            memory_enabled=self._memory_enabled,
            snapshot_enabled=self._snapshot_enabled,
            memory=self._memory,
            config=self._config,
            memory_snapshots=self._memory_snapshots,
            memory_snapshot_ids=self._memory_snapshot_ids,
            memory_snapshot_meta=self._memory_snapshot_meta,
            scope_version_fn=self._scope_version_fn,
            put_snapshot=self._put_snapshot,
            episodic=self._episodic,
            narrative_episode_count=self._narrative_episode_count,
        )
        memory_ctx = mem_result.memory_ctx
        snapshot_ids = mem_result.snapshot_ids

        skills_ctx = build_skills_context(self._skill_store)
        # Derive capabilities from the live tool registry (config, not memory).
        tool_defs = self._inference.filter_tools(self._tool_definitions_fn(channel=event.channel))
        capabilities_ctx = build_capabilities_context(tool_defs)
        system_prompt = self._context_builder.build_system_prompt(
            memory_context=memory_ctx,
            skills_context=skills_ctx,
            capabilities=capabilities_ctx,
            channel=event.channel,
        )

        history = session.get_history(self._config.session.max_history_messages)
        if self._compressor.should_compress(history):
            self._compressor._session_key = context_key
            history_copy = copy.deepcopy(history)
            result = await self._compressor.compress(history_copy, focus_topic=event.text)
            history = result.messages
            if result.was_compressed:
                logger.info(
                    "Context compressed: {} → {} tokens",
                    result.tokens_before,
                    result.tokens_after,
                )
                session.messages = session.messages[:session.last_consolidated] + result.messages
                await self._sessions.save(session)

        # Resolve an explicit reply quote before retrieval as well as inference:
        # "apply this" is otherwise as content-free to BM25/vector search as an
        # unquoted "above", even though the channel supplied the exact referent.
        user_message = build_user_message_with_reply(event)
        retrieval_query = contextual_retrieval_query(user_message, history)

        media_items = event.media_items
        resolved_media = (
            await self._context_builder.resolve_inbound_media(media_items, event.channel)
            if media_items
            else None
        )

        media_refs = self._build_media_refs(resolved_media) if resolved_media else None
        # 引用回复：把被引用消息原文作为前缀注入写入历史的文本，供模型消歧。
        # 只影响历史副本，event.text 保持原样（上游检索/压缩仍用原始问题）。
        if media_refs:
            session.add_message("user", user_message, media_refs=media_refs)
        else:
            session.add_message("user", user_message)

        retrieval_parts: list[str] = []
        from codex_pro.memory.prefetch import is_fresh

        # A single per-session prefetched entry warms main memory + episodic +
        # knowledge together (Task 13). Fetch it once here so all three segments
        # below share one freshness decision. Knowledge lives outside the
        # memory.enabled block, so the lookup must sit above it.
        cached = (
            self._retrieval_cache_get(context_key)
            if self._retrieval_cache_get is not None
            else None
        )
        cur_ver = self._scope_version_fn(event.memory_scope) if self._scope_version_fn else 0
        cache_fresh = (
            cached is not None
            and getattr(cached, "scope", "") == event.memory_scope
            and getattr(cached, "scope_version", 0) == cur_ver
            and is_fresh(
                cached, retrieval_query, now=time.time(),
                ttl=self._cache_ttl, jaccard_min=self._cache_jaccard_min,
            )
        )
        if self._config.memory.enabled and not ephemeral:
            # Prefer a fresh prefetched result (zero inline latency). On a miss,
            # `retrieval_on_miss` decides: "sync" pays full retrieval latency
            # this turn (accuracy-first daemon/gateway); "degrade" runs a
            # BOUNDED sync retrieval — a short time budget, falling back to
            # local keyword search on timeout. First turns and topic switches
            # are exactly when retrieval matters most; skipping entirely (the
            # old degrade) made memory silently unavailable on those turns.
            scored = None
            if cache_fresh:
                scored = cached.scored
            elif self._retrieval_on_miss == "sync":
                if self._hybrid_retriever:
                    # Episode candidates are assembled inside retrieve() by
                    # relevance (semantic + LIKE), same as the prefetch path —
                    # no separate "recent N" fetch here, which would otherwise
                    # miss high-relevance episodes outside the recency window.
                    scored = await self._hybrid_retriever.retrieve(
                        retrieval_query, limit=8,
                        memory_scope=event.memory_scope,
                        episode_session_key=context_key,
                    )
                else:
                    scored = self._memory.search_scored(
                        retrieval_query, limit=5, session_key=event.memory_scope,
                        audience=Audience.RETRIEVAL,
                    )
            else:
                scored = await self._bounded_retrieve(
                    event, context_key, retrieval_query,
                )
            if scored:
                scored = filter_recall_by_snapshot(scored, snapshot_ids)
            if scored:
                from codex_pro.memory.types import Episode as _Ep
                mem_items = [(r, s) for r, s in scored if not isinstance(r, _Ep)]
                ep_items = [(r, s) for r, s in scored if isinstance(r, _Ep)]
                if mem_items:
                    retrieval_parts.append(
                        "Relevant memory:\n"
                        + "\n".join(f"- {r.key}: {r.content}" for r, _ in mem_items)
                    )
                    try:
                        self._memory.reinforce([r.id for r, _ in mem_items])
                    except Exception as e:
                        logger.debug("Memory reinforcement failed: {}", e)
                if ep_items:
                    retrieval_parts.append(
                        "Past episodes:\n"
                        + "\n".join(f"- {r.summary}" for r, _ in ep_items if r.summary)
                    )
                # Cognitive埋点: surface the actual recalled memories (content/
                # source-grade/score) to the CLI TUI. Pass mem_items (memory
                # entries only), NOT `scored` which mixes in episodes. The
                # emitter internally gates to channel=="gateway:cli".
                if mem_items and self._cog is not None:
                    await self._emit_memory_recalled(event, mem_items)

        if self._knowledge:
            # Knowledge is ACL-filtered per user (KnowledgeIndex.search filters
            # by allowed_users). A cached knowledge_context is only trustworthy
            # when it was prefetched for THIS turn's user: under a shared group
            # session_key the cache entry is reachable by every sender, so
            # serving user A's ACL-filtered knowledge to user B would leak
            # restricted docs. So the cache hit requires knowledge_user_id to
            # match the current sender.
            knowledge_context = None
            cached_user_ok = (
                cache_fresh
                and cached.knowledge_context is not None
                and bool(event.sender_id)
                and cached.knowledge_user_id == event.sender_id
            )
            if cached_user_ok:
                knowledge_context = cached.knowledge_context
            else:
                # Miss (no/stale cache, or knowledge was prefetched for another
                # user). The scan is CPU-bound, so any inline fetch runs in an
                # executor thread and never blocks the event loop. When a
                # prefetcher is warming knowledge (hybrid retriever present),
                # honor retrieval_on_miss: "sync" fetches inline now, "degrade"
                # skips and lets the next prefetch warm it. When there is NO
                # prefetcher (memory disabled -> no hybrid retriever), nothing
                # will ever warm the cache, so a degrade-skip would silently
                # drop knowledge every turn — fall back to inline so knowledge
                # keeps working independently of memory.enabled (its pre-Task-13
                # behavior).
                #
                # Senderless entrypoints (sender_id == "") can never satisfy the
                # cache-hit guard above (it requires a non-empty sender to avoid
                # leaking one user's ACL-filtered knowledge to another under a
                # shared session_key). For them the prefetch is unusable, so a
                # degrade-skip would drop knowledge on every turn. Treat the
                # prefetch as inactive when there is no sender and fall back to
                # inline: the inline fetch passes the empty user_id, which the
                # index resolves to public (unrestricted) docs only — no leak.
                knowledge_prefetch_active = (
                    self._hybrid_retriever is not None and bool(event.sender_id)
                )
                if self._retrieval_on_miss == "sync" or not knowledge_prefetch_active:
                    try:
                        _, knowledge_context = (
                            await self._fetch_knowledge(
                                retrieval_query, event.sender_id, channel=event.channel,
                            )
                        )
                    except Exception as e:
                        logger.debug("Knowledge retrieval failed: {}", e)
            if knowledge_context:
                retrieval_parts.append(knowledge_context)

        task_type = self._infer_task_type(event.text)

        retrieval = "\n\n".join(retrieval_parts)

        session_cfg = self._config.session
        messages = self._context_builder.build_messages(
            history=history,
            # 引用回复:本轮 prompt 也用带引用前缀的 user_message,让模型当轮就看到
            # 被引用原文(消歧);event.text 保持原样,上游检索/压缩仍用原始问题。
            current_message=user_message,
            media=resolved_media,
            channel=event.channel,
            chat_id=event.chat_id,
            system_prompt=system_prompt,
            retrieval_context=retrieval,
            history_image_ttl_minutes=session_cfg.history_image_ttl_minutes,
            history_image_limit=session_cfg.history_image_limit,
            history_image_skip_if_current=session_cfg.history_image_skip_if_current,
        )

        available_names = {
            item.get("function", {}).get("name") for item in tool_defs if isinstance(item, dict)
        }
        artifact = apply_artifact_injection(
            event=event,
            session=session,
            context_key=context_key,
            messages=messages,
            available_names=available_names,
        )
        artifact_required = artifact.artifact_required
        artifact_intent_id = artifact.artifact_intent_id
        apply_output_continuation(
            event=event,
            session=session,
            messages=messages,
            artifact_required=artifact_required,
        )

        # tool_defs already computed above for capability derivation.
        plan = await apply_plan_injection(
            event=event,
            context_key=context_key,
            trace_id=trace_id,
            messages=messages,
            history=history,
            retrieval=retrieval,
            user_message=user_message,
            tool_defs=tool_defs,
            planner=self._planner,
            plan_run_store=self._plan_run_store,
        )
        execution_plan = plan.execution_plan
        plan_run_id = plan.plan_run_id

        return PipelineContext(
            event=event,
            session=session,
            trace_id=trace_id,
            publish_response=publish_response,
            context_key=context_key,
            system_prompt=system_prompt,
            messages=messages,
            tool_defs=tool_defs,
            retrieval=retrieval,
            task_type=task_type,
            artifact_required=artifact_required,
            artifact_intent_id=artifact_intent_id,
            execution_plan=execution_plan,
            plan_run_id=plan_run_id,
            intro_text=intro_text,
            stream_publisher=stream_publisher,
        )

    @staticmethod
    def _build_media_refs(resolved_media: list[dict[str, str]]) -> list[dict[str, Any]]:
        """Extract lightweight image references from resolved media for session storage."""
        import time

        from codex_pro.session.media_ref import MediaRef

        refs: list[dict[str, Any]] = []
        now = time.time()
        for item in resolved_media:
            if item.get("type") != "image":
                continue
            url = item.get("url", "")
            if not url:
                continue
            is_local = not url.startswith(("http://", "https://", "data:"))
            refs.append(MediaRef(
                cache_path=url if is_local else "",
                original_url=item.get("original_url", "") or (url if not is_local else ""),
                mime_type=item.get("mime_type", ""),
                timestamp=now,
                aes_key=item.get("aes_key", ""),
            ).to_dict())
        return refs

    def _infer_task_type(self, text: str) -> str:
        lower = text.lower()
        for task_type, markers in self._TASK_MARKERS.items():
            if any(marker in lower for marker in markers):
                return task_type
        return "chat"

    @staticmethod
    def _expects_artifact(text: str) -> bool:
        """Compatibility wrapper — detection lives in artifact_intent."""
        return expects_artifact(text)
