"""Provider management API — CRUD and health for LLM providers."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any

import yaml
from aiohttp import web

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer

from codex_pro.config.schema import ProviderConfig
from codex_pro.models.providers import create_provider, validate_provider_config


class ProvidersAPI:
    """RESTful provider management backed by the live config."""

    def __init__(self, server: "GatewayServer"):
        self._server = server

    def _guard(self, request: web.Request, action: str) -> web.Response | None:
        return self._server._require_admin_token(request, action=action)

    def _get_config(self):
        return getattr(getattr(self._server, "_agent_loop", None), "config", None)

    @staticmethod
    def _serialize_provider(pc: ProviderConfig) -> dict[str, Any]:
        """Return provider dict with all secrets masked."""
        return {
            "name": pc.name,
            "api_key": "",           # never expose the real key on GET
            "api_key_env": pc.api_key_env,
            "api_base": pc.api_base,
            "models": list(pc.models),
            "extra_headers": dict(pc.extra_headers),
            "max_retries": pc.max_retries,
            "timeout_seconds": pc.timeout_seconds,
            "stream_include_usage": pc.stream_include_usage,
            "rate_limit_rpm": pc.rate_limit_rpm,
            "credential_pool": [],   # never expose the pool
        }

    # ── list / get ────────────────────────────────────────────────────────────

    async def list_providers(self, request: web.Request) -> web.Response:
        guard = self._guard(request, "providers_list")
        if guard is not None:
            return guard
        config = self._get_config()
        if config is None:
            return web.json_response({"error": "config not available"}, status=500)
        providers = [self._serialize_provider(pc) for pc in config.models.providers]
        return web.json_response({"providers": providers})

    async def get_provider(self, request: web.Request) -> web.Response:
        guard = self._guard(request, "providers_get")
        if guard is not None:
            return guard
        name = request.match_info["name"]
        config = self._get_config()
        if config is None:
            return web.json_response({"error": "config not available"}, status=500)
        for pc in config.models.providers:
            if pc.name.lower() == name.lower():
                return web.json_response(self._serialize_provider(pc))
        return web.json_response({"error": f"provider '{name}' not found"}, status=404)

    # ── create ────────────────────────────────────────────────────────────────

    async def create_provider(self, request: web.Request) -> web.Response:
        guard = self._guard(request, "providers_create")
        if guard is not None:
            return guard
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        if not isinstance(body, dict):
            return web.json_response({"error": "body must be a JSON object"}, status=400)
        try:
            pc = ProviderConfig(**body)
        except Exception as exc:
            return web.json_response({"error": f"validation failed: {exc}"}, status=400)
        try:
            validate_provider_config(pc)
        except ValueError as exc:
            return web.json_response({"error": str(exc)}, status=400)
        config = self._get_config()
        if config is None:
            return web.json_response({"error": "config not available"}, status=500)
        for existing in config.models.providers:
            if existing.name.lower() == pc.name.lower():
                return web.json_response({"error": f"provider '{pc.name}' already exists"}, status=409)
        target = self._config_path()
        raw: dict[str, Any] = {}
        if target.exists():
            try:
                loaded = yaml.safe_load(target.read_text(encoding="utf-8")) or {}
                if not isinstance(loaded, dict):
                    raise ValueError("root must be a mapping")
                raw = loaded
            except Exception as exc:
                return web.json_response({"error": f"cannot read config: {exc}"}, status=409)
        models_section = raw.setdefault("models", {})
        providers_list = models_section.setdefault("providers", [])
        providers_list.append({
            "name": pc.name,
            "api_key": pc.api_key,
            "api_key_env": pc.api_key_env,
            "api_base": pc.api_base,
            "models": list(pc.models),
            "extra_headers": dict(pc.extra_headers),
            "max_retries": pc.max_retries,
            "timeout_seconds": pc.timeout_seconds,
            "stream_include_usage": pc.stream_include_usage,
            "rate_limit_rpm": pc.rate_limit_rpm,
        })
        from codex_pro.config.loader import save_config
        try:
            save_config(raw, target)
        except OSError as exc:
            return web.json_response({"error": f"save failed: {exc}"}, status=500)
        await self._server.web_ws.broadcast(
            "config_updated", {"paths": ["models.providers"], "restart_required": True}
        )
        return web.json_response(
            {"success": True, "name": pc.name, "restart_required": True}, status=201
        )

    # ── delete ────────────────────────────────────────────────────────────────

    async def delete_provider(self, request: web.Request) -> web.Response:
        guard = self._guard(request, "providers_delete")
        if guard is not None:
            return guard
        name = request.match_info["name"]
        config = self._get_config()
        if config is None:
            return web.json_response({"error": "config not available"}, status=500)
        new_count = sum(1 for pc in config.models.providers if pc.name.lower() != name.lower())
        if new_count == len(config.models.providers):
            return web.json_response({"error": f"provider '{name}' not found"}, status=404)
        target = self._config_path()
        raw: dict[str, Any] = {}
        if target.exists():
            try:
                loaded = yaml.safe_load(target.read_text(encoding="utf-8")) or {}
                if not isinstance(loaded, dict):
                    raise ValueError("root must be a mapping")
                raw = loaded
            except Exception as exc:
                return web.json_response({"error": f"cannot read config: {exc}"}, status=409)
        providers_list = raw.get("models", {}).get("providers", [])
        raw.setdefault("models", {})["providers"] = [
            p for p in providers_list if p.get("name", "").lower() != name.lower()
        ]
        from codex_pro.config.loader import save_config
        try:
            save_config(raw, target)
        except OSError as exc:
            return web.json_response({"error": f"save failed: {exc}"}, status=500)
        await self._server.web_ws.broadcast(
            "config_updated", {"paths": ["models.providers"], "restart_required": True}
        )
        return web.json_response({"success": True, "name": name, "restart_required": True})

    # ── update (PATCH) ──────────────────────────────────────────────────────

    async def update_provider(self, request: web.Request) -> web.Response:
        """Partially update a provider's mutable fields."""
        guard = self._guard(request, "providers_update")
        if guard is not None:
            return guard
        name = request.match_info["name"]
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        if not isinstance(body, dict):
            return web.json_response({"error": "body must be a JSON object"}, status=400)
        # Fields allowed to change; everything else is read-only
        _ALLOWED = {
            "api_base", "api_key", "api_key_env", "models",
            "extra_headers", "max_retries", "timeout_seconds",
            "stream_include_usage", "rate_limit_rpm",
        }
        updates = {k: v for k, v in body.items() if k in _ALLOWED}
        if not updates:
            return web.json_response({"error": "no updatable fields provided"}, status=400)
        config = self._get_config()
        if config is None:
            return web.json_response({"error": "config not available"}, status=500)
        target: ProviderConfig | None = None
        for pc in config.models.providers:
            if pc.name.lower() == name.lower():
                target = pc
                break
        if target is None:
            return web.json_response({"error": f"provider '{name}' not found"}, status=404)
        # Rebuild a minimal ProviderConfig from the union of current + updates,
        # then validate so we catch invalid values before writing.
        merged: dict[str, Any] = target.model_dump(mode="json")
        merged.update(updates)
        try:
            validated = ProviderConfig(**merged)
        except Exception as exc:
            return web.json_response({"error": f"validation failed: {exc}"}, status=400)
        try:
            validate_provider_config(validated)
        except ValueError as exc:
            return web.json_response({"error": str(exc)}, status=400)
        target = self._config_path()
        raw: dict[str, Any] = {}
        if target.exists():
            try:
                loaded = yaml.safe_load(target.read_text(encoding="utf-8")) or {}
                if not isinstance(loaded, dict):
                    raise ValueError("root must be a mapping")
                raw = loaded
            except Exception as exc:
                return web.json_response({"error": f"cannot read config: {exc}"}, status=409)
        providers_list = raw.setdefault("models", {}).setdefault("providers", [])
        for entry in providers_list:
            if entry.get("name", "").lower() == name.lower():
                for k, v in validated.model_dump(mode="json").items():
                    if k in _ALLOWED:
                        entry[k] = v
                break
        from codex_pro.config.loader import save_config
        try:
            save_config(raw, target)
        except OSError as exc:
            return web.json_response({"error": f"save failed: {exc}"}, status=500)
        await self._server.web_ws.broadcast(
            "config_updated", {"paths": ["models.providers"], "restart_required": True}
        )
        return web.json_response({"success": True, "name": name, "restart_required": True})

    # ── rename ──────────────────────────────────────────────────────────────

    async def rename_provider(self, request: web.Request) -> web.Response:
        """Rename a provider (changes its key in routes as well)."""
        guard = self._guard(request, "providers_rename")
        if guard is not None:
            return guard
        old_name = request.match_info["name"]
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        new_name = (body.get("name") or "").strip() if isinstance(body, dict) else ""
        if not new_name:
            return web.json_response({"error": "name is required"}, status=400)
        if new_name.lower() == old_name.lower():
            return web.json_response({"success": True, "restart_required": False})
        config = self._get_config()
        if config is None:
            return web.json_response({"error": "config not available"}, status=500)
        existing_names = {pc.name.lower() for pc in config.models.providers}
        if new_name.lower() in existing_names and new_name.lower() != old_name.lower():
            return web.json_response({"error": f"provider '{new_name}' already exists"}, status=409)
        target = self._config_path()
        raw: dict[str, Any] = {}
        if target.exists():
            try:
                loaded = yaml.safe_load(target.read_text(encoding="utf-8")) or {}
                if not isinstance(loaded, dict):
                    raise ValueError("root must be a mapping")
                raw = loaded
            except Exception as exc:
                return web.json_response({"error": f"cannot read config: {exc}"}, status=409)
        providers_list = raw.get("models", {}).get("providers", [])
        for entry in providers_list:
            if entry.get("name", "").lower() == old_name.lower():
                entry["name"] = new_name
                break
        # Also update route references
        routes = raw.get("models", {}).get("routes", [])
        for route in routes:
            if isinstance(route.get("provider"), str) and route["provider"].lower() == old_name.lower():
                route["provider"] = new_name
        from codex_pro.config.loader import save_config
        try:
            save_config(raw, target)
        except OSError as exc:
            return web.json_response({"error": f"save failed: {exc}"}, status=500)
        await self._server.web_ws.broadcast(
            "config_updated", {"paths": ["models.providers"], "restart_required": True}
        )
        return web.json_response({"success": True, "name": new_name, "restart_required": True})

    # ── test connection ───────────────────────────────────────────────────────

    async def test_provider(self, request: web.Request) -> web.Response:
        """Attempt a lightweight chat call to verify connectivity."""
        guard = self._guard(request, "providers_test")
        if guard is not None:
            return guard
        name = request.match_info["name"]
        config = self._get_config()
        if config is None:
            return web.json_response({"error": "config not available"}, status=500)
        target: ProviderConfig | None = None
        for pc in config.models.providers:
            if pc.name.lower() == name.lower():
                target = pc
                break
        if target is None:
            return web.json_response({"error": f"provider '{name}' not found"}, status=404)
        provider = None
        try:
            provider = create_provider(target)
            model = target.models[0] if target.models else ""
            resp = await provider.chat(
                messages=[{"role": "user", "content": "hi"}],
                model=model,
            )
            ok = resp.finish_reason != "error"
            return web.json_response({
                "ok": ok,
                "model": resp.model,
                "finish_reason": resp.finish_reason,
                "error": resp.content if not ok else "",
            })
        except Exception as exc:
            return web.json_response({"ok": False, "error": str(exc)})
        finally:
            if provider is not None:
                try:
                    await provider.aclose()
                except Exception:
                    pass

    # ── health ────────────────────────────────────────────────────────────────

    async def get_health(self, request: web.Request) -> web.Response:
        """Return health status for all configured providers."""
        guard = self._guard(request, "providers_health")
        if guard is not None:
            return guard
        router = getattr(getattr(self._server._agent_loop, "model_router", None), "_health", None)
        config = self._get_config()
        if config is None:
            return web.json_response({"error": "config not available"}, status=500)
        result: dict[str, Any] = {}
        for pc in config.models.providers:
            if not pc.name:
                continue
            health = router.get(pc.name) if router else None
            if health is not None:
                result[pc.name] = {
                    "status": health.status.value,
                    "failure_count": health.failure_count,
                    "last_error": health.last_error,
                    "cooldown_until": (
                        health.cooldown_until.isoformat() if health.cooldown_until else None
                    ),
                }
            else:
                result[pc.name] = {"status": "unknown", "failure_count": 0, "last_error": "", "cooldown_until": None}
        return web.json_response({"providers": result})

    def _config_path(self) -> Path:
        path = getattr(self._server, "_config_path", None)
        if path is not None:
            return Path(path)
        return Path(self._server._workspace) / "codex-pro.yaml"
