"""GatewayServer — HTTP/WebSocket server orchestrating all gateway subsystems.

This is the composition root for the gateway layer. It wires together
configuration, storage, providers, bus, agent, plugins, evolution,
channels, and the HTTP/WebSocket server.

The core handler logic has been extracted into:
- ``gateway/http_handlers/`` — HTTP request handlers
- ``gateway/ws_handlers/`` — WebSocket handlers

See those modules for detailed implementation.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import aiohttp
from aiohttp import web
from loguru import logger

from codex_pro.bus.events import (
    ContentType,
    FAULTED_TURN_OUTCOMES,
    InboundEvent,
    OutboundEvent,
    TERMINAL_TURN_OUTCOMES,
)
from codex_pro.bus.idempotency import (
    BoundedIdempotencyStore,
    idempotency_ledger_metadata,
)
from codex_pro.bus.queue import MessageBus
from codex_pro.channels.base import SendResult
from codex_pro.channels.manager import ChannelManager
from codex_pro.channels.qqbot_media import detect_media_kind
from codex_pro.config.schema import GatewayConfig
from codex_pro.gateway.auth import GatewayAuth
from codex_pro.gateway.editor import ProgressiveEditor
from codex_pro.gateway.health import GatewayHealthProvider
from codex_pro.gateway.hooks import HookRegistry
from codex_pro.gateway.host_rules import (
    is_loopback_bind,
    normalize_host_entries,
    normalize_origin_entries,
)
from codex_pro.gateway.http_handlers.message_handler import MessageHandler
from codex_pro.gateway.http_handlers.metadata_handler import MetadataHandlers
from codex_pro.gateway.http_handlers.session_handler import SessionHandlers
from codex_pro.gateway.media import MediaCache
from codex_pro.gateway.rate_limiter import RateLimiter
from codex_pro.gateway.router import DeliveryRouter
from codex_pro.gateway.session_policy import SessionResetPolicy
from codex_pro.gateway.ws_handlers.websocket import WebSocketHandler
from codex_pro.gateway.ws_web import WebUIWebSocket
from codex_pro.gateway.config_watcher import ConfigWatcher
from codex_pro.gateway.ws_session import normalize_platform
from codex_pro.gateway.term import TerminalWebSocket
from codex_pro.session.manager import SessionManager


class GatewayServer:
    _MEDIA_KIND_TO_CONTENT_TYPE = {
        "image": ContentType.IMAGE,
        "video": ContentType.VIDEO,
        "voice": ContentType.AUDIO,
        "file": ContentType.FILE,
    }

    def __init__(
        self,
        config: GatewayConfig,
        bus: MessageBus,
        channel_manager: ChannelManager,
        session_manager: SessionManager,
        workspace: Path,
        agent_loop: Any = None,
        a2a_config: Any = None,
        config_path: Path | None = None,
    ):
        self._config = config
        self._bus = bus
        self.channel_manager = channel_manager
        self.session_manager = session_manager
        self._workspace = workspace
        # Projects live in a dedicated subdir so the dashboard's project list
        # and file browser never expose the workspace's system-state dirs
        # (data/, cache/, models/, skills/, .codex-pro/, ...).
        self._projects = (workspace / "workspace").resolve()
        self._projects.mkdir(parents=True, exist_ok=True)
        self._agent_loop = agent_loop
        self._a2a_config = a2a_config
        self._config_path = config_path
        self._config_watcher: Any = None
        # Serialize reload_config() calls. A config PATCH writes the file and
        # then reloads explicitly, while the config watcher fires an async reload
        # on the same file change — two concurrent router.reload() calls race on
        # dict internals and can aclose() a provider that a live turn is still
        # using, surfacing as "client has been closed". The lock makes both
        # serial; callers that don't need the result may still await it.
        self._reload_lock = asyncio.Lock()

        self._app: web.Application | None = None
        self._runner: web.AppRunner | None = None
        self._site: web.TCPSite | None = None
        self._ws_clients: dict[str, web.WebSocketResponse] = {}
        self._pending_http: dict[str, asyncio.Future[dict[str, Any]]] = {}
        self._MAX_PENDING_HTTP = 500
        # Tool-originated outbound events inherit ``is_final=True``, but they
        # are side deliveries within a turn rather than the turn's terminal
        # answer.  Synchronous HTTP callers only have one waiter, so retain
        # those frames until the real terminal arrives.  Bound both one request
        # and the whole gateway: the pending-request cap alone would otherwise
        # permit hundreds of maximum-sized buffers at once.
        self._pending_http_tool_deliveries: dict[
            str, tuple[list[dict[str, Any]], int, float]
        ] = {}
        self._pending_http_tool_delivery_frames = 0
        self._pending_http_tool_delivery_chars = 0
        self._MAX_HTTP_TOOL_DELIVERY_FRAMES = 128
        self._MAX_HTTP_TOOL_DELIVERY_CHARS = 256_000
        self._MAX_HTTP_TOOL_DELIVERY_TOTAL_FRAMES = 4096
        self._MAX_HTTP_TOOL_DELIVERY_TOTAL_CHARS = 8_000_000
        self._HTTP_TOOL_DELIVERY_TTL_SECONDS = 3600.0
        self._message_idempotency = BoundedIdempotencyStore(
            max_entries=4096,
            ttl_seconds=3600.0,
        )
        self._running = False
        self._actual_port: int | None = None
        self._unsubscribe_log_events: Any = None
        self._log_event_task: asyncio.Task[None] | None = None

        data_dir = workspace / "data"
        # Pass the bind address to the auth so the Host-header check can derive
        # a sensible default allowlist (loopback addresses when bound locally,
        # none when bound to 0.0.0.0). For non-loopback binds, an empty
        # allowed_hosts configuration is a deployment mistake: anyone reaching
        # the gateway via DNS could claim to come from a non-existent domain.
        self.auth = GatewayAuth(config.auth, data_dir, bound_host=config.host)
        self._warn_host_allowlist_if_unset()
        self._warn_origin_allowlist_if_unset()
        self.media_cache = MediaCache(
            cache_dir=workspace / config.media_cache_dir,
            max_size_mb=config.media_cache_max_mb,
            max_file_mb=config.media_max_file_mb,
            concurrency=config.media_download_concurrency,
            allow_private=config.media_allow_private_addresses,
        )
        self.rate_limiter = RateLimiter()
        self.delivery_router = DeliveryRouter(bus)
        self.hooks = HookRegistry()
        self.editor = ProgressiveEditor(bus)
        self.session_policy = SessionResetPolicy(config.session_policy)
        self.health = GatewayHealthProvider(self)
        self._web_ws = WebUIWebSocket(self)
        self._term_ws = TerminalWebSocket(self, config.terminal)
        self._bus.subscribe_outbound_global(self._handle_outbound)

        for name, plat_cfg in config.platforms.items():
            if plat_cfg.rate_limit_rpm:
                self.rate_limiter.configure(name, plat_cfg.rate_limit_rpm)

        if config.hooks_dir:
            hooks_path = workspace / config.hooks_dir
            if hooks_path.is_dir():
                self.hooks.load_from_dir(hooks_path)

        # Extracted handler instances
        self._msg_handler = MessageHandler(self)
        self._meta_handler = MetadataHandlers(self)
        self._session_handler = SessionHandlers(self)
        self._ws_handler = WebSocketHandler(self)

    def _normalize_platform(self, reported: str | None) -> str:
        """Fold a client-reported platform onto a gateway-known value."""
        known = getattr(self._config, "known_platforms", None)
        if not isinstance(known, list) or not known:
            return normalize_platform(reported, None)
        return normalize_platform(reported, known + list(self._config.platforms or {}))

    async def _reset_session_if_needed(
        self,
        session_key: str,
        *,
        force: bool = False,
    ) -> tuple[Any, bool]:
        """Run the one authoritative reset path under the agent session lock."""
        # A brand-new session (never seen in cache or storage) is the moment a
        # SessionStart lifecycle hook should fire — exactly once, on first
        # creation, not on resets or later messages. ``get`` is the read-only
        # path: it never fabricates a session, so None means genuinely new.
        was_new = await self.session_manager.get(session_key) is None
        session = await self.session_manager.get_or_create(session_key)
        if was_new:
            self._fire_session_start(session)
        if not force and not self.session_policy.should_reset(session):
            return session, False

        if force and self._agent_loop is not None:
            unblock = getattr(self._agent_loop, "unblock_session_for_reset", None)
            if callable(unblock):
                unblock(session_key)

        async def _clear_process_state() -> None:
            if self._agent_loop is None:
                return
            reset_state = getattr(self._agent_loop, "reset_session_state", None)
            if callable(reset_state):
                result = reset_state(session_key)
                if hasattr(result, "__await__"):
                    await result

        acquire = getattr(self.session_manager, "acquire", None)
        if acquire is None:
            await self.session_policy.reset(session, self.session_manager)
            await _clear_process_state()
        else:
            lock = await acquire(session_key)
            async with lock:
                session = await self.session_manager.get_or_create(session_key)
                if not force and not self.session_policy.should_reset(session):
                    return session, False
                await self.session_policy.reset(session, self.session_manager)
                await _clear_process_state()
        await self.hooks.emit("session_reset", session_key=session_key)
        await self._web_ws.broadcast(
            "session_reset",
            {"session_key": session_key},
        )
        return session, True

    def _fire_session_start(self, session: Any) -> None:
        """Schedule user-configured ``SessionStart`` hooks (fire-and-forget).

        Handing the work to a background task keeps the reset path non-blocking:
        a slow or failing hook never delays the inbound message that created the
        session. The scheduled coroutine (``hook_exec.execute_session_start``)
        is defensive about its own errors and never raises, so the task will not
        surface an unhandled exception.
        """
        try:
            from codex_pro.gateway.hook_exec import schedule_session_start

            schedule_session_start(self, session)
        except Exception as e:  # noqa: BLE001 — scheduling must never block the turn
            logger.warning("Failed to schedule SessionStart hooks: {}", e)

    async def _accept_turn(self, event: InboundEvent, session: Any) -> None:
        command = event.text.strip().split(maxsplit=1)[0].lower() if event.text.strip() else ""
        if event.is_control or command in {"/approve", "/deny", "/approvals", "/clarify"}:
            return
        interrupt = getattr(self._agent_loop, "interrupt", None)
        admit_interrupt = getattr(interrupt, "admit", None)
        if callable(admit_interrupt):
            admit_interrupt(event.session_key, event.event_id)
        turn_runs = getattr(self._agent_loop, "turn_runs", None)
        if turn_runs is None:
            return
        from codex_pro.session.context_epoch import conversation_context_key

        try:
            ledger_metadata = {
                "channel": event.channel,
                "chat_id": event.chat_id,
                **idempotency_ledger_metadata(event.metadata),
            }
            result = turn_runs.accept(
                event.event_id,
                event.session_key,
                context_key=conversation_context_key(event.session_key, session),
                metadata=ledger_metadata,
            )
            if hasattr(result, "__await__"):
                await result
        except Exception as e:
            logger.warning("Turn acceptance ledger write failed: {}", e)

    def _discard_turn_interrupt_admission(self, event: InboundEvent) -> None:
        interrupt = getattr(self._agent_loop, "interrupt", None)
        discard = getattr(interrupt, "discard", None)
        if callable(discard):
            discard(event.session_key, event.event_id)

    async def _publish_accepted_turn(self, event: InboundEvent) -> bool:
        publish_task = asyncio.create_task(self._bus.publish_inbound(event))
        try:
            return await asyncio.shield(publish_task)
        except asyncio.CancelledError:
            try:
                accepted = await asyncio.shield(publish_task)
            except BaseException:
                self._discard_turn_interrupt_admission(event)
            else:
                if not accepted:
                    self._discard_turn_interrupt_admission(event)
            raise
        except BaseException:
            self._discard_turn_interrupt_admission(event)
            raise

    async def _reject_turn(self, event_id: str, reason: str) -> None:
        turn_runs = getattr(self._agent_loop, "turn_runs", None)
        if turn_runs is None:
            return
        try:
            result = turn_runs.mark_terminal(event_id, "failed", error=reason)
            if hasattr(result, "__await__"):
                await result
        except Exception as e:
            logger.warning("Turn rejection ledger write failed: {}", e)

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def web_ws(self) -> WebUIWebSocket:
        return self._web_ws

    @property
    def term_ws(self) -> TerminalWebSocket:
        return self._term_ws

    @property
    def actual_port(self) -> int:
        if self._actual_port is not None:
            return self._actual_port
        return self._config.port

    # ── Lifecycle ────────────────────────────────────────────────────────────

    async def start(self) -> None:
        self._check_bind_safety()
        self._app = web.Application()
        self._setup_routes()

        self._runner = web.AppRunner(self._app)
        await self._runner.setup()
        self._site = web.TCPSite(
            self._runner,
            self._config.host,
            self._config.port,
        )
        try:
            await self._site.start()
        except OSError as e:
            import errno

            from codex_pro.gateway.port_bind import (
                format_gateway_port_bind_error,
                is_bind_access_denied,
            )

            if e.errno == errno.EADDRINUSE or is_bind_access_denied(e):
                raise RuntimeError(
                    format_gateway_port_bind_error(
                        self._config.host, self._config.port, e,
                    )
                ) from e
            raise

        actual_port = self._config.port
        if self._runner.addresses:
            actual_port = self._runner.addresses[0][1]
        self._actual_port = actual_port

        self._running = True

        # Start config file watcher for hot-reload
        if self._config_path is not None:
            self._config_watcher = ConfigWatcher(self, self._config_path)
            self._config_watcher.start()
            logger.info("Config watcher started for {}", self._config_path)

        from codex_pro.observability.log_buffer import subscribe_log_events

        loop = asyncio.get_running_loop()

        def _on_log(entry: dict[str, Any]) -> None:
            def _publish() -> None:
                if self._log_event_task is None or self._log_event_task.done():
                    self._log_event_task = loop.create_task(
                        self._web_ws.broadcast("log_entry", entry)
                    )

            try:
                loop.call_soon_threadsafe(_publish)
            except RuntimeError:
                pass

        self._unsubscribe_log_events = subscribe_log_events(_on_log)

        import os as _os
        from codex_pro.cli.workspace import clear_runtime_endpoint, write_runtime_endpoint

        try:
            write_runtime_endpoint(
                self._workspace,
                host=self._config.host,
                port=actual_port,
                pid=_os.getpid(),
                ws_path=self._config.ws_path,
            )
            import atexit
            atexit.register(clear_runtime_endpoint, self._workspace)
        except Exception as e:
            logger.warning("Failed to write gateway runtime endpoint: {}", e)

        await self.hooks.emit("gateway_start")
        logger.info(
            "Gateway listening on {}:{}",
            self._config.host,
            actual_port,
        )

    def _check_bind_safety(self) -> None:
        host = (self._config.host or "").strip()
        if is_loopback_bind(host) or self._tokens_configured():
            return
        raise RuntimeError(
            f"Gateway is configured to bind {host}:{self._config.port} without any "
            "API token. Set gateway.auth.apiTokens (or bind to 127.0.0.1) before "
            "exposing the gateway to the network."
        )

    async def stop(self) -> None:
        self._running = False
        if self._config_watcher is not None:
            self._config_watcher.stop()
            self._config_watcher = None
        if self._unsubscribe_log_events is not None:
            self._unsubscribe_log_events()
            self._unsubscribe_log_events = None
        if self._log_event_task is not None:
            if not self._log_event_task.done():
                self._log_event_task.cancel()
            await asyncio.gather(self._log_event_task, return_exceptions=True)
            self._log_event_task = None
        await self.hooks.emit("gateway_stop")

        for future in self._pending_http.values():
            if not future.done():
                future.cancel()
        self._pending_http.clear()
        self._clear_all_http_tool_deliveries()

        for ws_id, ws in list(self._ws_clients.items()):
            await ws.close(code=aiohttp.WSCloseCode.GOING_AWAY, message=b"shutdown")
        self._ws_clients.clear()

        jobs = getattr(self, "_knowledge_jobs", None)
        if jobs is not None:
            await jobs.close()

        await self._web_ws.close_all()
        await self._term_ws.close_all()

        if self._site:
            await self._site.stop()
        if self._runner:
            await self._runner.cleanup()

        from codex_pro.cli.workspace import clear_runtime_endpoint
        clear_runtime_endpoint(self._workspace)

        await self.media_cache.cleanup()
        logger.info("Gateway stopped")

    # ── Route setup ──────────────────────────────────────────────────────────

    def _setup_routes(self) -> None:
        """Register all HTTP and WebSocket routes."""
        prefix = self._config.api_prefix
        app = self._app
        assert app is not None

        # Metadata handlers
        app.router.add_get("/playground", self._meta_handler.handle_playground)
        app.router.add_get("/meta", self._meta_handler.handle_meta)
        app.router.add_post(f"{prefix}/message", self._msg_handler.handle_message)
        app.router.add_get(f"{prefix}/health", self._meta_handler.handle_health)
        app.router.add_delete(f"{prefix}/sessions/{{key}}", self._session_handler.handle_reset_session)
        app.router.add_post(f"{prefix}/pair", self._session_handler.handle_pair_generate)
        app.router.add_post(f"{prefix}/pair/verify", self._session_handler.handle_pair_verify)
        app.router.add_get(f"{prefix}/stats", self._meta_handler.handle_stats)
        app.router.add_get(f"{prefix}/capabilities", self._meta_handler.handle_capabilities)
        app.router.add_get(self._config.ws_path, self._ws_handler.handle_websocket)
        app.router.add_get("/ws/web", self._web_ws.handle)
        if self._config.terminal.enabled:
            app.router.add_get("/ws/term", self._term_ws.handle)

        if self._a2a_config and self._a2a_config.enabled and self._agent_loop:
            from codex_pro.a2a.server import A2AServer
            from codex_pro.a2a.models import AgentCard
            from codex_pro import __version__
            from codex_pro.gateway.http_handlers.base import require_a2a_principal

            card = AgentCard(
                name=self._a2a_config.agent_name,
                description=self._a2a_config.agent_description,
                url=f"http://{self._config.host}:{self._config.port}",
                version=__version__,
                capabilities=self._a2a_config.capabilities,
            )
            a2a = A2AServer(
                self._agent_loop,
                card,
                auth_fn=lambda req: require_a2a_principal(
                    req, self.auth, self._tokens_configured(),
                    "anonymous",
                ),
                task_ttl_seconds=self._a2a_config.task_ttl_seconds,
                max_tasks=self._a2a_config.max_tasks,
                active_task_ttl_seconds=self._a2a_config.active_task_ttl_seconds,
            )
            a2a.register_routes(app)

        if self._agent_loop:
            from codex_pro.gateway.api import register_management_routes
            register_management_routes(app, prefix, self)
        else:
            app.router.add_get(f"{prefix}/sessions", self._session_handler.handle_list_sessions)

        # Dashboard SPA catch-all
        app.router.add_get("/{path:.*}", self._meta_handler.handle_web_ui)

    # ── Helpers still needed inline ──────────────────────────────────────────

    def _tokens_configured(self) -> bool:
        return bool(self._config.auth.api_tokens or self._config.auth.admin_tokens)

    def _warn_host_allowlist_if_unset(self) -> None:
        if normalize_host_entries(self._config.auth.allowed_hosts):
            return
        bound = (self._config.host or "").strip()
        if is_loopback_bind(bound):
            return
        logger.warning(
            "Gateway bound to {} with no usable auth.allowed_hosts entry. Admin "
            "endpoints (sessions, config, memory writes, tasks, cron, knowledge) "
            "will reject every browser request for lacking a trusted "
            "Host; read-only pages and native clients still work. List the domain "
            "or address you browse to (e.g. 'codex.example.com') in "
            "gateway.auth.allowed_hosts — note that a wildcard such as '0.0.0.0' "
            "is not a usable entry.",
            bound or "(empty = all interfaces)",
        )

    def _warn_origin_allowlist_if_unset(self) -> None:
        bound = (self._config.host or "").strip()
        if is_loopback_bind(bound):
            return
        if not normalize_host_entries(self._config.auth.allowed_hosts):
            return
        if normalize_origin_entries(self._config.auth.allowed_origins):
            return
        logger.warning(
            "Gateway bound to {} with auth.allowed_hosts configured but no "
            "auth.allowed_origins. Browsers/webviews that omit Fetch Metadata "
            "will load read-only dashboard pages, but Dashboard WebSocket and "
            "admin writes will be rejected as cross-site. List the exact "
            "browser origin (scheme, host and port) in "
            "gateway.auth.allowed_origins.",
            bound or "(empty = all interfaces)",
        )

    def _infer_media_content_type(self, *sources: str, mime_type: str = "") -> ContentType:
        for source in sources:
            kind = detect_media_kind(source, mime_type)
            if kind != "file":
                return self._MEDIA_KIND_TO_CONTENT_TYPE[kind]
        return ContentType.FILE

    def _authenticate_and_check_rate_limit(
        self,
        platform: str,
        user_id: str,
        chat_id: str,
        *,
        trusted: bool = False,
        consume_rate_limit: bool = True,
    ) -> str | None:
        if not (self.auth.is_authorized(platform, user_id) or trusted):
            self.auth.audit("message", platform=platform, user_id=user_id, ok=False, reason="user unauthorized")
            return "unauthorized"
        if consume_rate_limit and not self.rate_limiter.acquire(platform, chat_id):
            return "rate limited"
        return None

    def _build_outbound_payload(self, event: OutboundEvent) -> dict[str, Any]:
        return {
            "type": "message",
            "event_id": event.event_id,
            "reply_to_id": event.reply_to_id,
            "channel": event.channel,
            "chat_id": event.chat_id,
            "text": event.text,
            "is_final": event.is_final,
            "message_kind": event.message_kind,
            "edit_message_id": event.edit_message_id,
            "metadata": event.metadata,
        }

    # ── Tool delivery buffering (kept inline for state access) ──────────────

    def _buffer_http_tool_delivery(self, correlation_id: str, payload: dict[str, Any]) -> str | None:
        return self._msg_handler._buffer_http_tool_delivery(correlation_id, payload)

    def _pop_http_tool_deliveries(self, correlation_id: str) -> tuple[list[dict[str, Any]], int, float] | None:
        return self._msg_handler._pop_http_tool_deliveries(correlation_id)

    def _take_http_tool_deliveries(self, correlation_id: str) -> list[dict[str, Any]]:
        return self._msg_handler._take_http_tool_deliveries(correlation_id)

    def _clear_http_tool_deliveries(self, correlation_id: str) -> None:
        self._msg_handler._clear_http_tool_deliveries(correlation_id)

    def _purge_http_tool_deliveries(self, now: float | None = None) -> None:
        self._msg_handler._purge_http_tool_deliveries(now)

    def _make_http_tool_delivery_room(self, frame_chars: int, *, preserve: str) -> bool:
        return self._msg_handler._make_http_tool_delivery_room(frame_chars, preserve=preserve)

    def _clear_all_http_tool_deliveries(self) -> None:
        self._msg_handler._clear_all_http_tool_deliveries()

    async def _release_durable_claim(self, event_id: str) -> None:
        await self._msg_handler._release_durable_claim(event_id)

    def _set_models_config(self, models_config: Any) -> None:
        """Update in-memory models config on both loop and router."""
        loop = getattr(self, "_agent_loop", None)
        if loop is not None:
            try:
                loop.config.models = models_config
            except Exception:
                pass  # loop.config may not have .models in some test setups
        router = getattr(loop, "router", None) if loop is not None else None
        if router is not None:
            router._config = models_config

    async def reload_config(self) -> dict[str, Any]:
        """Re-read config from disk and rebuild the model router.

        Updates both ``loop.config.models`` and ``router._config`` so the
        in-process view stays coherent after a hot-reload.  Broadcasts a
        ``config_updated`` WebSocket event so the frontend refreshes its UI.
        """
        # Serialize against concurrent reloads (the config watcher may fire on
        # the same file mutation that also triggered this call). Without the
        # lock, two router.reload() calls race and can aclose() a provider a
        # live turn still uses — "Cannot send a request, as the client has been
        # closed". The second waiter re-reads the file after the lock, so it
        # picks up the latest on-disk state.
        async with self._reload_lock:
            from codex_pro.config.loader import load_config

            try:
                new_config = load_config(self._config_path)
            except Exception as exc:
                logger.error("Config reload failed: {}", exc)
                await self.web_ws.broadcast(
                    "config_updated", {"paths": ["*"], "hot_reload": False, "error": str(exc)}
                )
                return {"ok": False, "error": str(exc)}

            self._set_models_config(new_config.models)

            loop = getattr(self, "_agent_loop", None)
            router = getattr(loop, "router", None) if loop is not None else None
            if router is not None:
                try:
                    await router.reload(default_model=new_config.models.default_model)
                except Exception as exc:
                    logger.error("Router reload failed: {}", exc)
                    await self.web_ws.broadcast(
                        "config_updated", {"paths": ["*"], "hot_reload": False, "error": str(exc)}
                    )
                    return {"ok": False, "error": str(exc)}

            await self.web_ws.broadcast(
                "config_updated", {"paths": ["models"], "hot_reload": True}
            )
            return {"ok": True}

    @staticmethod
    def _http_final_response(event_id: str, session_key: str, reply: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        return MessageHandler._http_final_response(event_id, session_key, reply)

    @staticmethod
    def _http_turn_run_response(row: dict[str, Any], event_id: str, session_key: str) -> tuple[int, dict[str, Any], bool]:
        return MessageHandler._http_turn_run_response(row, event_id, session_key)

    @staticmethod
    def _ws_turn_run_payload(row: dict[str, Any], event_id: str) -> tuple[dict[str, Any], bool]:
        status = str(row.get("status") or "accepted")
        if status not in TERMINAL_TURN_OUTCOMES:
            return {
                "type": "accepted",
                "event_id": event_id,
                "status": status,
            }, False
        response_text = str(row.get("response_text") or "")
        if status in FAULTED_TURN_OUTCOMES and not response_text:
            return {
                "type": "error",
                "event_id": event_id,
                "status": status,
                "error": str(row.get("error") or f"turn {status}"),
            }, True
        frame: dict[str, Any] = {
            "type": "message",
            "event_id": event_id,
            "status": status,
            "text": response_text,
            "is_final": True,
            "message_kind": "final",
            "metadata": {"_inbound_event_id": event_id},
        }
        if status != "completed":
            frame["error"] = str(row.get("error") or f"turn {status}")
        return frame, True

    # ── Outbound delivery ──────────────────────────────────────────────────

    async def _handle_outbound(self, event: OutboundEvent) -> SendResult | None:
        return await self._ws_handler.handle_outbound(event)

    async def broadcast_to_ws(self, session_key: str, data: dict[str, Any]) -> bool:
        return await self._ws_handler.broadcast_to_ws(session_key, data)

    # ── Wrapper methods for API modules / test compatibility ───────────────

    def _check_csrf(self, request: web.Request, *, action: str) -> web.Response | None:
        from codex_pro.gateway.http_handlers.base import check_csrf
        return check_csrf(request, self.auth, action=action)

    def _require_api_token(self, request: web.Request, *, action: str) -> web.Response | None:
        """Guard for read/chat-level endpoints used by management API modules."""
        from codex_pro.gateway.http_handlers.base import require_api_token
        return require_api_token(
            request, self.auth, self._tokens_configured(), action=action,
        )

    def _require_admin_token(self, request: web.Request, *, action: str) -> web.Response | None:
        """Guard for high-risk admin endpoints used by management API modules."""
        from codex_pro.gateway.http_handlers.base import require_admin_token
        admin = self._config.auth.admin_tokens or self._config.auth.api_tokens
        return require_admin_token(request, self.auth, admin, action=action)

    async def _handle_message(self, request: web.Request) -> web.Response:
        return await self._msg_handler.handle_message(request)

    async def _handle_capabilities(self, request: web.Request) -> web.Response:
        return await self._meta_handler.handle_capabilities(request)

    def _playground_path(self) -> Path:
        return Path(__file__).resolve().parent / "static" / "index.html"

    def _resolve_web_dir(self) -> Path | None:
        """Locate the Codex Pro web UI build directory."""
        pkg_root = Path(__file__).resolve().parent.parent
        candidates = [
            pkg_root / "_bundled" / "web",
            pkg_root.parent / "web" / "dist",
        ]
        for p in candidates:
            if (p / "index.html").exists():
                return p
        return None

    async def _handle_playground(self, request: web.Request) -> web.Response:
        path = self._playground_path()
        if path.exists():
            return web.FileResponse(path)
        return web.Response(text="Gateway playground not found.", status=404)

    async def _handle_web_ui(self, request: web.Request) -> web.Response:
        """Serve the web UI SPA with fallback to index.html for client-side routing."""
        web_dir = self._resolve_web_dir()
        if web_dir is None:
            return await self._handle_playground(request)

        req_path = request.match_info.get("path", "")
        if req_path:
            file_path = web_dir / req_path
            try:
                file_path = file_path.resolve()
                if file_path.is_file() and str(file_path).startswith(str(web_dir.resolve())):
                    return web.FileResponse(file_path)
            except (OSError, ValueError):
                pass
        return web.FileResponse(web_dir / "index.html")

    # Note: HTTP message handling (including is_group from body.get("is_group"))
    # is delegated to MessageHandler in gateway/http_handlers/message_handler.py
    # WS message handling (including data.get("is_group")) is delegated to
    # WebSocketHandler in gateway/ws_handlers/websocket.py

    # ── Static method wrappers for source-level test compatibility ─────────

    @staticmethod
    def _idempotency_key(request: web.Request, body: dict[str, Any]) -> str:
        from codex_pro.gateway.http_handlers.base import idempotency_key
        return idempotency_key(request, body)

    @staticmethod
    def _idempotency_fingerprint(body: dict[str, Any]) -> str:
        from codex_pro.gateway.http_handlers.base import idempotency_fingerprint
        return idempotency_fingerprint(body)

    @staticmethod
    def _is_loopback_peer(request: web.Request) -> bool:
        from codex_pro.gateway.http_handlers.base import is_loopback_peer
        return is_loopback_peer(request)
