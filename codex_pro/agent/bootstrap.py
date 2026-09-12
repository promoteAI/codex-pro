"""Composition-time wiring helpers for AgentLoop.

Tool discovery, advanced memory staging, and multi-agent delegation setup
run during ``AgentLoop.__init__`` — kept out of the composition root so
lifecycle / inbound / embedding stay focused.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any

from loguru import logger

from codex_pro.agent.embedding_helpers import pick_embed_candidate
from codex_pro.config.schema import Config

if TYPE_CHECKING:
    from codex_pro.agent.loop import AgentLoop


class LoopBootstrap:
    """Register tools, stage advanced memory, and wire multi-agent delegation."""

    @staticmethod
    def register_tools(
        loop: "AgentLoop",
        scheduler: Any = None,
        task_manager: Any = None,
        workflow_engine: Any = None,
    ) -> None:
        from codex_pro.agent.tools import discover_tools

        all_tools = discover_tools(
            config=loop.config,
            workspace=loop.workspace,
            bus=loop.bus,
            provider=loop.provider,
            scheduler=scheduler,
            session_manager=loop.sessions,
            skill_store=loop.skill_store,
            # memory.enabled 是总开关：关闭时连 memory_store 都不传，
            # discover_tools 的 `if memory_store:` 门控即不注册 memory 工具；
            # 配套的矛盾检测/失效回调在关闭时一并传 None，避免半开状态。
            memory_store=loop.memory if loop.config.memory.enabled else None,
            contradiction_detector=(
                getattr(loop, "_contradiction_detector", None) if loop.config.memory.enabled else None
            ),
            task_manager=task_manager,
            workflow_engine=workflow_engine,
            knowledge_index=loop.knowledge,
            approval=loop.approval,
            clarify_manager=loop.clarify,
            memory_invalidate_fn=(
                loop._invalidate_memory_caches if loop.config.memory.enabled else None
            ),
            # R1 Task8:MemoryTool 注入 loop 单例 service,不再就近 new。
            memory_service=(loop._memory_service if loop.config.memory.enabled else None),
        )
        for tool in all_tools:
            loop.tools.register(tool)

        report = loop.tools.get_readiness_report()
        not_ready = [(name, reason) for name, ready, reason in report if not ready]
        if not_ready:
            logger.warning("Tools not ready: {}", ", ".join(f"{n} ({r})" for n, r in not_ready))
        else:
            logger.info("All {} registered tools are ready", len(report))

    @staticmethod
    def init_advanced_memory(loop: "AgentLoop", config: Config, storage: Any) -> None:
        """初始化高级记忆子系统：分层记忆、向量索引、混合检索、矛盾检测。"""
        from codex_pro.memory.tiers import EpisodicManager, SemanticManager, ArchivalManager

        forgetting = loop.memory.forgetting_curve

        episodic = EpisodicManager(storage) if storage else None
        # R1 Task8:晋升(SemanticManager)与归档/遗忘删除(ArchivalManager)均注入
        # loop 的 _memory_service 单例,失效/flush/审计统一收敛。
        semantic = SemanticManager(loop._memory_service)
        archival = ArchivalManager(storage, service=loop._memory_service) if storage else None

        loop._episodic = episodic
        loop.consolidator.set_episodic_manager(episodic)
        loop.consolidator.set_semantic_manager(semantic)
        loop.consolidator.set_forgetting_curve(forgetting)
        loop.consolidator.set_archival_manager(archival)

        # 阶段 A：只挑候选 provider（不发网络、不构造索引、不构造依赖向量的消费者）。
        # 最终 backend 由 start() 内的探针在 _resolve_embed_and_index 定案，
        # VectorIndex / embed_fn / 矛盾检测 / HybridRetriever / reflection 一并在那时构造。
        # 阶段 A 后至 start() 前，_vector_index / _embed_fn 保持 None 是安全的
        # （下游消费者与 retrieval.py 均有 None 判断），生产环境处理事件必经 start()。
        vector_index = None
        embed_fn = None
        loop._local_embedder = None
        loop._embed_model_id = ""
        loop._embed_backend = config.memory.embedding_backend
        loop._embed_candidate = (None, None)
        # 依赖向量的消费者推迟到阶段 B 构造；阶段 A 先把属性初始化好，
        # 使 __init__ 后续（_register_tools / _context_stage / prefetcher）拿到确定的初值。
        loop._contradiction_detector = None
        loop._hybrid_retriever = None
        if config.memory.vector_enabled and storage:
            emb_model = config.memory.embedding_model or None
            loop._embed_candidate = pick_embed_candidate(
                loop._embed_backend,
                loop.provider,
                loop.router,
                emb_model,
            )
        loop._vector_index = vector_index
        loop._embed_fn = embed_fn

    @staticmethod
    def setup_delegation(loop: "AgentLoop") -> None:
        if not loop.config.multi_agent.enabled:
            return
        from codex_pro.agent.multi_agent.registry import WorkerRegistry
        from codex_pro.agent.tools.delegate import DelegateTool

        worker_registry = WorkerRegistry.from_config(loop.config.multi_agent)
        audit_path = Path(loop.config.multi_agent.audit_path).expanduser()
        if not audit_path.is_absolute():
            audit_path = loop.workspace / audit_path

        delegate_tool = DelegateTool(
            provider=loop.provider,
            model_router=loop.router,
            tool_registry=loop.tools,
            worker_registry=worker_registry,
            approval_gate=loop.approval_gate,
            credentials=loop.credentials,
            audit_path=audit_path,
            max_depth=loop.config.multi_agent.max_depth,
            max_parallel_workers=loop.config.multi_agent.max_parallel_workers,
            max_worker_iterations=loop.config.multi_agent.max_iterations,
            default_model=loop._default_model,
        )
        loop.tools.register(delegate_tool)

        # spawn_task shares delegate's execution engine so its background worker
        # runs real tool calls (exec/write_file/cronjob) through the approval
        # flow, instead of being a tool-less completion that only "plans".
        from codex_pro.agent.tools.delegate import SpawnTool

        spawn_tool = SpawnTool(
            provider=loop.provider,
            bus=loop.bus,
            tool_registry=loop.tools,
            approval_gate=loop.approval_gate,
            credentials=loop.credentials,
            model_router=loop.router,
            default_model=loop._default_model,
            max_iterations=loop.config.multi_agent.max_iterations,
        )
        loop.tools.register(spawn_tool)
        logger.info("Delegation enabled with {} worker templates", len(worker_registry.list()))
