"""File browser API for the Dashboard tools panel.

Provides a directory-tree listing used by the Files pane in ToolsPanel.
Serves files relative to the gateway workspace root.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from aiohttp import web

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer


# File extensions that get a color badge in the file tree.
_COLOR_EXTS: dict[str, str] = {
    ".ts": "py",
    ".tsx": "py",
    ".js": "py",
    ".jsx": "py",
    ".py": "py",
    ".md": "md",
    ".html": "doc",
    ".css": "doc",
    ".json": "doc",
    ".yaml": "doc",
    ".yml": "doc",
    ".toml": "doc",
    ".png": "img",
    ".jpg": "img",
    ".svg": "img",
    ".pdf": "doc",
}

_ICON_LABELS: dict[str, str] = {
    "py": "TS",
    "md": "M",
    "doc": "D",
    "img": "I",
}


def _classify(path: Path) -> str:
    ext = path.suffix.lower()
    return _COLOR_EXTS.get(ext, "doc")


class FilesAPI:
    def __init__(self, server: GatewayServer):
        self._server = server
        self._workspace = server._workspace

    def _guard(self, request: web.Request, action: str) -> web.Response | None:
        return self._server._require_api_token(request, action=action)

    async def list_dir(self, request: web.Request) -> web.Response:
        """Return a flat file-tree listing under optional sub-path."""
        guard = self._guard(request, "files_list")
        if guard is not None:
            return guard

        sub_path = request.query.get("path", "")
        base = self._workspace
        try:
            target = (base / sub_path).resolve()
            if not str(target).startswith(str(base.resolve())):
                return web.json_response({"error": "access denied"}, status=403)
            if not target.is_dir():
                return web.json_response({"error": "not a directory"}, status=400)
        except OSError:
            return web.json_response({"error": "invalid path"}, status=400)

        entries: list[dict] = []
        try:
            for item in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
                if item.is_dir():
                    entries.append({
                        "path": str(item.relative_to(base)),
                        "kind": "dir",
                        "icon": None,
                    })
                else:
                    kind = _classify(item)
                    entries.append({
                        "path": str(item.relative_to(base)),
                        "kind": "file",
                        "icon": _ICON_LABELS.get(kind),
                        "ext": kind,
                    })
        except OSError:
            pass

        return web.json_response({"entries": entries, "path": sub_path})
