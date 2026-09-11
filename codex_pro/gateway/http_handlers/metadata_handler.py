"""Metadata HTTP handlers — health, meta, capabilities, stats, playground.

Extracted from gateway/server.py for improved modularity.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any
from aiohttp import web

from codex_pro.gateway.http_handlers.base import playground_path, resolve_web_dir

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer


class MetadataHandlers:
    """Stateless metadata endpoint handlers."""

    def __init__(self, server: GatewayServer):
        self._server = server

    async def handle_playground(self, request: web.Request) -> web.Response:
        path = playground_path()
        if path.exists():
            return web.FileResponse(path)
        return web.Response(text="Gateway playground not found.", status=404)

    async def handle_meta(self, request: web.Request) -> web.Response:
        """Bootstrap metadata for the dashboard SPA.

        No authentication required — the frontend needs this before it has a
        token. Exposed at a fixed path (/meta) so the SPA can locate the real
        API prefix without hardcoding it.
        """
        from codex_pro import __version__

        return web.json_response(
            {
                "api_prefix": self._server._config.api_prefix,
                "ws_path": "/ws/web",
                "version": __version__,
                "auth_required": self._server._tokens_configured(),
            }
        )

    async def handle_capabilities(self, request: web.Request) -> web.Response:
        """What the *calling token* is allowed to do.

        The dashboard mixes api-token and admin-token endpoints on the same page
        (knowledge upload/delete, config, memory writes). Without this the UI can
        only discover the boundary by firing a request and reading a 403, so it
        rendered enabled buttons that were guaranteed to fail. Reporting the
        caller's own scope lets those affordances be disabled up front with an
        explanation.

        Deliberately reports only booleans about the presented token — never the
        configured tokens or whether any exist beyond what the caller's own scope
        already tells them.

        ``auth_required`` says whether this deployment authenticates at all. The
        dashboard needs it because it treated ``!!token`` as "logged in": in the
        officially supported open / no-token mode (see auth.authenticate_token,
        which accepts every request when no token is configured) an empty token
        is *correct*, yet Layout bounced it to /login, Login's probe succeeded
        and navigated back to /, and Layout bounced it again — a redirect loop
        out of which only typing a nonsense non-empty token could escape.
        Reporting the fact server-side is what lets the UI stop guessing."""
        from codex_pro.gateway.http_handlers.base import require_api_token

        guard = require_api_token(
            request, self._server.auth, self._server._tokens_configured(),
            action="capabilities",
        )
        if guard is not None:
            return guard
        # Mirrors _require_admin_token's own resolution order, including the
        # unauthenticated-deployment case (no tokens configured at all → every
        # caller is effectively admin), so the UI never disables a control the
        # server would in fact allow.
        admin_configured = bool(self._server._config.auth.admin_tokens or self._server._config.auth.api_tokens)
        if not admin_configured:
            is_admin = True
        else:
            is_admin = self._server.auth.authenticate_admin_token(
                self._server.auth.token_from_headers(request.headers)
            )
        return web.json_response(
            {
                "admin": is_admin,
                "authRequired": self._server._tokens_configured(),
            }
        )

    async def handle_stats(self, request: web.Request) -> web.Response:
        from codex_pro.gateway.http_handlers.base import require_api_token

        guard = require_api_token(
            request, self._server.auth, self._server._tokens_configured(),
            action="stats",
        )
        if guard is not None:
            return guard
        # ws_clients is now part of health.check() itself, so no need to re-add it.
        health_data = await self._server.health.check()
        return web.json_response(health_data)

    async def handle_health(self, request: web.Request) -> web.Response:
        status = await self._server.health.check()
        code = 200 if status["status"] != "unhealthy" else 503
        return web.json_response(status, status=code)

    async def handle_web_ui(self, request: web.Request) -> web.Response:
        """Serve the web UI SPA with fallback to index.html for client-side routing."""
        web_dir = resolve_web_dir()
        if web_dir is None:
            return await self.handle_playground(request)

        req_path = request.match_info.get("path", "")
        if req_path:
            file_path = web_dir / req_path
            # Prevent path traversal
            try:
                file_path = file_path.resolve()
                if file_path.is_file() and str(file_path).startswith(str(web_dir.resolve())):
                    return web.FileResponse(file_path)
            except (OSError, ValueError):
                # Invalid/unresolvable asset paths deliberately fall through to
                # the SPA index without exposing filesystem error details.
                pass
        # SPA fallback — serve index.html for all unmatched paths
        return web.FileResponse(web_dir / "index.html")
