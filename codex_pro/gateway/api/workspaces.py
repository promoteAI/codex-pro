"""Workspace listing endpoint for multi-workspace support.

Exposes the live set of workspaces registered in the gateway process so the
frontend can render a workspace switcher / list. Each entry carries the
``workspace_key`` (identity-or-path) and ``workspace_path``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from aiohttp import web

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer


class WorkspaceAPI:
    def __init__(self, server: GatewayServer):
        self._server = server

    def _guard(self, request: web.Request, action: str) -> web.Response | None:
        return self._server._require_api_token(request, action=action)

    async def list_workspaces(self, request: web.Request) -> web.Response:
        guard = self._guard(request, "workspaces")
        if guard is not None:
            return guard

        registry = getattr(self._server, "workspace_registry", None)
        entries = registry.list() if registry is not None else []
        return web.json_response({
            "workspaces": [
                {"workspace_key": e.workspace_key, "workspace_path": e.workspace_path}
                for e in entries
            ]
        })
