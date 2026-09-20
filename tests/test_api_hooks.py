# tests/test_api_hooks.py
import pytest
from unittest.mock import MagicMock
from aiohttp import web
from aiohttp.test_utils import TestServer, TestClient

from codex_pro.gateway.api.hooks import HooksAPI, HookStore


@pytest.fixture
def mock_server(tmp_path):
    server = MagicMock()
    server._require_api_token = MagicMock(return_value=None)
    # Mutations moved to the admin guard; keep both mocked so these tests
    # exercise handler logic rather than authorization.
    server._require_admin_token = MagicMock(return_value=None)
    server.auth = MagicMock()
    server._workspace = tmp_path
    return server


@pytest.fixture
def api(mock_server):
    return HooksAPI(mock_server)


def test_hook_store_roundtrip(tmp_path):
    store = HookStore(tmp_path)
    hook = {"id": "a1", "event": "PreToolUse", "run_mode": "process",
            "scope": "用户", "command": "echo hi", "name": "", "enabled": True}
    store.create(hook)
    loaded = store.list_all()
    assert len(loaded) == 1
    assert loaded[0]["command"] == "echo hi"
    # update + delete
    assert store.update("a1", {"enabled": False})["enabled"] is False
    assert store.delete("a1") is True
    assert store.delete("a1") is False


@pytest.mark.asyncio
async def test_list_hooks(mock_server, api):
    store = HookStore(mock_server._workspace)
    store.create({"id": "a1", "event": "Stop", "run_mode": "process",
                  "scope": "用户", "command": "echo done", "name": "", "enabled": True})

    app = web.Application()
    app.router.add_get("/api/v1/hooks", api.list_hooks)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/api/v1/hooks")
        assert resp.status == 200
        data = await resp.json()
        assert data["total"] == 1
        assert data["enabled"] == 1
        assert data["hooks"][0]["event"] == "Stop"


@pytest.mark.asyncio
async def test_create_hook(mock_server, api):
    app = web.Application()
    app.router.add_post("/api/v1/hooks", api.create_hook)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/api/v1/hooks", json={
            "event": "PreToolUse", "run_mode": "process",
            "scope": "用户", "command": "echo hi",
        })
        assert resp.status == 201
        data = await resp.json()
        assert data["hook"]["enabled"] is True
        assert data["hook"]["id"]


@pytest.mark.asyncio
async def test_create_hook_requires_command(mock_server, api):
    app = web.Application()
    app.router.add_post("/api/v1/hooks", api.create_hook)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/api/v1/hooks", json={
            "event": "PreToolUse", "run_mode": "process", "command": "",
        })
        assert resp.status == 400


@pytest.mark.asyncio
async def test_create_hook_invalid_event(mock_server, api):
    app = web.Application()
    app.router.add_post("/api/v1/hooks", api.create_hook)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/api/v1/hooks", json={
            "event": "Nope", "run_mode": "process", "command": "x",
        })
        assert resp.status == 400


@pytest.mark.asyncio
async def test_toggle_hook(mock_server, api):
    store = HookStore(mock_server._workspace)
    store.create({"id": "a1", "event": "Stop", "run_mode": "process",
                  "scope": "用户", "command": "echo x", "name": "", "enabled": True})

    app = web.Application()
    app.router.add_post("/api/v1/hooks/{id}/toggle", api.toggle_hook)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/api/v1/hooks/a1/toggle", json={"enabled": False})
        assert resp.status == 200
        data = await resp.json()
        assert data["hook"]["enabled"] is False


@pytest.mark.asyncio
async def test_toggle_hook_not_found(mock_server, api):
    app = web.Application()
    app.router.add_post("/api/v1/hooks/{id}/toggle", api.toggle_hook)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/api/v1/hooks/missing/toggle", json={"enabled": False})
        assert resp.status == 404


@pytest.mark.asyncio
async def test_update_hook(mock_server, api):
    store = HookStore(mock_server._workspace)
    store.create({"id": "a1", "event": "Stop", "run_mode": "process",
                  "scope": "用户", "command": "echo x", "name": "", "enabled": True})

    app = web.Application()
    app.router.add_put("/api/v1/hooks/{id}", api.update_hook)
    async with TestClient(TestServer(app)) as client:
        resp = await client.put("/api/v1/hooks/a1", json={"command": "echo y"})
        assert resp.status == 200
        data = await resp.json()
        assert data["hook"]["command"] == "echo y"
        # omitted event preserved
        assert data["hook"]["event"] == "Stop"


@pytest.mark.asyncio
async def test_delete_hook(mock_server, api):
    store = HookStore(mock_server._workspace)
    store.create({"id": "a1", "event": "Stop", "run_mode": "process",
                  "scope": "用户", "command": "echo x", "name": "", "enabled": True})

    app = web.Application()
    app.router.add_delete("/api/v1/hooks/{id}", api.delete_hook)
    async with TestClient(TestServer(app)) as client:
        resp = await client.delete("/api/v1/hooks/a1")
        assert resp.status == 200
        assert store.list_all() == []
        resp2 = await client.delete("/api/v1/hooks/a1")
        assert resp2.status == 404
