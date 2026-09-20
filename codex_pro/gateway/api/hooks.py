"""User-configured lifecycle hooks API — list/create/update/delete/toggle.

Operators define hooks from the dashboard that run a command or inject a
prompt when a task lifecycle event fires. These are *user data* persisted as
JSON records in the workspace's runtime dir, and are distinct from the
code-native hook registries elsewhere in the codebase:

- ``codex_pro/plugins/hooks.py`` — lifecycle hooks registered *by plugins*
  (``plugins.hooks.register``/``dispatch``). Not user-editable.
- ``codex_pro/gateway/hooks.py`` — gateway event hooks loaded from a scripts
  directory (``gateway.hooks_dir``). Also not user-editable from the UI.

This module manages the third, dashboard-facing kind: a small set of records
the user creates and edits through the Hooks settings page. It only stores and
serves the configuration — it does not execute the hooks. The execution seam is
left for a future runtime; wiring a stored hook into the agent pipeline is out
of scope for the settings surface.
"""

from __future__ import annotations

import json
import os
import re
import uuid
from pathlib import Path
from typing import TYPE_CHECKING, Any

from aiohttp import web

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer

# The lifecycle events a hook can be bound to. Sorted; matches the selector in
# the dashboard's new-hook form and the design prototype.
HOOK_EVENTS: frozenset[str] = frozenset({
    "PreToolUse",
    "PostToolUse",
    "UserPromptSubmit",
    "PermissionRequest",
    "Stop",
    "SessionStart",
    "SessionEnd",
})

# How the hook body is interpreted.
RUN_MODES: frozenset[str] = frozenset({"process", "prompt"})

# A display name must be safe to embed in UI copy. No control characters.
_NAME_RE = re.compile(r"^[^\r\n]{0,80}$")


