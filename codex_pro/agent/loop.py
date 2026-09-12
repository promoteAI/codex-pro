"""Agent loop — the core processing engine.

Receives events → builds context → calls LLM → executes tools → sends responses.
Orchestrates pipeline stages: context building, inference, and response finalization.
"""

from __future__ import annotations

import asyncio
from collections import OrderedDict
from pathlib import Path
from typing import Any

from loguru import logger

from codex_pro.agent.approval_gate import ApprovalGate
from codex_pro.agent.consolidation import ConsolidationWorker
from codex_pro.agent.context import ContextBuilder
from codex_pro.permissions.allowlist import ApprovalAllowlist
from codex_pro.agent.compression import ConversationCompressor
from codex_pro.agent.pipeline.context_stage import ContextStage
from codex_pro.agent.pipeline.inference_stage import InferenceStage
from codex_pro.agent.pipeline.response_stage import ResponseStage
from codex_pro.agent.tools.circuit_breaker import ToolCircuitBreaker
from codex_pro.agent.tools.registry import ToolRegistry
from codex_pro.bus.events import (
    InboundEvent,
)
from codex_pro.bus.queue import MessageBus
from codex_pro.config.schema import Config
from codex_pro.cost.budget import CostTracker
from codex_pro.memory.consolidator import MemoryConsolidator
from codex_pro.memory.service import MemoryService
from codex_pro.memory.store import MemoryStore
from codex_pro.models.inference import InferenceController
from codex_pro.models.provider import LLMProvider
from codex_pro.models.model_windows import compression_window, resolve_context_window
from codex_pro.models.router import ModelRouter
from codex_pro.observability.monitor import TraceLogger
from codex_pro.permissions.manager import ApprovalManager, CredentialManager
from codex_pro.session.manager import Session, SessionManager
from codex_pro.skills.store import SkillStore
from codex_pro.agent.streaming import (
    ProcessResult as _ProcessResult,
)
from codex_pro.agent.commands.approval import ApprovalCommands
from codex_pro.agent.commands.clarify import ClarifyCommands
from codex_pro.agent.commands.interrupt import InterruptCommands
from codex_pro.agent.commands.stream_params import StreamParams
from codex_pro.agent.embedding_bootstrap import EmbeddingBootstrap
from codex_pro.agent.lifecycle import AgentLifecycle
from codex_pro.agent.inbound import InboundHandler
from codex_pro.agent.memory_cache import MemoryCache
from codex_pro.agent.bootstrap import LoopBootstrap



from codex_pro.agent.embedding_helpers import (
    _ProviderEmbedFn,
    _embed_model_identity,
    _resolve_builtin_skills_dir,
    _should_publish_reply,
    pick_embed_candidate,
    probe_embed_provider,
    resolve_embed_fallback,
)



