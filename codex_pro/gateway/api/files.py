"""File browser API for the Dashboard tools panel.

Provides a directory-tree listing used by the Files pane in ToolsPanel.
Serves files relative to the gateway workspace root.
"""

from __future__ import annotations

import os
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

# Read limit for file content: files larger than this are truncated and flagged.
_MAX_CONTENT_BYTES = 2 * 1024 * 1024


def _classify(path: Path) -> str:
    ext = path.suffix.lower()
    return _COLOR_EXTS.get(ext, "doc")


class FilesAPI:
    def __init__(self, server: GatewayServer):
        self._server = server
        # Serve the projects dir so the file tree never exposes the workspace's
        # system-state dirs (data/, cache/, models/, skills/, .codex-pro/, ...).
        self._workspace = server._projects

    def _guard(self, request: web.Request, action: str) -> web.Response | None:
        return self._server._require_api_token(request, action=action)

    async def list_dir(self, request: web.Request) -> web.Response:
        """Return a flat file-tree listing under a repo and optional sub-path.

        Query params: ``repo`` (absolute path of the project, or empty for the
        workspace root) and ``path`` (a sub-directory relative to that repo).
        For backward compatibility, when ``repo`` is omitted the ``path`` is
        interpreted relative to the workspace root as before.
        """
        guard = self._guard(request, "files_list")
        if guard is not None:
            return guard

        repo_path = request.query.get("repo", "")
        sub_path = request.query.get("path", "")

        base = self._resolve_repo(repo_path) if repo_path else self._workspace
        if base is None:
            return web.json_response({"error": "repo not allowed"}, status=403)
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

    def _resolve_repo(self, repo_path: str) -> Path | None:
        """Resolve a repo request to the root inside the workspace.

        Only the workspace root itself or a direct subdirectory (a normal
        project) is allowed — external folders opened as symlinks are not
        supported here. Returns ``None`` if the repo is not allowed.
        """
        base = self._workspace.resolve()
        try:
            target = Path(repo_path).resolve() if repo_path else base
        except OSError:
            return None
        # The resolved repo must sit strictly within the workspace (or equal it).
        try:
            target.relative_to(base)
        except ValueError:
            return None
        if not target.is_dir():
            return None
        return target

    async def read_file(self, request: web.Request) -> web.Response:
        """Return a text file's content within a repo.

        Query params: ``repo`` (absolute path of the project, or empty for the
        workspace root) and ``path`` (the file path relative to that repo).
        Rejects directories, files escaping the repo root, and oversized files
        (truncated with a ``truncated`` flag instead of failing).
        """
        guard = self._guard(request, "files_read")
        if guard is not None:
            return guard

        repo_path = request.query.get("repo", "")
        rel_path = request.query.get("path", "")

        repo = self._resolve_repo(repo_path)
        if repo is None:
            return web.json_response({"error": "repo not allowed"}, status=403)

        try:
            target = (repo / rel_path).resolve()
            target.relative_to(repo)
        except (ValueError, OSError):
            return web.json_response({"error": "access denied"}, status=403)

        if not target.is_file():
            return web.json_response({"error": "not a file"}, status=400)

        try:
            size = target.stat().st_size
            if size > _MAX_CONTENT_BYTES:
                with target.open("r", encoding="utf-8", errors="replace") as fh:
                    content = fh.read(_MAX_CONTENT_BYTES)
                return web.json_response({
                    "path": rel_path,
                    "name": target.name,
                    "content": content,
                    "size": size,
                    "truncated": True,
                })
            content = target.read_text(encoding="utf-8", errors="replace")
        except (OSError, UnicodeError):
            return web.json_response({"error": "failed to read file"}, status=500)

        return web.json_response({
            "path": rel_path,
            "name": target.name,
            "content": content,
            "size": size,
            "truncated": False,
        })

    async def open_file(self, request: web.Request) -> web.Response:
        """Open a workspace file with the OS's default handler.

        Query params: ``repo`` (absolute path of the project, or empty for the
        workspace root) and ``path`` (the file path relative to that repo).
        Rejects directories and files escaping the repo root, then launches the
        platform default app (``os.startfile`` on Windows, ``xdg-open`` on
        POSIX).
        """
        guard = self._guard(request, "files_open")
        if guard is not None:
            return guard

        repo_path = request.query.get("repo", "")
        rel_path = request.query.get("path", "")

        repo = self._resolve_repo(repo_path)
        if repo is None:
            return web.json_response({"error": "repo not allowed"}, status=403)

        try:
            target = (repo / rel_path).resolve()
            target.relative_to(repo)
        except (ValueError, OSError):
            return web.json_response({"error": "access denied"}, status=403)

        if not target.is_file():
            return web.json_response({"error": "not a file"}, status=400)

        try:
            if os.name == "nt":
                os.startfile(str(target))
            else:
                import subprocess

                subprocess.Popen(["xdg-open", str(target)])
        except Exception:
            return web.json_response({"error": "failed to open file"}, status=500)

        return web.json_response({
            "path": rel_path,
            "name": target.name,
            "opened": True,
        })