class HookStore:
    """JSON-backed store for user hook records.

    Lays the records in ``<workspace>/.codex-pro/hooks.json`` — the same
    workspace runtime dir the gateway uses for its endpoint file. Writes are
    atomic (temp file + ``os.replace``) so a concurrent reader never observes a
    half-written document.
    """

    def __init__(self, workspace: Path):
        self._path = workspace / ".codex-pro" / "hooks.json"

    def _load(self) -> list[dict[str, Any]]:
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return []
        except (OSError, ValueError):
            # Corrupt file should not take the API down; treat as empty so the
            # dashboard shows a recoverable empty list rather than a 500.
            return []
        if not isinstance(data, list):
            return []
        return [d for d in data if isinstance(d, dict)]

    def _save(self, hooks: list[dict[str, Any]]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(".json.tmp")
        tmp.write_text(
            json.dumps(hooks, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(tmp, self._path)

    def list_all(self) -> list[dict[str, Any]]:
        return self._load()

    def get(self, hook_id: str) -> dict[str, Any] | None:
        for h in self._load():
            if h.get("id") == hook_id:
                return h
        return None

    def create(self, hook: dict[str, Any]) -> dict[str, Any]:
        hooks = self._load()
        hooks.append(hook)
        self._save(hooks)
        return hook

    def update(self, hook_id: str, changes: dict[str, Any]) -> dict[str, Any] | None:
        hooks = self._load()
        for i, h in enumerate(hooks):
            if h.get("id") == hook_id:
                h = {**h, **changes}
                hooks[i] = h
                self._save(hooks)
                return h
        return None

    def delete(self, hook_id: str) -> bool:
        hooks = self._load()
        new_hooks = [h for h in hooks if h.get("id") != hook_id]
        if len(new_hooks) == len(hooks):
            return False
        self._save(new_hooks)
        return True


def _normalize_hook_fields(
    body: dict[str, Any],
    *,
    require_command: bool = True,
) -> tuple[dict[str, Any] | None, str | None]:
    """Validate and normalize a hook payload into storage shape.

    Returns ``(payload, None)`` on success or ``(None, error_message)`` on a
    validation failure, where ``error_message`` is a user-facing string.
    """
    event = str(body.get("event", "")).strip()
    run_mode = str(body.get("run_mode", body.get("runMode", ""))).strip()
    scope = str(body.get("scope", "用户")).strip() or "用户"
    command = str(body.get("command", "")).strip()

    if event not in HOOK_EVENTS:
        return None, f"invalid hook event: '{event}'"
    if run_mode not in RUN_MODES:
        return None, f"invalid run mode: '{run_mode}'"
    if not _NAME_RE.match(scope):
        return None, "invalid hook scope"

    if require_command and not command:
        return None, "hook command is required"

    name = str(body.get("name", "") or "").strip()
    if not _NAME_RE.match(name):
        return None, "invalid hook name"

    return {
        "event": event,
        "run_mode": run_mode,
        "scope": scope,
        "command": command,
        "name": name,
    }, None


class HooksAPI:
    def __init__(self, server: GatewayServer):
        self._server = server

    def _store(self) -> HookStore:
        return HookStore(self._server._workspace)

    def _guard(self, request: web.Request, action: str) -> web.Response | None:
        return self._server._require_api_token(request, action=action)

    def _admin_guard(self, request: web.Request, action: str) -> web.Response | None:
        # Every mutation is admin-tier: hooks can run commands on lifecycle
        # events, so creating/editing one changes what the agent will execute
        # unattended. Same rationale as the cron guard.
        return self._server._require_admin_token(request, action=action)

    def _to_public(self, hook: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": hook.get("id"),
            "name": hook.get("name", ""),
            "event": hook.get("event"),
            "run_mode": hook.get("run_mode"),
            "scope": hook.get("scope"),
            "command": hook.get("command"),
            "enabled": bool(hook.get("enabled", True)),
        }

    async def list_hooks(self, request: web.Request) -> web.Response:
        guard = self._guard(request, "hooks_list")
        if guard is not None:
            return guard

        hooks = self._store().list_all()
        results = [self._to_public(h) for h in hooks]
        results.sort(key=lambda h: (h["event"], h["name"] or h["id"]))
        enabled = sum(1 for h in results if h["enabled"])
        return web.json_response({"hooks": results, "total": len(results), "enabled": enabled})

    async def create_hook(self, request: web.Request) -> web.Response:
        guard = self._admin_guard(request, "hooks_create")
        if guard is not None:
            return guard

        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        if not isinstance(body, dict):
            return web.json_response({"error": "invalid JSON body"}, status=400)

        fields, error = _normalize_hook_fields(body)
        if error is not None:
            return web.json_response({"error": error}, status=400)

        hook = {
            "id": uuid.uuid4().hex,
            "enabled": True,
            **fields,
        }
        self._store().create(hook)
        return web.json_response({"hook": self._to_public(hook)}, status=201)

    async def update_hook(self, request: web.Request) -> web.Response:
        guard = self._admin_guard(request, "hooks_update")
        if guard is not None:
            return guard

        hook_id = request.match_info["id"]
        store = self._store()
        if store.get(hook_id) is None:
            return web.json_response({"error": "not found"}, status=404)

        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        if not isinstance(body, dict):
            return web.json_response({"error": "invalid JSON body"}, status=400)

        # An update must keep a command just like create, so require it on the
        # merged payload. Fields the client omitted keep their stored value.
        merged = {**store.get(hook_id), **body}
        fields, error = _normalize_hook_fields(merged)
        if error is not None:
            return web.json_response({"error": error}, status=400)

        updated = store.update(hook_id, fields)
        if updated is None:
            return web.json_response({"error": "not found"}, status=404)
        return web.json_response({"hook": self._to_public(updated)})

    async def delete_hook(self, request: web.Request) -> web.Response:
        guard = self._admin_guard(request, "hooks_delete")
        if guard is not None:
            return guard

        hook_id = request.match_info["id"]
        if not self._store().delete(hook_id):
            return web.json_response({"error": "not found"}, status=404)
        return web.json_response({"status": "deleted"})

    async def toggle_hook(self, request: web.Request) -> web.Response:
        guard = self._admin_guard(request, "hooks_toggle")
        if guard is not None:
            return guard

        hook_id = request.match_info["id"]
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        enable = bool(body.get("enabled")) if isinstance(body, dict) else True

        updated = self._store().update(hook_id, {"enabled": enable})
        if updated is None:
            return web.json_response({"error": "not found"}, status=404)
        return web.json_response({"hook": self._to_public(updated)})


def register_hook_api_routes(app: web.Application, prefix: str, server: GatewayServer) -> None:
    api = HooksAPI(server)
    app.router.add_get(f"{prefix}/hooks", api.list_hooks)
    app.router.add_post(f"{prefix}/hooks", api.create_hook)
    app.router.add_put(f"{prefix}/hooks/{{id}}", api.update_hook)
    app.router.add_delete(f"{prefix}/hooks/{{id}}", api.delete_hook)
    app.router.add_post(f"{prefix}/hooks/{{id}}/toggle", api.toggle_hook)
