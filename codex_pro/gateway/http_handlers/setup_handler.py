"""First-run setup endpoints for the desktop shell.

Exposes the provider catalog and writes model config into the shared
codex-pro.yaml (the same file the CLI reads and writes). Field names MUST be
snake_case to match the schema (ProviderConfig: name/api_key/api_base/models) —
never the UI layer's camelCase spellings.
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from aiohttp import web

from codex_pro.cli.setup.providers import find, grouped_catalog
from codex_pro.config.loader import save_config


class SetupHandlers:
    """Backend endpoints backing the desktop first-run setup wizard."""

    def __init__(self, config: Any, config_path: Path | None) -> None:
        self._config = config
        self._config_path = config_path

    async def list_providers(self, request: web.Request) -> web.Response:
        """Return the full provider catalog, grouped in wizard display order."""
        groups = [
            {
                "id": gid,
                "label": gid,
                "entries": [
                    {
                        "id": e.id,
                        "label": e.label,
                        "dialect": e.dialect,
                        "api_base": e.api_base,
                        "needs_api_base": e.needs_api_base,
                    }
                    for e in entries
                ],
            }
            for gid, entries in grouped_catalog()
        ]
        return web.json_response({"groups": groups})

    async def setup_status(self, request: web.Request) -> web.Response:
        """Whether the shared config already has any model provider configured."""
        models = getattr(self._config, "models", None)
        providers = (models.providers if models is not None else None) or []
        configured = bool(providers)
        return web.json_response(
            {
                "configured": configured,
                "workspace": str(getattr(self._config, "workspace", "")),
            }
        )

    async def save_config(self, request: web.Request) -> web.Response:
        """Persist a single provider into the shared codex-pro.yaml.

        Body: ``{provider_id, api_key, api_base, model, workspace}``. Writes only
        the ``models`` block: ``{default_model, providers: [...]}`` with snake_case
        keys. ``workspace`` is accepted for the desktop shell but the config always
        lands in the shared ``~/.codex-pro/codex-pro.yaml``.
        """
        body = await request.json()
        provider_id = body.get("provider_id", "")
        entry = find(provider_id)
        if entry is None:
            return web.json_response({"error": "unknown provider"}, status=400)

        provider_cfg = {
            "name": entry.dialect,
            "api_key": body.get("api_key", ""),
            "api_base": body.get("api_base", "") or entry.api_base,
            "models": [body.get("model", "")] if body.get("model") else list(entry.fallback_models),
        }
        next_models = {
            "default_model": body.get("model", (entry.fallback_models or [""])[0]),
            "providers": [provider_cfg],
        }
        # save_config(data, path=None) is sync; path None writes the shared
        # ~/.codex-pro/codex-pro.yaml. Run it off the event loop in a thread so a
        # slow disk write never blocks the gateway.
        await asyncio.to_thread(save_config, {"models": next_models})
        return web.json_response({"ok": True})
