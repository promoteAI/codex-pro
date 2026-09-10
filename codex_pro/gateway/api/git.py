"""Git operations API for the Dashboard.

Provides read-only git metadata (repos, branches) derived from the local
workspace. Used by Composer to replace hardcoded project/branch dropdowns
with live data from the agent's current environment.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from aiohttp import web

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer


from codex_pro.agent.proc_lifecycle import run_owned


def _run_git(cwd: Path, args: list[str]) -> tuple[int, str]:
    """Run a git command and return (returncode, stdout)."""
    try:
        result = run_owned(
            ["git", *args],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.returncode, result.stdout
    except (OSError, TimeoutError):
        return 1, ""


class GitAPI:
    def __init__(self, server: GatewayServer):
        self._server = server
        self._workspace = server._workspace

    def _guard(self, request: web.Request, action: str) -> web.Response | None:
        return self._server._require_api_token(request, action=action)

    async def list_repos(self, request: web.Request) -> web.Response:
        """Return known git repos from the workspace directory.

        Scans top-level subdirectories for .git; also includes the workspace
        root itself if it is a git repo.
        """
        guard = self._guard(request, "git_repos")
        if guard is not None:
            return guard

        repos: list[dict] = []

        # Workspace root if it's a git repo
        if (self._workspace / ".git").is_dir():
            rc, stdout = _run_git(self._workspace, ["rev-parse", "--abbrev-ref", "HEAD"])
            current_branch = stdout.strip() if rc == 0 else ""
            repos.append({
                "path": str(self._workspace),
                "name": self._workspace.name,
                "current_branch": current_branch,
            })

        # Scan sibling directories
        try:
            for child in sorted(self._workspace.parent.iterdir()):
                if not child.is_dir() or child == self._workspace:
                    continue
                if (child / ".git").is_dir():
                    rc, stdout = _run_git(child, ["rev-parse", "--abbrev-ref", "HEAD"])
                    current_branch = stdout.strip() if rc == 0 else ""
                    repos.append({
                        "path": str(child),
                        "name": child.name,
                        "current_branch": current_branch,
                    })
        except OSError:
            pass

        return web.json_response({"repos": repos})

    async def list_branches(self, request: web.Request) -> web.Response:
        """Return branches for a given repo path."""
        guard = self._guard(request, "git_branches")
        if guard is not None:
            return guard

        repo_path = request.query.get("path", str(self._workspace))
        if not Path(repo_path).is_dir():
            return web.json_response({"error": "repo path not found"}, status=400)

        rc, stdout = _run_git(Path(repo_path), ["branch", "-a", "--format=%(refname:short)"])
        if rc != 0:
            return web.json_response({"branches": []})

        branches = []
        current_branch = ""
        for line in stdout.strip().splitlines():
            line = line.strip()
            if not line:
                continue
            is_remote = line.startswith("remotes/")
            if not is_remote:
                # Check if this is the current branch
                rc2, out2 = _run_git(Path(repo_path), ["rev-parse", "--abbrev-ref", "HEAD"])
                if rc2 == 0 and out2.strip() == line:
                    current_branch = line
            branches.append({
                "name": line,
                "is_current": line == current_branch,
                "is_remote": is_remote,
            })

        return web.json_response({"branches": branches, "current_branch": current_branch})
