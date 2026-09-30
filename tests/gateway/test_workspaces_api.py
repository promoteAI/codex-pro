"""Tests for the /workspaces endpoint (multi-workspace listing)."""

from __future__ import annotations

import json as _json

import pytest
from aiohttp import web

from codex_pro.gateway.api.workspaces import WorkspaceAPI
from codex_pro.workspace_registry import WorkspaceRegistry


def _fake_request() -> object:
    class _Req:
        query = {}
        match_info = {}
    return _Req()


def _server():
    class _S:
        def __init__(self):
            self.workspace_registry = WorkspaceRegistry()

        def _require_api_token(self, request, action=""):
            return None
    return _S()


@pytest.mark.asyncio
async def test_list_workspaces_returns_registered_entries():
    srv = _server()
    srv.workspace_registry.register("ws1", "/p/ws1")
    srv.workspace_registry.register("ws2", "/p/ws2")
    api = WorkspaceAPI(srv)
    resp = await api.list_workspaces(_fake_request())
    assert resp.status == 200
    data = _json.loads(resp.text)
    assert "workspaces" in data
    keys = {w["workspace_key"] for w in data["workspaces"]}
    assert keys == {"ws1", "ws2"}
    assert all("workspace_path" in w for w in data["workspaces"])


@pytest.mark.asyncio
async def test_list_workspaces_requires_token():
    class _S:
        def __init__(self):
            self.workspace_registry = WorkspaceRegistry()

        def _require_api_token(self, request, action=""):
            return web.json_response({"error": "unauthorized"}, status=401)

    api = WorkspaceAPI(_S())
    resp = await api.list_workspaces(_fake_request())
    assert resp.status == 401
