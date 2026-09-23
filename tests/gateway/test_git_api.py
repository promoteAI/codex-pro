"""Tests for the GitAPI project endpoints (list / create local workspace projects)."""

from __future__ import annotations

import json as _json
import subprocess
from pathlib import Path

import pytest
from aiohttp import web

from codex_pro.gateway.api.git import GitAPI, _run_git


def _fake_request(method: str = "GET", body: dict | None = None) -> object:
    """Minimal request stand-in: exposes async json() and a query mapping."""

    class _Req:
        def __init__(self):
            self.query = {}
            self.match_info = {}

        async def json(self):
            return body or {}
    return _Req()


def _server(workspace, token_required: bool = True):
    projects = workspace / "workspace"
    projects.mkdir(parents=True, exist_ok=True)

    class _S:
        _workspace = workspace
        _projects = projects

        def _require_api_token(self, request, action=""):
            if token_required:
                return web.json_response({"error": "unauthorized"}, status=401)
            return None
    return _S()


@pytest.mark.asyncio
async def test_create_repo_makes_directory(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    api = GitAPI(_server(ws, token_required=False))
    resp = await api.create_repo(_fake_request("POST", {"name": "myproj"}))
    assert resp.status == 201
    assert (ws / "workspace" / "myproj").is_dir()


@pytest.mark.asyncio
async def test_create_repo_with_git_init(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    api = GitAPI(_server(ws, token_required=False))
    resp = await api.create_repo(_fake_request("POST", {"name": "gitproj", "git_init": True}))
    assert resp.status == 201
    assert (ws / "workspace" / "gitproj" / ".git").is_dir()


@pytest.mark.asyncio
async def test_create_repo_rejects_invalid_name(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    api = GitAPI(_server(ws, token_required=False))
    for bad in ["", ".", "..", "a/b", "a\\b", "a:b"]:
        resp = await api.create_repo(_fake_request("POST", {"name": bad}))
        assert resp.status == 400, f"expected 400 for {bad!r}"


@pytest.mark.asyncio
async def test_create_repo_conflict_when_exists(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    (ws / "workspace").mkdir()
    (ws / "workspace" / "exists").mkdir()
    api = GitAPI(_server(ws, token_required=False))
    resp = await api.create_repo(_fake_request("POST", {"name": "exists"}))
    assert resp.status == 409


@pytest.mark.asyncio
async def test_create_repo_requires_token(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    api = GitAPI(_server(ws, token_required=True))
    resp = await api.create_repo(_fake_request("POST", {"name": "x"}))
    assert resp.status == 401
    assert not (ws / "workspace" / "x").exists()


@pytest.mark.asyncio
async def test_list_repos_includes_non_git_directories(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    projects = ws / "workspace"
    projects.mkdir()
    (projects / "plain").mkdir()
    (projects / "gitrepo").mkdir()
    subprocess.run(["git", "init", "-q"], cwd=projects / "gitrepo", check=True)
    # A repo with no commits has an unborn branch; its current_branch reports
    # empty. Commit once so a real branch name is exposed.
    (projects / "gitrepo" / "readme.md").write_text("hi")
    subprocess.run(["git", "-C", str(projects / "gitrepo"), "add", "."], check=True)
    subprocess.run(["git", "-C", str(projects / "gitrepo"), "-c", "user.email=t@t", "-c", "user.name=t",
                    "commit", "-q", "-m", "init"], check=True)
    api = GitAPI(_server(ws, token_required=False))
    resp = await api.list_repos(_fake_request("GET"))
    data = _json.loads(resp.text)
    names = {r["name"] for r in data["repos"]}
    assert "plain" in names
    assert "gitrepo" in names
    gitrepo = next(r for r in data["repos"] if r["name"] == "gitrepo")
    assert gitrepo["current_branch"] in ("master", "main")
    plain = next(r for r in data["repos"] if r["name"] == "plain")
    assert plain["current_branch"] == ""


@pytest.mark.asyncio
async def test_create_repo_creates_dir_under_projects(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    api = GitAPI(_server(ws, token_required=False))
    resp = await api.create_repo(_fake_request("POST", {"name": "myproj"}))
    assert resp.status == 201
    projects = ws / "workspace"
    assert (projects / "myproj").is_dir()
    assert not (ws / "myproj").exists()


@pytest.mark.asyncio
async def test_list_repos_scans_only_projects_dir(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    # System-state dirs hanging off the workspace root must never be listed.
    for d in ("data", "cache", "models", "skills", "checkpoints", ".codex-pro"):
        (ws / d).mkdir()
    projects = ws / "workspace"
    projects.mkdir()
    (projects / "myproj").mkdir()
    (projects / "other").mkdir()

    api = GitAPI(_server(ws, token_required=False))
    resp = await api.list_repos(_fake_request("GET"))
    data = _json.loads(resp.text)
    names = {r["name"] for r in data["repos"]}
    assert names == {"myproj", "other"}
    assert not ({"data", "cache", "models", "skills", "checkpoints", ".codex-pro"} & names)


@pytest.mark.asyncio
async def test_list_repos_ignores_workspace_root_when_projects_empty(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    # Legacy projects hanging off the workspace root must not be listed once
    # projects are isolated to the projects dir.
    (ws / "oldproj").mkdir()
    for d in ("data", "cache", "models"):
        (ws / d).mkdir()

    api = GitAPI(_server(ws, token_required=False))
    resp = await api.list_repos(_fake_request("GET"))
    data = _json.loads(resp.text)
    assert data["repos"] == []


def _make_repo(projects: Path, name: str = "gitrepo") -> Path:
    """Create a repo with an initial commit and one working-tree change."""
    repo = projects / name
    repo.parent.mkdir(parents=True, exist_ok=True)
    repo.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
    (repo / "readme.md").write_text("hello\n")
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
    subprocess.run(
        ["git", "-C", str(repo), "-c", "user.email=t@t", "-c", "user.name=t",
         "commit", "-q", "-m", "init"],
        check=True,
    )
    # Introduce a working-tree change (modified + new staged file).
    (repo / "readme.md").write_text("hello\nworld\n")
    (repo / "new.txt").write_text("brand new\n")
    subprocess.run(["git", "-C", str(repo), "add", "new.txt"], check=True)
    return repo


@pytest.mark.asyncio
async def test_list_diff_returns_block_per_file(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    repo = _make_repo(ws / "workspace")
    api = GitAPI(_server(ws, token_required=False))
    req = _fake_request("GET")
    req.query = {"path": str(repo)}
    resp = await api.list_diff(req)
    assert resp.status == 200
    data = _json.loads(resp.text)
    paths = {f["path"] for f in data["files"]}
    assert "readme.md" in paths
    readme = next(f for f in data["files"] if f["path"] == "readme.md")
    assert readme["additions"] == 1
    assert readme["deletions"] == 0
    assert "+world" in readme["diff"]
    # Every block carries the diff body.
    assert data["files"]


@pytest.mark.asyncio
async def test_list_diff_respects_base_and_branch(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    repo = _make_repo(ws / "workspace")
    api = GitAPI(_server(ws, token_required=False))
    req = _fake_request("GET")
    req.query = {"path": str(repo)}
    resp = await api.list_diff(req)
    data = _json.loads(resp.text)
    assert data["base"] in ("master", "main")
    assert data["branch"] in ("master", "main")


@pytest.mark.asyncio
async def test_list_diff_requires_token(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    repo = _make_repo(ws / "workspace")
    api = GitAPI(_server(ws, token_required=True))
    req = _fake_request("GET")
    req.query = {"path": str(repo)}
    resp = await api.list_diff(req)
    assert resp.status == 401


@pytest.mark.asyncio
async def test_list_diff_rejects_missing_repo(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    api = GitAPI(_server(ws, token_required=False))
    req = _fake_request("GET")
    req.query = {"path": str(ws / "nope")}
    resp = await api.list_diff(req)
    assert resp.status == 400


def _init_repo(projects: Path, name: str, branch: str = "master") -> Path:
    """Init a repo with one empty commit on the given branch."""
    repo = projects / name
    repo.parent.mkdir(parents=True, exist_ok=True)
    repo.mkdir()
    subprocess.run(["git", "init", "-q", "-b", branch], cwd=repo, check=True)
    subprocess.run(
        ["git", "-C", str(repo), "-c", "user.email=t@t", "-c", "user.name=t",
         "commit", "-q", "--allow-empty", "-m", "init"],
        check=True,
    )
    return repo


def _commit_file(repo: Path, name: str, content: str) -> None:
    (repo / name).write_text(content, encoding="utf-8")
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
    subprocess.run(
        ["git", "-C", str(repo), "-c", "user.email=t@t", "-c", "user.name=t",
         "commit", "-q", "-m", f"add {name}"],
        check=True,
    )


@pytest.mark.asyncio
async def test_list_diff_deleted_file_is_not_dev_null(tmp_path):
    """A deleted file's `+++ /dev/null` header must not leak a /dev/null path."""
    ws = tmp_path / "ws"
    ws.mkdir()
    repo = _init_repo(ws / "workspace", "r")
    _commit_file(repo, "del.txt", "gone\n")
    (repo / "del.txt").unlink()
    api = GitAPI(_server(ws, token_required=False))
    req = _fake_request("GET")
    req.query = {"path": str(repo)}
    data = _json.loads((await api.list_diff(req)).text)
    paths = {f["path"] for f in data["files"]}
    assert "/dev/null" not in paths
    assert "del.txt" in paths


@pytest.mark.asyncio
async def test_list_diff_non_ascii_path_is_readable(tmp_path):
    """core.quotepath escaping must be decoded so Chinese names display intact."""
    ws = tmp_path / "ws"
    ws.mkdir()
    repo = _init_repo(ws / "workspace", "r")
    _commit_file(repo, "新文件.txt", "你好\n")
    (repo / "新文件.txt").write_text("你好\n世界\n", encoding="utf-8")
    api = GitAPI(_server(ws, token_required=False))
    req = _fake_request("GET")
    req.query = {"path": str(repo)}
    data = _json.loads((await api.list_diff(req)).text)
    paths = {f["path"] for f in data["files"]}
    assert "新文件.txt" in paths


@pytest.mark.asyncio
async def test_list_diff_rename_appears_in_files(tmp_path):
    """A pure rename (100% similarity) has no ---/+++ headers; its path must
    still resolve from the `rename to` line rather than being dropped."""
    ws = tmp_path / "ws"
    ws.mkdir()
    repo = _init_repo(ws / "workspace", "r")
    _commit_file(repo, "orig.txt", "same content\n")
    # Staged rename so git emits a `similarity index 100%` block (no ---/+++).
    subprocess.run(["git", "-C", str(repo), "mv", "orig.txt", "renamed.txt"], check=True)
    api = GitAPI(_server(ws, token_required=False))
    req = _fake_request("GET")
    req.query = {"path": str(repo)}
    data = _json.loads((await api.list_diff(req)).text)
    paths = {f["path"] for f in data["files"]}
    assert "renamed.txt" in paths


@pytest.mark.asyncio
async def test_list_diff_default_branch_not_main_or_master(tmp_path):
    """A repo whose default branch is `dev` must not 400 on the base fallback."""
    ws = tmp_path / "ws"
    ws.mkdir()
    repo = _init_repo(ws / "workspace", "r", branch="dev")
    _commit_file(repo, "x.txt", "hi\n")
    (repo / "x.txt").write_text("hi\nmore\n", encoding="utf-8")
    api = GitAPI(_server(ws, token_required=False))
    req = _fake_request("GET")
    req.query = {"path": str(repo)}
    resp = await api.list_diff(req)
    assert resp.status == 200
    data = _json.loads(resp.text)
    assert data["base"] == "dev"


def test_run_git_catches_timeout_expired(monkeypatch, tmp_path):
    """A git timeout surfaces subprocess.TimeoutExpired (a SubprocessError), not
    OSError/TimeoutError; _run_git must still degrade gracefully to (1, "")."""
    def _boom(*args, **kwargs):
        raise subprocess.TimeoutExpired(["git"], 10)

    monkeypatch.setattr("codex_pro.gateway.api.git.run_owned", _boom)
    assert _run_git(tmp_path, ["diff"]) == (1, "")
