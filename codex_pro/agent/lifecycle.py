"""Agent lifecycle — start/stop, background workers, MCP bootstrap.

Extracted from AgentLoop so the composition root does not own process
lifecycle details. Mirrors reference/codex session bring-up / tear-down
separated from per-turn handling.
"""
from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

from loguru import logger

if TYPE_CHECKING:
    from codex_pro.agent.loop import AgentLoop


class AgentLifecycle:
    """Start/stop and long-running auxiliary tasks for AgentLoop."""

    @staticmethod
    async def start(loop: "AgentLoop") -> None:
        # Rejections happen outside the normal inbound handler (session limiter,
        # shutdown deadline), so subscribe a dedicated lifecycle sink before the
        # bus can leave any already-accepted event without a terminal record.
        loop.bus.subscribe_inbound_rejected(loop._on_inbound_rejected)
        # Reconcile before any expensive initialization and, critically, before
        # subscribing to inbound traffic.  Every non-terminal row at this point
        # belongs to a process instance that can no longer finish it.
        if loop._turn_runs is not None:
            try:
                reconciled = await loop._turn_runs.reconcile_orphaned()
                if reconciled:
                    logger.info("Reconciled {} orphaned agent turn(s) at startup", reconciled)
            except Exception as e:
                # The ledger is observability/reconnect state.  A storage failure
                # here must be visible but must not make the whole agent unavailable.
                logger.warning("Turn-run startup reconciliation failed: {}", e)
        await loop._resolve_embed_and_index(loop._storage)
        if loop._embed_fn is not None:
            # Off the critical path: warm the model in the background so startup
            # isn't blocked, but the first retrieval likely finds it hot.
            loop._spawn_background(loop._warmup_embedding())
        if loop._reranker is not None:
            # Same deal for the reranker, and it matters more here: its model is
            # ~20x larger, so without this the first turns are guaranteed to
            # degrade to the RRF order.
            loop._spawn_background(loop._warmup_reranker())
        if loop._vector_index is not None:
            # Order matters: purge orphan rows BEFORE the index loads (so they
            # never enter the matrix), then queue re-embeds for entries whose
            # vector is missing or was produced by a different model.
            try:
                await loop.memory.scan_orphan_vectors()
            except Exception as e:
                logger.warning("Orphan vector scan failed: {}", e)
            await loop._vector_index.initialize()
            queued = loop.memory.queue_missing_embeds(loop._vector_index.stale_source_ids)
            if queued:
                loop._spawn_background(loop.memory.flush_pending_embeds())
            if loop._episodic is not None:
                try:
                    await loop._episodic.requeue_stale(loop._vector_index.stale_source_ids)
                except Exception as e:
                    logger.warning("Episodic stale re-embed failed: {}", e)
        # Knowledge vectors reuse the same embed_fn but stay in their own sidecar
        # store. Inject here in start() — both loop.knowledge and loop._embed_fn
        # are assigned during __init__, but _init_advanced_memory runs before
        # knowledge is constructed, so injection cannot live there.
        if loop.knowledge is not None and loop._embed_fn is not None:
            loop.knowledge.attach_embedding(
                loop._embed_fn,
                loop._resolved_vector_dimensions(),
                embed_timeout=loop.config.memory.embed_timeout_seconds,
            )
        if loop.knowledge is not None and loop.knowledge.needs_vector_backfill():
            loop._spawn_background(loop.knowledge.rebuild_async())
        await loop._cost_tracker.load()
        if loop._contradiction_detector is not None:
            try:
                loop.memory.reset_unresolved()
                # unresolved 镜像本身是全局索引,启动重建必须扫全库——这是
                # get_unresolved 唯一合法的不带 memory_scope(全库)调用方。
                for c in await loop._contradiction_detector.get_unresolved(limit=10000):
                    loop.memory.mark_contradiction_unresolved(c.id, c.memory_id_a, c.memory_id_b)
            except Exception as e:
                logger.warning("Unresolved-contradiction rebuild failed: {}", e)
        # DURABLE, not DISCARDABLE: MCP startup is the only thing that ever
        # registers these tools, so if the background pool happens to be
        # saturated at boot a DISCARDABLE task is dropped and the agent runs
        # for its whole lifetime with no MCP tools and no error anyone sees.
        from codex_pro.agent.background import Tier

        loop._spawn_background(loop._start_mcp_background(), tier=Tier.DURABLE)
        loop._start_spill_sweeper()
        loop._start_artifact_sweeper()
        # Skill admission candidate store: ensure schema exists before the first
        # background skill review can stage a candidate. Must run BEFORE
        # subscribe_inbound to close the startup race where an inbound event
        # triggers a review against a not-yet-created table. Independent of evolution.
        if loop._skill_candidate_store is not None:
            try:
                await loop._skill_candidate_store.init_schema()
            except Exception as e:
                logger.warning("Skill candidate store schema init failed: {}", e)
        loop.bus.subscribe_inbound(loop._on_inbound)
        # 置位必须在 subscribe_inbound 之后、且在所有可抛异常的初始化完成之后:
        # 之前 _running=True 在 start() 首行,embedding 探针/索引初始化中途抛错时
        # 健康检查(app.py 以 is_running 为 HEALTHY 判据)会对一个收不了消息的
        # 半启动实例误报健康。
        loop._running = True
        if loop._plugin_manager:
            await loop._plugin_manager.hooks.dispatch("on_agent_start")
        if loop.evolution is not None:
            try:
                await loop.evolution.start()
            except Exception as e:
                logger.warning("Evolution engine failed to start: {}", e)
        logger.info("Agent loop started")

    @staticmethod
    async def stop(loop: "AgentLoop") -> None:
        loop._running = False
        loop.bus.unsubscribe_inbound(loop._on_inbound)
        loop.bus.unsubscribe_inbound_rejected(loop._on_inbound_rejected)
        if loop.evolution is not None:
            try:
                await loop.evolution.stop()
            except Exception as e:
                logger.debug("Evolution engine stop raised: {}", e)
        plugin_owns_tool = None
        if loop._plugin_manager:
            # The stop hook is the plugin's last notification while every tool
            # and shared dependency is still alive. Plugin-registered tools are
            # owned and closed by PluginManager (whether or not the plugin has a
            # deactivate hook), so exclude them from the registry-wide close
            # below to avoid double-closing non-idempotent third-party resources.
            await loop._plugin_manager.hooks.dispatch("on_agent_stop")
            plugin_owns_tool = getattr(loop._plugin_manager, "owns_tool", None)
        # Tools may own work that depends on plugins, MCP clients, credentials,
        # or other tools. Close every duck-typed lifecycle owner in reverse
        # registration order (LIFO) before dismantling those dependencies. This
        # covers SpawnTool as well as ProcessTool and future host-owned tools
        # without another hard-coded shutdown branch.
        for name in reversed(loop.tools.tool_names):
            tool = loop.tools.get(name)
            if tool is not None and callable(plugin_owns_tool) and plugin_owns_tool(tool) is True:
                continue
            close = getattr(tool, "aclose", None)
            if not callable(close):
                continue
            try:
                await close()
            except Exception as e:
                logger.debug("{} aclose raised (ignored): {}", name, e)
        if loop._plugin_manager:
            await loop._plugin_manager.shutdown()
        if loop.mcp_manager:
            await loop.mcp_manager.stop_all()
        try:
            from codex_pro.agent.browser.session import manager as _browser_manager

            await _browser_manager.close_all()
        except Exception as e:
            logger.debug("browser manager close_all raised (ignored): {}", e)
        # spill 清扫循环不属于调度器,自己收。它绝大多数时间停在 sleep 上,
        # cancel 即刻生效;正在 to_thread 里扫的那一轮会跑完(线程不可中断),
        # 故这里等它,不 fire-and-forget。
        if loop._spill_sweep_task is not None:
            loop._spill_sweep_task.cancel()
            try:
                await loop._spill_sweep_task
            except (asyncio.CancelledError, Exception) as e:  # noqa: BLE001
                if not isinstance(e, asyncio.CancelledError):
                    logger.debug("spill 清扫任务收尾异常(忽略): {}", e)
            loop._spill_sweep_task = None
        if loop._artifact_sweep_task is not None:
            loop._artifact_sweep_task.cancel()
            try:
                await loop._artifact_sweep_task
            except (asyncio.CancelledError, Exception) as e:  # noqa: BLE001
                if not isinstance(e, asyncio.CancelledError):
                    logger.debug("artifact cleanup shutdown failed (ignored): {}", e)
            loop._artifact_sweep_task = None
        # All background work is spawned via ``_spawn_background`` and owned by
        # the scheduler; ``aclose`` cancels discardable tasks and flushes durable
        # ones. This is the single shutdown path for background work.
        await loop._bg_scheduler.aclose(timeout=10.0)
        # 调度器 aclose 后再排空 store 的在途镜像任务:DURABLE 任务可能刚产生镜像写,
        # 顺序不能反。消除关闭时 aiosqlite 向已关闭事件循环回调的资源警告。
        if getattr(loop, "memory", None) is not None:
            try:
                await loop.memory.aclose()
            except Exception as e:
                logger.debug("Memory store aclose raised (ignored): {}", e)
        # Release the local embedder's dedicated thread pool, if one was built.
        if loop._local_embedder is not None:
            try:
                loop._local_embedder.close()
            except Exception as e:
                logger.debug("Local embedder close raised (ignored): {}", e)
        # Same for the reranker's dedicated pool.
        if loop._reranker is not None:
            try:
                loop._reranker.close()
            except Exception as e:
                logger.debug("Local reranker close raised (ignored): {}", e)
        # Export the final telemetry batch only after every task/tool that can
        # create spans has stopped. TelemetryManager.shutdown is synchronous and
        # idempotent, but keep this boundary best-effort for embedded/custom
        # managers so it cannot prevent the rest of process shutdown.
        if loop._telemetry is not None:
            try:
                loop._telemetry.shutdown()
            except Exception as e:
                logger.debug("Telemetry shutdown raised (ignored): {}", e)
        logger.info("Agent loop stopped")

    @staticmethod
    def _spawn_background(loop: "AgentLoop", coro: Any, *, tier: Any = None) -> None:
        from codex_pro.agent.background import Tier

        loop._bg_scheduler.spawn(coro, tier=tier or Tier.DISCARDABLE)

    @staticmethod
    def _start_spill_sweeper(loop: "AgentLoop") -> None:
        """启动 spill 清扫循环,持有独立生命周期,不进 BackgroundScheduler。

        调度器是为"有界的一次性工作"设计的,而这是个永不返回的循环,放进去有两个
        后果:启动时若池已饱和,DISCARDABLE 会被永久丢弃(不是漏一轮,是这辈子
        不再清扫);启动成功则永久占住一个信号量槽,max_background_tasks=1 时后续
        DURABLE 全部排队等它——而它永远不结束。

        不以 spill.enabled 为条件:关掉开关只是不再产生新产物,已有的敏感内容
        仍须继续受 retentionDays/maxTotalMb 约束。目录不存在时循环自身是 no-op,
        所以无条件启动是安全的。
        """
        from codex_pro.spill.sweeper import sweep_forever

        # 挂在 start() 而非 __init__:AgentLoop 在 app.py 里于事件循环之外构造,
        # 那里 create_task 会抛 "no running event loop"。
        loop._spill_sweep_task = asyncio.create_task(
            sweep_forever(
                loop._spill_store.root,
                loop.config.spill.retention_days,
                loop.config.spill.max_total_mb,
                loop.config.spill.sweep_interval_hours,
            )
        )

    @staticmethod
    def _start_artifact_sweeper(loop: "AgentLoop") -> None:
        """Own the perpetual user-artifact retention loop outside the worker pool."""
        if not loop.config.artifacts.enabled:
            return
        from codex_pro.artifacts.sweeper import sweep_forever

        workspace_root = loop.workspace.resolve()
        configured_root = workspace_root / loop.config.artifacts.root_dir
        root = configured_root.resolve()
        try:
            root.relative_to(workspace_root)
        except ValueError:
            logger.error("Artifact cleanup disabled: configured root escapes the workspace")
            return
        if configured_root.is_symlink():
            logger.error("Artifact cleanup disabled: configured root is a symbolic link")
            return
        loop._artifact_sweep_task = asyncio.create_task(
            sweep_forever(
                root,
                loop.config.artifacts.retention_days,
                loop.config.artifacts.max_total_mb,
                loop.config.artifacts.sweep_interval_hours,
            )
        )

    @staticmethod
    async def _start_mcp_background(loop: "AgentLoop") -> None:
        try:
            await loop._start_mcp()
        except Exception as e:
            logger.error("MCP initialization failed (agent continues without MCP tools): {}", e)

    @staticmethod
    async def _start_mcp(loop: "AgentLoop") -> None:
        # tools.mcp.enabled 是 setup 向导写入的总开关,而这里过去只读 mcp_servers,
        # 全代码库没有任何位置读它 —— 用户在向导里取消勾选 MCP、配置写入
        # enabled: false,重启后所有 server 照旧连接。这就是那段注释声称要修掉的
        # fake toggle 换个地方复现。显式关闭必须压过"还有 server 配置"。
        if not loop.config.tools.mcp.enabled:
            if loop.config.tools.mcp_servers:
                logger.info(
                    "MCP is disabled (tools.mcp.enabled=false) — skipping {} configured server(s)",
                    len(loop.config.tools.mcp_servers),
                )
            return

        mcp_servers = loop._filter_mcp_servers(loop.config.tools.mcp_servers)
        if not mcp_servers:
            return
        from codex_pro.mcp.manager import MCPManager

        loop.mcp_manager = MCPManager(
            workspace=loop.workspace,
            security_policy=loop.config.tools.mcp_security_policy,
        )
        await loop.mcp_manager.start_all(mcp_servers)
        await loop.mcp_manager.discover_tools(loop.tools)
        loop._apply_runtime_tool_policy()

    @staticmethod
    def _apply_runtime_tool_policy(loop: "AgentLoop") -> None:
        from codex_pro.security.tool_policy import is_tool_allowed

        for name in list(loop.tools.tool_names):
            if name.startswith("mcp_") and not is_tool_allowed(loop.config, name):
                loop.tools.unregister(name)
                logger.info("Tool policy skipped MCP tool '{}'", name)

    @staticmethod
    def _filter_mcp_servers(loop: "AgentLoop", servers: dict[str, Any]) -> dict[str, Any]:
        filtered: dict[str, Any] = {}
        for name, cfg in servers.items():
            if cfg.url and loop.config.execution.network_policy == "deny":
                logger.warning("Skipping MCP server '{}' because networkPolicy is deny", name)
                continue
            if (
                cfg.command
                and loop.config.security.profile == "public_gateway"
                and not loop.config.permissions.elevated.enabled
            ):
                logger.warning(
                    "Skipping stdio MCP server '{}' under public_gateway profile without elevated access", name
                )
                continue
            filtered[name] = cfg
        return filtered
