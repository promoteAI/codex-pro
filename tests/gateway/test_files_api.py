"""Tests for the FilesAPI directory listing (base = projects dir)."""

from __future__ import annotations

import json as _json

import pytest
from aiohttp import web

from codex_pro.gateway.api.files import FilesAPI


def _fake_request(query: dict | None = None) -> object:
    class _Req:
        def __init__(self):
            self.query = query or {}
            self.match_info = {}
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
async def test_list_dir_defaults_to_projects_dir(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    # system dirs off the workspace root must not appear
    (ws / "data").mkdir()
    (ws / "cache").mkdir()
    projects = ws / "workspace"
    projects.mkdir()
    (projects / "myproj").mkdir()
    (projects / "readme.md").write_text("hi")

    api = FilesAPI(_server(ws, token_required=False))
    resp = await api.list_dir(_fake_request())
    data = _json.loads(resp.text)
    paths = {e["path"] for e in data["entries"]}
    assert "myproj" in paths
    assert "readme.md" in paths
    assert not ({"data", "cache"} & paths)


@pytest.mark.asyncio
async def test_list_dir_rejects_escape(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    projects = ws / "workspace"
    projects.mkdir()

    api = FilesAPI(_server(ws, token_required=False))
    resp = await api.list_dir(_fake_request({"path": "../data"}))
    assert resp.status == 403


@pytest.mark.asyncio
async def test_list_dir_requires_token(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    (ws / "workspace").mkdir()
    api = FilesAPI(_server(ws, token_required=True))
    resp = await api.list_dir(_fake_request())
    assert resp.status == 401


@pytest.mark.asyncio
async def test_list_dir_scoped_to_repo(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    projects = ws / "workspace"
    projects.mkdir()
    (projects / "repo_a").mkdir()
    (projects / "repo_b").mkdir()
    (projects / "repo_a" / "a.txt").write_text("a")

    api = FilesAPI(_server(ws, token_required=False))
    resp = await api.list_dir(_fake_request({"repo": str(projects / "repo_a")}))
    data = _json.loads(resp.text)
    paths = {e["path"] for e in data["entries"]}
    assert "a.txt" in paths
    assert not any(p.startswith("repo_b") for p in paths)


@pytest.mark.asyncio
async def test_list_dir_rejects_repo_outside_projects(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    (ws / "workspace").mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()

    api = FilesAPI(_server(ws, token_required=False))
    resp = await api.list_dir(_fake_request({"repo": str(outside)}))
    assert resp.status == 403


@pytest.mark.asyncio
async def test_read_file_returns_content(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    projects = ws / "workspace"
    projects.mkdir()
    (projects / "repo_a").mkdir()
    (projects / "repo_a" / "hello.py").write_text("print('hi')")

    api = FilesAPI(_server(ws, token_required=False))
    resp = await api.read_file(_fake_request({
        "repo": str(projects / "repo_a"),
        "path": "hello.py",
    }))
    data = _json.loads(resp.text)
    assert resp.status == 200
    assert data["name"] == "hello.py"
    assert data["content"] == "print('hi')"
    assert data["truncated"] is False


@pytest.mark.asyncio
async def test_read_file_rejects_dir(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    projects = ws / "workspace"
    projects.mkdir()
    (projects / "repo_a").mkdir()

    api = FilesAPI(_server(ws, token_required=False))
    resp = await api.read_file(_fake_request({
        "repo": str(projects / "repo_a"),
        "path": "",
    }))
    assert resp.status == 400


@pytest.mark.asyncio
async def test_read_file_rejects_escape(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    projects = ws / "workspace"
    projects.mkdir()
    (projects / "repo_a").mkdir()

    api = FilesAPI(_server(ws, token_required=False))
    resp = await api.read_file(_fake_request({
        "repo": str(projects / "repo_a"),
        "path": "../readme.md",
    }))
    assert resp.status == 403


@pytest.mark.asyncio
async def test_read_file_rejects_repo_outside_projects(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    (ws / "workspace").mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "f.txt").write_text("x")

    api = FilesAPI(_server(ws, token_required=False))
    resp = await api.read_file(_fake_request({
        "repo": str(outside),
        "path": "f.txt",
    }))
    assert resp.status == 403


@pytest.mark.asyncio
async def test_read_file_requires_token(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    (ws / "workspace").mkdir()
    api = FilesAPI(_server(ws, token_required=True))
    resp = await api.read_file(_fake_request({"repo": "", "path": "x"}))
    assert resp.status == 401
