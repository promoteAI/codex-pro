"""Tests for the GitAPI project endpoints (list / create local workspace projects)."""

from __future__ import annotations

import json as _json
import subprocess

import pytest
from aiohttp import web

from codex_pro.gateway.api.git import GitAPI


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