class AgentLoop:
    """Core processing engine that ties all subsystems together."""

    _MAX_TOOL_RESULT_CHARS = 16000

    def __init__(
        self,
        bus: MessageBus,
        config: Config,
        provider: LLMProvider,
        workspace: Path,
        router: ModelRouter | None = None,
        scheduler: Any = None,
        storage: Any = None,
        task_manager: Any = None,
        workflow_engine: Any = None,
    ):
        self.bus = bus
        from codex_pro.agent.cognitive_emitter import CognitiveEmitter

        self.cognitive_emitter = CognitiveEmitter(bus)
        self.config = config
        self.provider = provider
        self.router = router
        self.workspace = workspace
        # 阶段 B(start 内 _resolve_embed_and_index)需要 storage 才能定案 backend
        # 并构造 VectorIndex/依赖它的消费者,故在此固化引用。
        self._storage = storage
        self._turn_runs = None
        if storage is not None:
            from codex_pro.agent.turn_run_store import TurnRunStore

            self._turn_runs = TurnRunStore(storage)
            set_turn_run_store = getattr(self.bus, "set_turn_run_store", None)
            if callable(set_turn_run_store):
                set_turn_run_store(self._turn_runs)
        try:
            provider_default_model = provider.get_default_model()
        except Exception as e:
            logger.debug("Failed to get default model from provider: {}", e)
            provider_default_model = ""
        self._default_model = config.models.default_model or provider_default_model or ""

        self.sessions = SessionManager(
            sessions_dir=workspace / config.storage.sessions_dir,
            expiry_hours=config.session.expiry_hours,
            storage=storage,
        )
        self.memory = MemoryStore(
            memory_dir=workspace / config.storage.memory_dir,
            max_user=config.memory.max_user_memories,
            max_env=config.memory.max_env_memories,
            decay_half_life_days=config.memory.importance_decay_days,
            storage=storage,
            scope_policy=config.memory.scope_policy,
            contradiction_scan_on_store=config.memory.contradiction_scan_on_store,
            archival_threshold=config.memory.archival_threshold,
            forget_threshold=config.memory.forget_threshold,
            lineage_max_versions=config.memory.lineage_max_versions,
            lineage_retention_days=config.memory.lineage_retention_days,
            # R1 Task8:唯一写口。所有写者经 self._memory_service 单例(下方构造)
            # 走八步写序,故 store 置 service_only,外部绕过 service 直写即软告警。
            service_only=config.memory.enabled,
            snapshot_layering=config.memory.snapshot_layering,
            snapshot_user_core_max=config.memory.snapshot_user_core_max,
            snapshot_env_core_max=config.memory.snapshot_env_core_max,
        )
        # R1 Task8:统一装配的 MemoryService 单例——所有写者(工具/reviewer/REST/
        # promotion/reflection/detector/归档)共享此实例,失效/flush/审计集中一处,
        # 审计统一落 logs_dir/memory_audit.jsonl(复用 tool_audit.jsonl 同目录)。
        # 收口前各入口就近 new 独立 service,失效/审计各自为政;此处收敛为单例。
        self._memory_service = MemoryService(
            self.memory,
            invalidate_fn=self._invalidate_memory_caches,
            flush_fn=self.memory.flush_pending_embeds,
            audit_path=workspace / config.storage.logs_dir / "memory_audit.jsonl",
            allow_env_writes=config.memory.allow_model_environment_writes,
        )
        from codex_pro.spill.policy import SpillPolicy
        from codex_pro.spill.store import SpillStore

        self._spill_store = SpillStore(workspace / config.storage.spill_dir)
        # 清扫循环的句柄,由 start() 建、aclose() 收。见 _start_spill_sweeper。
        self._spill_sweep_task: asyncio.Task | None = None
        self._artifact_sweep_task: asyncio.Task | None = None
        self.tools = ToolRegistry(
            audit_log_path=workspace / config.storage.logs_dir / "tool_audit.jsonl",
            config=config,
            spill_policy=SpillPolicy(
                self._spill_store,
                max_inline_chars=config.spill.max_inline_chars,
                enabled=config.spill.enabled,
            ),
        )
        from codex_pro.gateway.media import MediaCache

        media_cache = MediaCache(
            cache_dir=workspace / config.gateway.media_cache_dir,
            max_size_mb=config.gateway.media_cache_max_mb,
            max_file_mb=config.gateway.media_max_file_mb,
            concurrency=config.gateway.media_download_concurrency,
            allow_private=config.gateway.media_allow_private_addresses,
        )
        from codex_pro.agent.media.understanding import default_understanders

        understanders = default_understanders(
            config.media_understanding,
            transcription_api_key=config.channels.transcription_api_key,
            vision_provider=provider,
        )
        self.context = ContextBuilder(
            workspace,
            media_cache=media_cache,
            doc_enabled=config.tools.inbound_document_enabled,
            doc_max_chars=config.tools.inbound_document_max_chars,
            understanders=understanders,
        )
        # Resolve the default model's real window up front so the gauge and
        # compression threshold start correct, before any LLM round runs. The
        # inference stage re-syncs this per round to the model that answers.
        self._initial_context_window = resolve_context_window(
            self._default_model,
            captured_windows=config.models.model_windows,
            config_default=config.session.context_window_tokens,
        )
        _comp_window = compression_window(
            self._initial_context_window,
            config.session.compression_window_cap,
        )
        self.compressor = ConversationCompressor(
            config=config.compression,
            context_window_tokens=_comp_window,
            provider=provider,
            default_model=self._default_model,
            storage=storage,
            router=router,
        )
        # Display gauge should show the real window; only the compression budget
        # is capped. context_window_tokens holds the real value for display.
        self.compressor.context_window_tokens = self._initial_context_window
        try:
            from codex_pro.models.tokenizer import TokenCounter

            provider_name = getattr(config.models, "default_provider", "") or ""
            if not provider_name and config.models.providers:
                provider_name = config.models.providers[0].name
            if self._default_model:
                tc = TokenCounter.for_model(provider_name, self._default_model)
                if hasattr(self.compressor, "set_token_counter"):
                    self.compressor.set_token_counter(tc)
        except Exception as e:
            logger.debug("Tokenizer initialization skipped: {}", e)
        self.approval = ApprovalManager(
            require_approval=config.permissions.approval.require_approval,
            auto_approve=config.permissions.approval.auto_approve,
            auto_deny=config.permissions.approval.auto_deny,
            default_policy=config.permissions.approval.default_policy,
            store_path=workspace / "data" / "approvals.json",
        )
        from codex_pro.agent.clarify_manager import ClarifyManager

        self.clarify = ClarifyManager()
        from codex_pro.agent.interrupt_manager import InterruptManager

        self.interrupt = InterruptManager()
        self.inference = InferenceController()
        if config.permissions.approval.require_approval:
            from codex_pro.models.inference import InferenceConstraints

            self.inference.set_constraints(
                InferenceConstraints(
                    require_confirmation_for=list(config.permissions.approval.require_approval),
                    blocked_tools=list(config.permissions.approval.auto_deny),
                )
            )
        self.approval_gate = ApprovalGate(
            config=config,
            approval=self.approval,
            inference=self.inference,
            bus=bus,
            provider=provider,
            registry=self.tools,
            router=router,
            cognitive_emitter=self.cognitive_emitter,
            turn_run_store=self._turn_runs,
            allowlist=ApprovalAllowlist(
                store_path=self.workspace / "data" / "approval_allowlist.json",
            ),
        )
        self.credentials = CredentialManager(
            store_path=workspace / "data" / "credentials.json",
            encryption_key_env=config.credentials.encryption_key_env,
            require_encryption=config.credentials.require_encryption,
            key_path=workspace / ".credential_key",
        )
        self.tracer = TraceLogger(
            logs_dir=workspace / config.storage.logs_dir,
            enabled=config.observability.trace_enabled,
            max_trace_files=config.observability.max_trace_files,
        )
        self.consolidator = MemoryConsolidator(
            memory_store=self.memory,
            llm_call=self.provider.chat_with_retry,
            context_window_tokens=self._initial_context_window,
            consolidation_threshold=config.memory.consolidation_threshold,
        )

        self._working_memories: OrderedDict[str, Any] = OrderedDict()
        self._hybrid_retriever = None
        self._vector_index = None
        self._embed_fn = None
        self._local_embedder = None
        self._reranker = None
        self._embed_model_id = ""
        self._episodic = None
        # 两阶段接线的默认值：memory 关闭时 _init_advanced_memory 不跑，
        # 但 start() 仍会调 _resolve_embed_and_index，这些属性须先就位。
        self._embed_backend = config.memory.embedding_backend
        self._embed_candidate: tuple[Any | None, str | None] = (None, None)
        self._contradiction_detector = None
        if config.memory.enabled:
            self._init_advanced_memory(config, storage)

        self.planner = None
        self._plan_run_store = None
        if config.planning.enabled:
            from codex_pro.agent.planning import AgentPlanner

            self.planner = AgentPlanner(
                llm_call=self.provider.chat_with_retry,
                default_strategy=config.planning.default_strategy,
                max_tree_depth=config.planning.max_tree_depth,
                reflection_enabled=config.planning.reflection_enabled,
                max_branches=config.planning.max_branches,
            )
            if storage is not None:
                from codex_pro.agent.planning.plan_run_store import PlanRunStore

                self._plan_run_store = PlanRunStore(storage)

        self._telemetry = None
        if config.observability.otel_enabled:
            from codex_pro.observability.telemetry import TelemetryManager

            self._telemetry = TelemetryManager(
                service_name=config.observability.otel_service_name,
                otel_endpoint=config.observability.otel_endpoint,
                export_interval_ms=config.observability.otel_export_interval_ms,
            )
            self._telemetry.setup()
            if self._telemetry.available:
                self.tracer.set_otel_tracer(self._telemetry.get_tracer())
        self.mcp_manager: Any = None
        self.knowledge: Any = None
        self.evolution: Any = None
        if config.knowledge.enabled:
            from codex_pro.knowledge import KnowledgeIndex

            self.knowledge = KnowledgeIndex(
                workspace=workspace,
                docs_dir=config.knowledge.docs_dir,
                index_path=config.knowledge.index_path,
                chunk_size=config.knowledge.chunk_size,
                chunk_overlap=config.knowledge.chunk_overlap,
                allowed_extensions=config.knowledge.allowed_extensions,
            )
            self.knowledge.ensure_ready(auto_index=config.knowledge.auto_index)

        # skills.enabled gates the whole subsystem. It was schema-only before:
        # setting it false left every skill tool registered and the skill list
        # still injected into the system prompt, so the switch did nothing.
        # skill_store=None is the established "off" signal — build_tools() skips
        # registering the five skill tools and build_skills_context() returns "".
        self.skill_store = None
        if config.skills.enabled:
            skills_dir = _resolve_builtin_skills_dir(workspace, config.skills.skills_dir)
            self.skill_store = SkillStore(
                user_dir=workspace / "data" / "skills",
                builtin_dir=skills_dir,
                external_dirs=[Path(d) for d in config.skills.external_dirs],
                disabled=config.skills.disabled,
            )
        else:
            logger.info("Skills system disabled (skills.enabled=false)")

        self._running = False
        self._max_iterations = config.agent.max_iterations
        self._nudge_interval = config.skills.creation_nudge_interval
        self._memory_nudge_interval = config.memory.memory_nudge_interval
        self._tool_iters_since_skill_check = 0
        self._tool_iters_since_memory_check = 0
        self._snapshot_enabled = config.memory.snapshot_enabled
        self._memory_snapshots: OrderedDict[str, str] = OrderedDict()
        self._memory_snapshot_ids: "OrderedDict[str, frozenset[str]]" = OrderedDict()
        self._memory_snapshot_meta: dict[str, tuple[str, int]] = {}
        self._scope_versions: dict[str, int] = {}
        self._retrieval_cache: OrderedDict[str, Any] = OrderedDict()
        self._max_cached_sessions = 200
        from codex_pro.agent.background import BackgroundScheduler

        self._bg_scheduler = BackgroundScheduler(config.execution.max_background_tasks)
        self._state_lock = asyncio.Lock()
        self._plugin_manager: Any = None
        # Kept so a finished CRON turn can write its real outcome back to the job
        # (see _on_inbound); the scheduler otherwise only ever sees "queued".
        self._scheduler = scheduler
        # Retained for the dashboard task API (gateway/api/tasks.py); previously
        # only forwarded into tool discovery and never held on the instance.
        self._task_manager = task_manager
        # Retained so the REST transition endpoint can advance workflows after
        # a terminal task transition — the same closing-the-loop hook TaskTool got.
        self._workflow_engine = workflow_engine
        self._register_tools(scheduler=scheduler, task_manager=task_manager, workflow_engine=workflow_engine)
        self._setup_delegation()

        # Pipeline stages
        self._circuit_breaker = ToolCircuitBreaker(
            failure_threshold=config.circuit_breaker.failure_threshold,
            recovery_seconds=config.circuit_breaker.recovery_seconds,
            half_open_max=config.circuit_breaker.half_open_max,
        )
        self._consolidation_worker = ConsolidationWorker(
            sessions=self.sessions,
            consolidator=self.consolidator,
            sleep_consolidation=config.memory.sleep_consolidation,
        )
        self._context_stage = ContextStage(
            config=config,
            sessions=self.sessions,
            memory=self.memory,
            compressor=self.compressor,
            context_builder=self.context,
            skill_store=self.skill_store,
            knowledge=self.knowledge,
            hybrid_retriever=getattr(self, "_hybrid_retriever", None),
            planner=self.planner,
            inference=self.inference,
            working_memories=self._working_memories,
            memory_snapshots=self._memory_snapshots,
            memory_snapshot_ids=self._memory_snapshot_ids,
            put_snapshot=self.put_memory_snapshot,
            memory_snapshot_meta=self._memory_snapshot_meta,
            scope_version_fn=self._scope_version,
            snapshot_enabled=self._snapshot_enabled,
            memory_enabled=config.memory.enabled,
            tool_definitions_fn=self.tools.get_definitions,
            episodic=self._episodic,
            narrative_episode_count=config.memory.narrative_episode_count,
            plan_run_store=self._plan_run_store,
            retrieval_cache_get=self._get_retrieval_cache,
            retrieval_on_miss=config.memory.retrieval_on_miss,
            retrieval_miss_timeout=config.memory.retrieval_miss_timeout_seconds,
            cache_ttl=config.memory.cache_ttl_seconds,
            cache_jaccard_min=config.memory.cache_jaccard_min,
            cognitive_emitter=self.cognitive_emitter,
        )
        self._cost_tracker = CostTracker(
            storage=storage,
            enabled=config.cost.enabled,
            daily_budget_usd=config.cost.daily_budget_usd,
            soft_ratio=config.cost.soft_threshold_ratio,
            pricing_overrides=config.cost.pricing_overrides,
        )
        self.tools.set_skill_usage_recorder(self._cost_tracker.record_skill)
        self._inference_stage = InferenceStage(
            config=config,
            bus=bus,
            provider=provider,
            router=self.router,
            tools=self.tools,
            approval_gate=self.approval_gate,
            credentials=self.credentials,
            tracer=self.tracer,
            telemetry=self._telemetry,
            inference=self.inference,
            circuit_breaker=self._circuit_breaker,
            default_model=self._default_model,
            max_iterations=self._max_iterations,
            planner=self.planner,
            plan_run_store=self._plan_run_store,
            cost_tracker=self._cost_tracker,
            cognitive_emitter=self.cognitive_emitter,
            compressor=self.compressor,
            memory_store=self.memory,
            clarify_manager=self.clarify,
            interrupt_manager=self.interrupt,
            turn_run_store=self._turn_runs,
        )
        # Retrieval prefetcher: after each reply ResponseStage fires this on the
        # DISCARDABLE tier to warm the next turn's cache. Needs _hybrid_retriever
        # (set by _init_advanced_memory above) and _put_retrieval_cache, both
        # already initialized at this point.
        from codex_pro.memory.prefetch import RetrievalPrefetcher

        async def _knowledge_fetch(query: str, user_id: str, channel: str = "") -> str:
            # search_async, NOT the sync search(): the sync path is keyword-only,
            # so prefetching with it wrote a keyword-grade context into the cache
            # that the reply path then served on every cache hit — silently
            # dropping knowledge vector recall for those turns.
            results = await self.knowledge.search_async(
                query, limit=config.knowledge.max_results, user_id=user_id, channel=channel
            )
            return self.knowledge.format_results(results)

        self._prefetcher = (
            RetrievalPrefetcher(
                # limit=8 matches the inline sync path (5 memory + 3 episode)
                # now that episodes ride the same retrieve() call.
                self._hybrid_retriever,
                self._put_retrieval_cache,
                limit=8,
                knowledge_fetch=_knowledge_fetch if self.knowledge else None,
            )
            if self._hybrid_retriever
            else None
        )
        # Skill admission gate — always-on, independent of evolution.enabled.
        # Uses its own TrajectoryStore over the shared storage backend so skill
        # distillation governance works even when the evolution engine is off.
        # Schema init is deferred to start() (init_schema is async; doing it as a
        # fire-and-forget in __init__ would race the first skill review).
        self._skill_admission = None
        self._skill_candidate_store = None
        # SkillAdmission writes through skill_store unconditionally, so it can
        # only exist when the skills system is on.
        if storage is not None and self.skill_store is not None:
            from codex_pro.evolution.store import TrajectoryStore
            from codex_pro.skills.admission import SkillAdmission

            self._skill_candidate_store = TrajectoryStore(storage)
            self._skill_admission = SkillAdmission(
                skill_store=self.skill_store,
                candidate_store=self._skill_candidate_store,
                policy=config.skills.admission_policy,
                auto_write_risk=config.skills.auto_write_risk,
            )
        self._response_stage = ResponseStage(
            config=config,
            sessions=self.sessions,
            memory=self.memory,
            provider=provider,
            consolidation_worker=self._consolidation_worker,
            default_model=self._default_model,
            spawn_fn=self._spawn_background,
            clear_memory_snapshot_fn=self._clear_memory_snapshot,
            skill_store=self.skill_store,
            skill_admission=self._skill_admission,
            working_memories=self._working_memories,
            prefetcher=self._prefetcher,
            scope_version_fn=self._scope_version,
            invalidate_memory_caches_fn=self._invalidate_memory_caches,
            memory_enabled=config.memory.enabled,
            # R1 Task8:Reviewer 经 ResponseStage 后台 review 注入 loop 单例 service。
            memory_service=self._memory_service,
        )

    def _register_tools(self, scheduler: Any = None, task_manager: Any = None, workflow_engine: Any = None) -> None:
        LoopBootstrap.register_tools(self, scheduler, task_manager, workflow_engine)

    def _init_advanced_memory(self, config: Config, storage: Any) -> None:
        LoopBootstrap.init_advanced_memory(self, config, storage)

    def _setup_delegation(self) -> None:
        LoopBootstrap.setup_delegation(self)

    def set_plugin_manager(self, manager: Any) -> None:
        """Attach the plugin manager after bootstrap. Passes hook_registry to InferenceStage."""
        self._plugin_manager = manager
        self._inference_stage.set_hook_registry(manager.hooks)

    def set_evolution_engine(self, engine: Any) -> None:
        """Attach the evolution engine after bootstrap. Registers its tools and shares hooks."""
        self.evolution = engine
        if engine is None:
            return
        # Register agent-facing evolution tools so the LLM can introspect / trigger.
        try:
            from codex_pro.evolution.tools import build_evolution_tools

            for tool in build_evolution_tools(engine):
                self.tools.register(tool)
        except Exception as e:
            logger.warning("Failed to register evolution tools: {}", e)

    @property
    def is_running(self) -> bool:
        return self._running

    # ── Public accessors for the dashboard/gateway API ───────────────────────
    # These back the read paths in gateway/api/{analytics,cron_api,tasks,logs}.
    # The underlying state is held privately; exposing it via properties keeps a
    # stable public contract without leaking mutation access to internals.

    @property
    def cost_tracker(self) -> Any:
        """CostTracker backing the analytics API (daily/skill/channel usage)."""
        return self._cost_tracker

    @property
    def scheduler(self) -> Any:
        """Cron scheduler backing the cron API; None when scheduling is off."""
        return self._scheduler

    @property
    def task_manager(self) -> Any:
        """TaskManager backing the tasks API; None when no manager was wired."""
        return self._task_manager

    @property
    def workflow_engine(self) -> Any:
        """WorkflowEngine for DAG advance on task completion; None when unwired."""
        return self._workflow_engine

    @property
    def turn_runs(self) -> Any:
        """Durable per-event lifecycle ledger; None without persistent storage."""
        return self._turn_runs

    def unblock_session_for_reset(self, session_key: str) -> None:
        """Release human-input waits before an explicit reset takes the lock.

        Clarification and approval tools intentionally wait while holding the
        per-session turn lock. A manual reset that waited for that same lock
        before cancelling them could deadlock until their long timeout. This
        narrow pre-reset hook only wakes those waits; cache/history mutation
        still happens later under the lock.
        """
        self.clarify.cancel_session(session_key)
        self.approval.cancel_session(session_key, reason="session reset")

    async def _mark_turn_running(
        self,
        event_id: str,
        session_key: str,
        *,
        context_key: str,
        trace_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> bool:
        return await InboundHandler._mark_turn_running(
            self, event_id, session_key,
            context_key=context_key, trace_id=trace_id, metadata=metadata,
        )

    async def _mark_turn_terminal(
        self,
        event_id: str,
        status: str,
        *,
        response_text: str = "",
        error: str = "",
    ) -> None:
        await InboundHandler._mark_turn_terminal(
            self, event_id, status, response_text=response_text, error=error
        )

    async def _on_inbound_rejected(self, event: InboundEvent, reason: str) -> None:
        await InboundHandler._on_inbound_rejected(self, event, reason)

    async def reset_session_state(self, session_key: str) -> None:
        await InboundHandler.reset_session_state(self, session_key)

    @property
    def log_buffer(self) -> Any:
        """Recent structured log records backing the logs API.

        Sourced from the process-global buffer, so it reflects all logging
        regardless of which subsystem emitted it.
        """
        from codex_pro.observability.log_buffer import get_log_buffer

        return get_log_buffer()

    def _resolved_vector_dimensions(self) -> int:
        return EmbeddingBootstrap._resolved_vector_dimensions(self)

    async def _resolve_embed_and_index(self, storage: Any) -> None:
        await EmbeddingBootstrap._resolve_embed_and_index(self, storage)

    def _wire_vector_consumers(self, vector_index: Any, embed_fn: Any) -> None:
        EmbeddingBootstrap._wire_vector_consumers(self, vector_index, embed_fn)

    async def _warmup_embedding(self) -> None:
        await EmbeddingBootstrap._warmup_embedding(self)

    async def _warmup_reranker(self) -> None:
        await EmbeddingBootstrap._warmup_reranker(self)

    async def start(self) -> None:
        await AgentLifecycle.start(self)

    async def stop(self) -> None:
        await AgentLifecycle.stop(self)

    def _spawn_background(self, coro: Any, *, tier: Any = None) -> None:
        AgentLifecycle._spawn_background(self, coro, tier=tier)

    def _start_spill_sweeper(self) -> None:
        AgentLifecycle._start_spill_sweeper(self)

    def _start_artifact_sweeper(self) -> None:
        AgentLifecycle._start_artifact_sweeper(self)

    async def _lru_put(self, cache: OrderedDict, key: str, value: Any) -> None:  # type: ignore[type-arg]
        await MemoryCache.lru_put(self, cache, key, value)

    async def put_memory_snapshot(
        self,
        key: str,
        value: str,
        ids: "frozenset[str] | None" = None,
        scope: str = "",
        version: int = 0,
    ) -> None:
        await MemoryCache.put_memory_snapshot(self, key, value, ids, scope, version)

    def _scope_version(self, scope: str) -> int:
        return MemoryCache.scope_version(self, scope)

    async def _clear_memory_snapshot(self, session_key: str) -> None:
        await MemoryCache.clear_memory_snapshot(self, session_key)

    async def _invalidate_memory_caches(self, scope: str, global_scope: bool = False) -> None:
        await MemoryCache.invalidate_memory_caches(self, scope, global_scope)

    async def _put_retrieval_cache(self, session_key: str, entry: Any) -> None:
        await MemoryCache.put_retrieval_cache(self, session_key, entry)

    def _get_retrieval_cache(self, session_key: str) -> Any:
        return MemoryCache.get_retrieval_cache(self, session_key)

    async def _start_mcp_background(self) -> None:
        await AgentLifecycle._start_mcp_background(self)

    async def _start_mcp(self) -> None:
        await AgentLifecycle._start_mcp(self)

    def _apply_runtime_tool_policy(self) -> None:
        AgentLifecycle._apply_runtime_tool_policy(self)

    def _filter_mcp_servers(self, servers: dict[str, Any]) -> dict[str, Any]:
        return AgentLifecycle._filter_mcp_servers(self, servers)

    async def _record_cron_outcome(self, event: InboundEvent, status: str, error: str = "") -> None:
        await InboundHandler._record_cron_outcome(self, event, status, error)

    async def _record_task_outcome(self, event: InboundEvent, status: str, error: str = "") -> None:
        await InboundHandler._record_task_outcome(self, event, status, error)

    async def _on_inbound(self, event: InboundEvent) -> None:
        await InboundHandler._on_inbound(self, event)

    async def _process_event(
        self, event: InboundEvent, trace_id: str, *, publish_response: bool = False, activity: Any = None
    ) -> _ProcessResult:
        return await InboundHandler._process_event(
            self, event, trace_id, publish_response=publish_response, activity=activity,
        )

    # ── Command handler wrappers for test compatibility ─────────────────────
    # The actual logic has been extracted to codex_pro.agent.commands.* modules.
    # These wrappers preserve the public API for existing tests.

    # Keep these as class attributes for test compatibility
    _CLARIFY_CANCEL_CMD = "/__clarify_cancel__"
    _INTERRUPT_CMD = "/__interrupt__"

    async def _handle_approval_command(self, event: InboundEvent) -> str | None:
        return await ApprovalCommands.handle_approval_command(self, event)

    def _is_approval_command(self, text: str) -> bool:
        return ApprovalCommands.is_approval_command(self, text)

    def _can_decide_approval(self, user_id: str, request: Any) -> bool:
        return ApprovalCommands.can_decide_approval(self, user_id, request)

    def _describe_inactive_approval(self, request_id: str) -> str:
        return ApprovalCommands.describe_inactive_approval(self, request_id)

    def _is_clarify_command(self, text: str) -> bool:
        return ClarifyCommands.is_clarify_command(text)

    def _is_clarify_cancel_command(self, text: str) -> bool:
        return ClarifyCommands.is_clarify_cancel_command(text)

    async def _handle_clarify_cancel(self, event: InboundEvent) -> None:
        await ClarifyCommands.handle_clarify_cancel(self, event)

    def _is_interrupt_command(self, text: str) -> bool:
        return InterruptCommands.is_interrupt_command(text)

    async def _handle_interrupt(self, event: InboundEvent) -> None:
        await InterruptCommands.handle_interrupt(self, event)

    async def _handle_clarify_command(self, event: InboundEvent) -> str | None:
        return await ClarifyCommands.handle_clarify_command(self, event)

    def _should_introduce(self, session: Session) -> bool:
        return StreamParams.should_introduce(self, session)

    def _build_introduction(self, event: InboundEvent) -> str:
        return StreamParams.build_introduction(self, event)

    @staticmethod
    def _channel_matches(channel: str, patterns: list[str]) -> bool:
        return StreamParams.channel_matches(channel, patterns)

    def _should_stream_channel(self, channel: str) -> bool:
        return StreamParams.should_stream_channel(self, channel)

    def _stream_flush_params(self, channel: str) -> tuple[int, int, bool]:
        return StreamParams.stream_flush_params(self, channel)

    def _maybe_bind_im_clarify_answer(self, event: InboundEvent) -> None:
        ClarifyCommands.maybe_bind_im_clarify_answer(self, event)

    async def process_direct(self, content: str, session_key: str = "cli:direct", channel: str = "cli") -> str:
        return await InboundHandler.process_direct(self, content, session_key, channel)
