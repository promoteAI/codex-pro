"""Git operations API for the Dashboard.

Provides read-only git metadata (repos, branches) derived from the local
workspace. Used by Composer to replace hardcoded project/branch dropdowns
with live data from the agent's current environment.
"""

from __future__ import annotations

import json
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
        self._projects = server._projects

    def _guard(self, request: web.Request, action: str) -> web.Response | None:
        return self._server._require_api_token(request, action=action)

    async def list_repos(self, request: web.Request) -> web.Response:
        """Return known projects (workspace subdirectories) as repos.

        Scans top-level subdirectories of the workspace. Each is a project /
        local workspace regardless of whether it is a git repo — projects are
        created as directories under the workspace (see create_repo). Repos
        that are git repos carry their current branch; non-git dirs report an
        empty current_branch. The workspace root itself is included if it is a
        git repo.
        """
        guard = self._guard(request, "git_repos")
        if guard is not None:
            return guard

        repos: list[dict] = []

        def _entry(path: Path) -> dict:
            name = path.name
            current_branch = ""
            if (path / ".git").is_dir():
                rc, stdout = _run_git(path, ["rev-parse", "--abbrev-ref", "HEAD"])
                if rc != 0:
                    # Fallback for freshly-initialized repos with no commits yet
                    rc, stdout = _run_git(path, ["branch", "--show-current"])
                current_branch = stdout.strip() if rc == 0 else ""
            return {"path": str(path), "name": name, "current_branch": current_branch}

        # Projects root if it's a git repo
        if (self._projects / ".git").is_dir():
            repos.append(_entry(self._projects))

        # Scan projects subdirectories as projects. Only the projects dir is
        # scanned — the workspace root holds system-state dirs (data/, cache/,
        # models/, skills/, .codex-pro/, ...) that must never be exposed.
        try:
            for child in sorted(self._projects.iterdir()):
                if child.is_dir():
                    repos.append(_entry(child))
        except OSError:
            pass

        return web.json_response({"repos": repos})

    def _validate_project_name(self, name: str) -> str | None:
        """Return an error message for an invalid project name, else None.

        Names must be a single path segment so a created project cannot escape
        the workspace via ``/`` or ``..``. A lenient whitelist keeps names
        filesystem-safe and side-effect free on both POSIX and Windows.
        """
        if not name or name in {".", ".."}:
            return "project name is empty or reserved"
        if "/" in name or "\\" in name:
            return "project name must not contain a path separator"
        if any(ch in name for ch in "\\:*?\"<>|"):
            return "project name must not contain invalid filesystem characters"
        return None

    async def create_repo(self, request: web.Request) -> web.Response:
        """Create a local workspace project directory under the workspace root.

        Body: ``{"name": str, "git_init": bool}``. ``git_init`` defaults to
        False. Creates the directory (and optionally initialises a git repo),
        returning the new project entry as ``{path, name, current_branch}``.
        """
        guard = self._guard(request, "git_repos_create")
        if guard is not None:
            return guard

        try:
            body = await request.json()
        except json.JSONDecodeError:
            return web.json_response({"error": "invalid JSON"}, status=400)
        if not isinstance(body, dict):
            return web.json_response({"error": "JSON body must be an object"}, status=400)

        name = str(body.get("name", "")).strip()
        git_init = bool(body.get("git_init", False))

        err = self._validate_project_name(name)
        if err:
            return web.json_response({"error": err}, status=400)

        target = (self._projects / name).resolve()
        # Ensure the resolved directory still sits under the projects root.
        try:
            target.relative_to(self._projects)
        except ValueError:
            return web.json_response({"error": "project path escapes workspace"}, status=400)

        if target.exists():
            return web.json_response({"error": "project already exists"}, status=409)

        try:
            target.mkdir(parents=False, exist_ok=False)
        except OSError as e:
            return web.json_response({"error": f"failed to create project: {e}"}, status=500)

        if git_init:
            rc, _ = _run_git(target, ["init", "-q"])
            if rc != 0:
                import shutil
                shutil.rmtree(target, ignore_errors=True)
                return web.json_response({"error": "git init failed"}, status=500)

        # Determine current branch if the created project is a git repo.
        current_branch = ""
        if git_init and (target / ".git").is_dir():
            rc, stdout = _run_git(target, ["rev-parse", "--abbrev-ref", "HEAD"])
            if rc != 0:
                rc, stdout = _run_git(target, ["branch", "--show-current"])
            current_branch = stdout.strip() if rc == 0 else ""

        return web.json_response({"path": str(target), "name": name, "current_branch": current_branch}, status=201)

    async def open_folder(self, request: web.Request) -> web.Response:
        """Open an existing external folder as a project.

        Creates a symlink under the workspace pointing to the given absolute
        path and returns the project entry. Rejects paths that escape the
        workspace root.
        """
        guard = self._guard(request, "git_repos_open")
        if guard is not None:
            return guard

        try:
            body = await request.json()
        except json.JSONDecodeError:
            return web.json_response({"error": "invalid JSON"}, status=400)
        if not isinstance(body, dict):
            return web.json_response({"error": "JSON body must be an object"}, status=400)

        folder_path = str(body.get("path", "")).strip()
        link_name = str(body.get("name", "")).strip()

        if not folder_path or not Path(folder_path).is_dir():
            return web.json_response({"error": "folder path not found"}, status=400)

        # Resolve the real absolute path (resolves symlinks).
        real_path = Path(folder_path).resolve()

        if link_name:
            # User-supplied project name — use it as the symlink name.
            target_link = (self._projects / link_name).resolve()
        else:
            # Fall back to the folder's basename.
            target_link = (self._projects / real_path.name).resolve()

        # Ensure the resolved link still sits under the projects root.
        try:
            target_link.relative_to(self._projects)
        except ValueError:
            return web.json_response({"error": "project path escapes workspace"}, status=400)

        if target_link.exists() or target_link.is_symlink():
            return web.json_response({"error": "project already exists"}, status=409)

        try:
            target_link.symlink_to(real_path, target_is_directory=True)
        except OSError as e:
            return web.json_response({"error": f"failed to create project: {e}"}, status=500)

        # Determine current branch if the opened folder is a git repo.
        current_branch = ""
        if (real_path / ".git").is_dir():
            rc, stdout = _run_git(real_path, ["rev-parse", "--abbrev-ref", "HEAD"])
            if rc != 0:
                rc, stdout = _run_git(real_path, ["branch", "--show-current"])
            current_branch = stdout.strip() if rc == 0 else ""

        return web.json_response({
            "path": str(real_path),
            "name": target_link.name,
            "current_branch": current_branch,
        }, status=201)

    async def list_branches(self, request: web.Request) -> web.Response:
        """Return branches for a given repo path."""
        guard = self._guard(request, "git_branches")
        if guard is not None:
            return guard

        repo_path = request.query.get("path", str(self._projects))
        if not Path(repo_path).is_dir():
            return web.json_response({"error": "repo path not found"}, status=400)

        rc, stdout = _run_git(Path(repo_path), ["branch", "-a", "--format=%(refname:short)"])
        if rc != 0 or not stdout.strip():
            # No branches yet (fresh repo with no commits) — surface the
            # symbolic branch name so the UI isn't left showing stale fallbacks.
            rc2, out2 = _run_git(Path(repo_path), ["branch", "--show-current"])
            current = out2.strip() if rc2 == 0 else ""
            if current and current != "HEAD":
                return web.json_response({
                    "branches": [{"name": current, "is_current": True, "is_remote": False}],
                    "current_branch": current,
                })
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

    async def create_branch(self, request: web.Request) -> web.Response:
        """Create and checkout a new branch in a repo."""
        guard = self._guard(request, "git_branch_create")
        if guard is not None:
            return guard

        try:
            body = await request.json()
        except json.JSONDecodeError:
            return web.json_response({"error": "invalid JSON"}, status=400)
        if not isinstance(body, dict):
            return web.json_response({"error": "JSON body must be an object"}, status=400)

        repo_path = body.get("path", "")
        branch_name = body.get("name", "").strip()
        if not repo_path or not branch_name:
            return web.json_response({"error": "path and name are required"}, status=400)

        repo_path_obj = Path(repo_path).resolve()
        if not repo_path_obj.is_dir():
            return web.json_response({"error": "repo path not found"}, status=400)

        rc, stdout = _run_git(repo_path_obj, ["branch", "--list", "--all", branch_name])
        if rc == 0 and stdout.strip():
            return web.json_response({"error": "branch already exists"}, status=409)

        rc, stderr = _run_git(repo_path_obj, ["checkout", "-b", branch_name])
        if rc != 0:
            return web.json_response({"error": f"failed to create branch: {stderr.strip()}"}, status=500)

        return web.json_response({"name": branch_name, "branch": branch_name}, status=201)
