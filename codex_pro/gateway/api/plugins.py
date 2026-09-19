"""Plugin management API — list, info, and enable/disable plugins."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from aiohttp import web

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer


class PluginsAPI:
    def __init__(self, server: GatewayServer):
        self._server = server

    def _cfg(self):
        """Return the plugins config section from the root Config object.

        ``GatewayConfig`` has no ``plugins`` field; plugins lives on the root
        ``Config`` (``server._agent_loop.config`` in the real gateway).  Fall
        back to ``server._config.plugins`` only if that attribute exists.
        """
        agent_cfg = getattr(self._server._agent_loop, "config", None)
        if agent_cfg is not None and hasattr(agent_cfg, "plugins"):
            return agent_cfg.plugins
        if hasattr(self._server._config, "plugins"):
            return self._server._config.plugins
        raise AttributeError("no plugins config found")

    def _workspace(self) -> Path:
        return self._server._workspace

    def _unavailable(self) -> web.Response | None:
        """403 when plugin system is disabled."""
        if not self._cfg().enabled:
            return web.json_response(
                {"error": "plugin system is disabled (plugins.enabled=false)"},
                status=403,
            )
        return None

    def _guard(self, request: web.Request, action: str) -> web.Response | None:
        return self._server._require_api_token(request, action=action)

    def _admin_guard(self, request: web.Request, action: str) -> web.Response | None:
        return self._server._require_admin_token(request, action=action)

    def _discover(self):
        from codex_pro.plugins.loader import discover_all

        return discover_all(
            workspace=self._workspace(),
            extra_dirs=self._cfg().extra_dirs,
        )

    def _status_map(self, records) -> dict[str, str]:
        """Return {name: status} using current config allow/deny lists."""
        deny = set(self._cfg().deny)
        allow = set(self._cfg().allow)
        out: dict[str, str] = {}
        for r in records:
            name = r.manifest.name
            if name in deny:
                out[name] = "disabled"
            elif allow and name not in allow:
                out[name] = "filtered"
            else:
                out[name] = "available"
        return out

    async def list_plugins(self, request: web.Request) -> web.Response:
        guard = self._guard(request, "plugins_list")
        if guard is not None:
            return guard
        unavailable = self._unavailable()
        if unavailable is not None:
            return unavailable

        records = self._discover()
        status_map = self._status_map(records)
        results = []
        for r in records:
            m = r.manifest
            results.append({
                "name": m.name,
                "version": m.version,
                "description": m.description or "",
                "source": r.source,
                "path": str(r.path) if r.path else None,
                "status": status_map.get(m.name, "unknown"),
                "provides_tools": list(m.provides.tools),
                "provides_hooks": list(m.provides.hooks),
                "depends_on": list(m.depends_on),
            })
        results.sort(key=lambda x: x["name"])
        return web.json_response({"plugins": results})

    async def get_plugin(self, request: web.Request) -> web.Response:
        guard = self._guard(request, "plugins_get")
        if guard is not None:
            return guard
        unavailable = self._unavailable()
        if unavailable is not None:
            return unavailable

        name = request.match_info["name"]
        records = self._discover()
        r = next((rec for rec in records if rec.manifest.name == name), None)
        if r is None:
            return web.json_response({"error": f"plugin '{name}' not found"}, status=404)

        from codex_pro.plugins.manifest import check_required_env

        missing = check_required_env(r.manifest)
        status_map = self._status_map(records)
        return web.json_response({
            "name": r.manifest.name,
            "version": r.manifest.version,
            "description": r.manifest.description,
            "author": r.manifest.author,
            "kind": r.manifest.kind,
            "source": r.source,
            "path": str(r.path) if r.path else None,
            "requires_env": list(r.manifest.requires_env),
            "missing_env": list(missing),
            "provides_tools": list(r.manifest.provides.tools),
            "provides_hooks": list(r.manifest.provides.hooks),
            "depends_on": list(r.manifest.depends_on),
            "status": status_map.get(r.manifest.name, "unknown"),
        })

    async def toggle_plugin(self, request: web.Request) -> web.Response:
        guard = self._admin_guard(request, "plugins_toggle")
        if guard is not None:
            return guard
        unavailable = self._unavailable()
        if unavailable is not None:
            return unavailable

        from codex_pro.config.loader import resolve_config_file

        name = request.match_info["name"]
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        enable = body.get("enabled", False) if isinstance(body, dict) else True

        config_file = resolve_config_file(None, search_dir=self._workspace())
        if config_file is None or not config_file.exists():
            return web.json_response(
                {"error": "No config file found"}, status=500
            )

        import yaml as _yaml

        content = config_file.read_text(encoding="utf-8")
        data = _yaml.safe_load(content) or {}

        plugins_section = data.setdefault("plugins", {})
        deny_list = plugins_section.setdefault("deny", [])
        allow_list = plugins_section.get("allow") or []

        if enable:
            changed = False
            if name in deny_list:
                deny_list.remove(name)
                changed = True
            if allow_list and name not in allow_list:
                allow_list.append(name)
                plugins_section["allow"] = allow_list
                changed = True
            if not changed:
                return web.json_response(
                    {"success": True, "plugin": name, "enabled": True, "changed": False}
                )
        else:
            if name not in deny_list:
                deny_list.append(name)
                changed = True
            else:
                return web.json_response(
                    {"success": True, "plugin": name, "enabled": False, "changed": False}
                )

        config_file.write_text(
            _yaml.dump(data, default_flow_style=False, allow_unicode=True),
            encoding="utf-8",
        )
        await self._server.web_ws.broadcast(
            "plugin_changed",
            {"name": name, "enabled": enable},
        )
        return web.json_response(
            {"success": True, "plugin": name, "enabled": enable, "changed": True}
        )


def register_plugin_api_routes(app: web.Application, prefix: str, server: GatewayServer) -> None:
    api = PluginsAPI(server)
    app.router.add_get(f"{prefix}/plugins", api.list_plugins)
    app.router.add_get(f"{prefix}/plugins/{{name}}", api.get_plugin)
    app.router.add_post(f"{prefix}/plugins/{{name}}/toggle", api.toggle_plugin)
