"""Browser tabs API for the Composer "Tabs" segment.

The agent-side browser tool drives a single page per session and does not
track a multi-tab list, so this endpoint exposes a small persisted record of
browser tabs for the web UI. Tabs are stored as JSON under
``<workspace>/.codex-pro/browser-tabs.json``, matching the lightweight
runtime-dir records the gateway already keeps (e.g. hooks).

Each tab is ``{id, title, url, suffix?, globe?}`` — the same shape the
ComposerAddMenu section renders, so the frontend can map it directly.
"""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import TYPE_CHECKING, Any

from aiohttp import web

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer


class TabStore:
    """JSON-backed store for user browser tabs.

    Lays the records in ``<workspace>/.codex-pro/browser-tabs.json``. Writes
    are atomic (temp file + ``os.replace``) so a concurrent reader never
    observes a half-written document.
    """

    def __init__(self, workspace: Path):
        self._path = workspace / ".codex-pro" / "browser-tabs.json"

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

    def _save(self, tabs: list[dict[str, Any]]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(".json.tmp")
        tmp.write_text(
            json.dumps(tabs, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(tmp, self._path)

    def list_all(self) -> list[dict[str, Any]]:
        return self._load()

    def create(self, title: str, url: str, suffix: str = "",
               globe: bool = False) -> dict[str, Any]:
        tab = {
            "id": uuid.uuid4().hex[:12],
            "title": title,
            "url": url,
            "suffix": suffix,
            "globe": globe,
        }
        tabs = self._load()
        tabs.append(tab)
        self._save(tabs)
        return tab

    def delete(self, tab_id: str) -> bool:
        tabs = self._load()
        remaining = [t for t in tabs if t.get("id") != tab_id]
        if len(remaining) == len(tabs):
            return False
        self._save(remaining)
        return True


class BrowserTabsAPI:
    def __init__(self, server: GatewayServer):
        self._server = server
        self._workspace = server._workspace

    def _store(self) -> TabStore:
        return TabStore(self._workspace)

    def _guard(self, request: web.Request, action: str) -> web.Response | None:
        return self._server._require_api_token(request, action=action)

    def _admin_guard(self, request: web.Request, action: str) -> web.Response | None:
        # Mutations are admin-tier so a non-admin cannot plant a tab that a
        # shared composer renders for everyone.
        return self._server._require_admin_token(request, action=action)

    async def list_tabs(self, request: web.Request) -> web.Response:
        guard = self._guard(request, "browser_tabs_list")
        if guard is not None:
            return guard
        return web.json_response({"tabs": self._store().list_all()})

    async def create_tab(self, request: web.Request) -> web.Response:
        guard = self._admin_guard(request, "browser_tabs_create")
        if guard is not None:
            return guard
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        title = str(body.get("title", "")).strip()
        url = str(body.get("url", "")).strip()
        if not title or not url:
            return web.json_response({"error": "title and url are required"}, status=400)
        tab = self._store().create(
            title=title,
            url=url,
            suffix=str(body.get("suffix", "")),
            globe=bool(body.get("globe", False)),
        )
        return web.json_response({"tab": tab}, status=201)

    async def delete_tab(self, request: web.Request) -> web.Response:
        guard = self._admin_guard(request, "browser_tabs_delete")
        if guard is not None:
            return guard
        tab_id = request.match_info.get("id", "")
        if not tab_id:
            return web.json_response({"error": "missing tab id"}, status=400)
        ok = self._store().delete(tab_id)
        if not ok:
            return web.json_response({"error": "tab not found"}, status=404)
        return web.json_response({"ok": True})
