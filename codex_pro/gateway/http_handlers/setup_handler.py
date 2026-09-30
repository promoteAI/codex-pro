"""First-run setup endpoints for the desktop shell.

Exposes the provider catalog and writes model config into the shared
codex-pro.yaml (the same file the CLI reads and writes). Field names MUST be
snake_case to match the schema (ProviderConfig: name/api_key/api_base/models) —
never the UI layer's camelCase spellings.

Holds the *root* config file, not a sub-config: the production wiring passes
``config=ctx.config.gateway`` (a ``GatewayConfig``) into ``GatewayServer``, which
has no ``models``/``workspace``. Reading the YAML from disk (via ``config_path``)
is the authoritative source, so ``setup_status`` and ``save_config`` operate on
the real file this gateway is configured against.
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import yaml
from aiohttp import web
from loguru import logger

from codex_pro.cli.setup.providers import find, grouped_catalog
from codex_pro.config.loader import save_config
from codex_pro.runtime_paths import default_config_path

# Default desktop workspace, mirroring codex_pro/_desktop_entry.py. Used when
# neither the config nor the gateway supplies a workspace.
_DESKTOP_WORKSPACE = "~/.codex-pro"


class SetupHandlers:
    """Backend endpoints backing the desktop first-run setup wizard."""

    def __init__(
        self,
        config: Any,
        config_path: Path | None,
        workspace: str | Path | None = None,
    ) -> None:
        self._config = config
        self._config_path = Path(config_path).expanduser() if config_path else None
        self._workspace = (
            str(Path(workspace).expanduser()) if workspace else None
        )

    def _target_path(self) -> Path:
        """The config file this gateway reads and writes.

        An explicit ``config_path`` wins (that is the file the gateway was started
        against); otherwise fall back to the shared ``~/.codex-pro/codex-pro.yaml``,
        exactly what ``save_config(path=None)`` targets.
        """
        return self._config_path if self._config_path is not None else default_config_path()

    def _load_yaml(self) -> dict[str, Any]:
        """Read the raw YAML dict at the target path, or ``{}`` when absent."""
        target = self._target_path()
        try:
            if not target.exists():
                return {}
            loaded = yaml.safe_load(target.read_text(encoding="utf-8")) or {}
            return loaded if isinstance(loaded, dict) else {}
        except (OSError, yaml.YAMLError) as exc:
            logger.warning("Setup: cannot read config {}: {}", target, exc)
            return {}

    def _resolved_workspace(self) -> str:
        """The workspace this wizard should target and report."""
        if self._workspace:
            return self._workspace
        return str(Path(_DESKTOP_WORKSPACE).expanduser())

    @staticmethod
    def _as_dict(value: Any) -> dict[str, Any]:
        """Coerce a nested config value to a dict, tolerating a malformed scalar.

        The raw YAML is authoritative here. ``load_config`` would refuse to start
        on ``models: gpt-4o``, but these endpoints read the file directly, so a
        non-mapping ``models`` must be treated as an empty block rather than
        raising ``AttributeError``/``TypeError`` (which would surface as a 500).
        """
        return value if isinstance(value, dict) else {}

    def _guard_write(self, request: web.Request) -> web.Response | None:
        """Gate the config write to local clients only.

        ``POST /setup/config`` persists an API key into a shared file. Only the
        on-machine desktop shell should do that, so require a loopback peer; a
        network client (a gateway bound to 0.0.0.0) is refused. The read-only GET
        endpoints are exempt.
        """
        from codex_pro.gateway.http_handlers.base import is_loopback_peer

        if is_loopback_peer(request):
            return None
        return web.json_response(
            {"error": "setup config write requires a local client"}, status=403
        )

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
        """Whether the shared config already has any model provider configured.

        Reads the config file from disk. ``GatewayServer`` only sees the gateway
        sub-config (no ``models``/``workspace``), so the YAML is the authoritative
        source for the first-run decision.
        """
        data = self._load_yaml()
        models = self._as_dict(data.get("models"))
        providers = models.get("providers") or []
        configured = bool(providers)
        workspace = data.get("workspace") or self._resolved_workspace()
        return web.json_response(
            {"configured": configured, "workspace": workspace}
        )

    async def save_config(self, request: web.Request) -> web.Response:
        """Persist a single provider into the shared codex-pro.yaml.

        Body: ``{provider_id, api_key, api_base, model, workspace}``. Read-merge-
        write: only ``models.default_model`` and ``models.providers`` are updated,
        every other top-level key and ``models.routes``/``modelWindows`` survive —
        the CLI's ``setup_model`` is the reference for preserving routes.
        """
        guard = self._guard_write(request)
        if guard is not None:
            return guard

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
        default_model = body.get("model", (entry.fallback_models or [""])[0])

        raw = self._load_yaml()
        # Coerce a malformed scalar models block to an empty dict before merging,
        # and write the coerced dict back so the save produces a valid mapping.
        models_block = self._as_dict(raw.get("models"))
        raw["models"] = models_block
        # Preserve routes / modelWindows / fallback_model already in the block.
        models_block["default_model"] = default_model
        models_block["providers"] = [provider_cfg]
        workspace = body.get("workspace") or self._resolved_workspace()
        raw["workspace"] = workspace

        target = self._target_path()
        try:
            # save_config is sync; run it off the event loop in a thread.
            await asyncio.to_thread(save_config, raw, target)
        except OSError as exc:
            logger.warning("Setup: save_config failed for {}: {}", target, exc)
            return web.json_response({"error": f"save failed: {exc}"}, status=500)
        return web.json_response({"ok": True, "workspace": workspace})
