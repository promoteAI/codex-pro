"""Worker profile (agent) CRUD API — dashboard-facing dynamic registry.

This is the user-facing surface behind the Composer's "Add agent" menu. It
persists runtime worker profiles as JSON records in the workspace runtime dir
(``.codex-pro/worker_profiles.json``) so the ``WorkerRegistry`` — and therefore
``delegate_task`` — can pick them up live without editing YAML or restarting.

The config-file profiles under ``multi_agent.worker_profiles`` (``coder``,
``researcher``, ... in the packaged defaults) are NOT managed here; they remain
a bootstrap source. This API manages the *runtime* additions, which the
registry merges on top of the configured ones.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import TYPE_CHECKING, Any

from aiohttp import web

from codex_pro.agent.multi_agent.store import WorkerProfileStore

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer

# A profile id must be URL-safe and stable (used in the path and by
# delegate_task's ``worker_profile`` reference).
_ID_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")
# Validation limits mirroring the config schema's reasonable bounds.
_MAX_NAME_CHARS = 80
_MAX_DESC_CHARS = 500


class AgentsAPI:
    def __init__(self, server: "GatewayServer"):
        self._server = server

    def _store(self) -> WorkerProfileStore:
        return WorkerProfileStore(Path(self._server._workspace))

    def _unavailable(self) -> web.Response | None:
        # Multi-agent delegation gates the registry; without it profiles have
        # nowhere to flow. Report a clear 503 instead of a silent 200 empty list.
        loop = getattr(self._server, "_agent_loop", None)
        config = getattr(loop, "config", None) if loop is not None else None
        if config is None or not getattr(config.multi_agent, "enabled", True):
            return web.json_response(
                {"error": "multi-agent delegation is disabled (multi_agent.enabled=false)"},
                status=503,
            )
        return None

    def _guard(self, request: web.Request, action: str) -> web.Response | None:
        return self._server._require_api_token(request, action=action)

    def _admin_guard(self, request: web.Request, action: str) -> web.Response | None:
        # Every mutation changes what an agent can execute unattended, so they
        # are admin-tier (same rationale as the hooks/cron guards).
        return self._server._require_admin_token(request, action=action)

    @staticmethod
    def _to_public(record: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": record.get("id"),
            "name": record.get("name", ""),
            "description": record.get("description", ""),
            "instructions": record.get("instructions", ""),
            "default_tools": list(record.get("default_tools") or []),
            "model": record.get("model", ""),
            "provider": record.get("provider", ""),
            "max_iterations": int(record.get("max_iterations", 12)),
            "max_tokens": int(record.get("max_tokens", 8192)),
            "temperature": float(record.get("temperature", 0.4)),
        }

    @staticmethod
    def _normalize(body: dict[str, Any], *, require_id: bool) -> dict[str, Any] | None:
        """Validate a worker profile payload into store shape.

        Returns ``(payload, None)`` on success or ``(None, error_message)`` on
        a validation failure.
        """
        profile_id = str(body.get("id", "")).strip()
        name = str(body.get("name", "")).strip()
        description = str(body.get("description", "")).strip()
        instructions = str(body.get("instructions", "")).strip()

        if require_id:
            if not profile_id or not _ID_RE.match(profile_id):
                return None, "invalid profile id (letters/digits/._-, max 64 chars)"
        elif profile_id and not _ID_RE.match(profile_id):
            return None, "invalid profile id"

        if not name:
            return None, "profile name is required"
        if len(name) > _MAX_NAME_CHARS:
            return None, "profile name is too long"
        if len(description) > _MAX_DESC_CHARS:
            return None, "profile description is too long"

        raw_tools = body.get("default_tools") or []
        if not isinstance(raw_tools, list):
            return None, "default_tools must be a list"
        tools = [str(t) for t in raw_tools if str(t)]

        model = str(body.get("model", "")).strip()
        provider = str(body.get("provider", "")).strip()

        try:
            max_iterations = int(body.get("max_iterations", 12))
            max_tokens = int(body.get("max_tokens", 8192))
            temperature = float(body.get("temperature", 0.4))
        except (TypeError, ValueError):
            return None, "invalid numeric field"
        if max_iterations < 1:
            return None, "max_iterations must be >= 1"
        if max_tokens < 1:
            return None, "max_tokens must be >= 1"
        if not (0.0 <= temperature <= 2.0):
            return None, "temperature must be between 0 and 2"

        return {
            "id": profile_id,
            "name": name,
            "description": description,
            "instructions": instructions,
            "default_tools": tools,
            "model": model,
            "provider": provider,
            "max_iterations": max_iterations,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }, None

    async def list_agents(self, request: web.Request) -> web.Response:
        guard = self._guard(request, "agents_list")
        if guard is not None:
            return guard
        unavailable = self._unavailable()
        if unavailable is not None:
            return unavailable

        store = self._store()
        records = [self._to_public(r) for r in store.list_records()]
        records.sort(key=lambda a: (a["name"] or a["id"] or ""))
        return web.json_response({"agents": records, "total": len(records)})

    async def create_agent(self, request: web.Request) -> web.Response:
        guard = self._admin_guard(request, "agents_create")
        if guard is not None:
            return guard
        unavailable = self._unavailable()
        if unavailable is not None:
            return unavailable

        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        if not isinstance(body, dict):
            return web.json_response({"error": "invalid JSON body"}, status=400)

        payload, error = self._normalize(body, require_id=True)
        if error is not None:
            return web.json_response({"error": error}, status=400)

        store = self._store()
        if store.get_record(payload["id"]) is not None:
            return web.json_response({"error": "agent already exists"}, status=409)

        store.create(payload)
        return web.json_response({"agent": self._to_public(payload)}, status=201)

    async def update_agent(self, request: web.Request) -> web.Response:
        guard = self._admin_guard(request, "agents_update")
        if guard is not None:
            return guard
        unavailable = self._unavailable()
        if unavailable is not None:
            return unavailable

        agent_id = request.match_info["id"]
        store = self._store()
        if store.get_record(agent_id) is None:
            return web.json_response({"error": "not found"}, status=404)

        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        if not isinstance(body, dict):
            return web.json_response({"error": "invalid JSON body"}, status=400)

        # Id is fixed by the path; keep any stored id. Fill in omitted fields
        # from the stored record so a partial update validates cleanly.
        merged = {**store.get_record(agent_id), **body, "id": agent_id}
        payload, error = self._normalize(merged, require_id=True)
        if error is not None:
            return web.json_response({"error": error}, status=400)

        updated = store.upsert(agent_id, payload)
        return web.json_response({"agent": self._to_public(updated)})

    async def delete_agent(self, request: web.Request) -> web.Response:
        guard = self._admin_guard(request, "agents_delete")
        if guard is not None:
            return guard

        agent_id = request.match_info["id"]
        if not self._store().delete(agent_id):
            return web.json_response({"error": "not found"}, status=404)
        return web.json_response({"status": "deleted"})


def register_agent_api_routes(app: web.Application, prefix: str, server: "GatewayServer") -> None:
    api = AgentsAPI(server)
    app.router.add_get(f"{prefix}/agents", api.list_agents)
    app.router.add_post(f"{prefix}/agents", api.create_agent)
    app.router.add_put(f"{prefix}/agents/{{id}}", api.update_agent)
    app.router.add_delete(f"{prefix}/agents/{{id}}", api.delete_agent)
