"""Session HTTP handlers — list sessions, reset session, pair generate/verify.

Extracted from gateway/server.py for improved modularity.
"""
from __future__ import annotations

from typing import TYPE_CHECKING
from aiohttp import web

from codex_pro.gateway.http_handlers.base import require_admin_token, require_api_token

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer


class SessionHandlers:
    """Session-related endpoint handlers."""

    def __init__(self, server: GatewayServer):
        self._server = server

    async def handle_list_sessions(self, request: web.Request) -> web.Response:
        guard = require_admin_token(
            request, self._server.auth,
            self._server._config.auth.admin_tokens or self._server._config.auth.api_tokens,
            action="list_sessions",
        )
        if guard is not None:
            return guard
        list_sessions = getattr(self._server.session_manager, "list_sessions_async", None)
        sessions = await list_sessions() if list_sessions else self._server.session_manager.list_sessions()
        gateway_sessions = [s for s in sessions if s.get("key", "").startswith("gateway:")]
        return web.json_response({"sessions": gateway_sessions})

    async def handle_reset_session(self, request: web.Request) -> web.Response:
        guard = require_admin_token(
            request, self._server.auth,
            self._server._config.auth.admin_tokens or self._server._config.auth.api_tokens,
            action="reset_session",
        )
        if guard is not None:
            return guard
        key = request.match_info["key"]
        await self._server._reset_session_if_needed(key, force=True)
        return web.json_response({"status": "reset", "session_key": key})

    async def handle_pair_generate(self, request: web.Request) -> web.Response:
        guard = require_api_token(
            request, self._server.auth, self._server._tokens_configured(),
            action="pair_generate",
        )
        if guard is not None:
            return guard
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)

        if not body.get("platform", ""):
            return web.json_response({"error": "platform required"}, status=400)
        # Folded with the same rule as /message and the WS handshake. The approved
        # -users store is keyed by platform (auth.py, {platform}_approved.json), so
        # pairing under the raw name while messages arrive under the folded one
        # would file the approval where is_authorized never looks — the client
        # would pair successfully and still be rejected.
        platform = self._server._normalize_platform(body.get("platform"))

        code = self._server.auth.generate_pairing_code(platform)
        return web.json_response({"code": code, "ttl_seconds": self._server._config.auth.pairing_ttl_seconds})

    async def handle_pair_verify(self, request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)

        user_id = body.get("user_id", "")
        code = body.get("code", "")

        if not all([body.get("platform", ""), user_id, code]):
            return web.json_response({"error": "platform, user_id, code required"}, status=400)
        # Same fold as pair_generate, so verify looks up the code under the key it
        # was issued with.
        platform = self._server._normalize_platform(body.get("platform"))

        if self._server.auth.verify_pairing(platform, user_id, code):
            await self._server.hooks.emit("auth_success", platform=platform, user_id=user_id)
            return web.json_response({"status": "paired"})
        else:
            await self._server.hooks.emit("auth_failed", platform=platform, user_id=user_id)
            return web.json_response({"error": "invalid or expired code"}, status=403)
