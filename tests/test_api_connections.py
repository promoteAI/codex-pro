# tests/test_api_connections.py
import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from codex_pro.gateway.api.connections import ConnectionsAPI


@pytest.fixture
def mock_server(tmp_path):
    server = MagicMock()
    # Connections are fully admin-scoped (they reference host/credentials on
    # this machine), so both guards are the admin guard. Mock it as a pass-
    # through so handler logic is exercised rather than authorization.
    server._require_admin_token = MagicMock(return_value=None)
    server._workspace = tmp_path
    return server


@pytest.fixture
def api(mock_server):
    return ConnectionsAPI(mock_server)


@pytest.fixture
def store_path(mock_server):
    return Path(mock_server._workspace) / "data" / "connections.json"


@pytest.mark.asyncio
async def test_list_connections_empty(api):
    app = web.Application()
    app.router.add_get("/api/v1/connections", api.list_connections)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/api/v1/connections")
        assert resp.status == 200
        data = await resp.json()
        assert data == {"connections": [], "total": 0}


@pytest.mark.asyncio
async def test_add_and_list_connection(api, store_path):
    app = web.Application()
    app.router.add_post("/api/v1/connections", api.add_connection)
    app.router.add_get("/api/v1/connections", api.list_connections)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/api/v1/connections", json={
            "name": "prod", "host": "10.0.0.1", "port": 22, "user": "root",
            "auth_method": "identity", "identity_file": "~/.ssh/id_ed25519",
            "password": "s3cret",
        })
        assert resp.status == 201
        created = (await resp.json())["connection"]
        assert created["name"] == "prod"
        assert created["host"] == "10.0.0.1"
        # The password must never be echoed back.
        assert "password" not in created
        assert created["has_password"] is True

        # Persisted on disk.
        assert store_path.exists()
        raw = json.loads(store_path.read_text(encoding="utf-8"))
        assert raw["prod"]["password"] == "s3cret"

        resp = await client.get("/api/v1/connections")
        data = await resp.json()
        assert data["total"] == 1
        assert data["connections"][0]["name"] == "prod"


@pytest.mark.asyncio
async def test_add_connection_requires_host_and_name(api):
    app = web.Application()
    app.router.add_post("/api/v1/connections", api.add_connection)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/api/v1/connections", json={"name": ""})
        assert resp.status == 400
        data = await resp.json()
        assert "name" in data["error"]
        assert "host" in data["error"]


@pytest.mark.asyncio
async def test_add_connection_rejects_bad_port_and_auth(api):
    app = web.Application()
    app.router.add_post("/api/v1/connections", api.add_connection)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/api/v1/connections", json={
            "name": "x", "host": "h", "port": 99999, "auth_method": "bogus",
        })
        assert resp.status == 400
        data = await resp.json()
        assert "port" in data["error"]
        assert "auth_method" in data["error"]


@pytest.mark.asyncio
async def test_add_connection_duplicate_conflict(api):
    app = web.Application()
    app.router.add_post("/api/v1/connections", api.add_connection)
    async with TestClient(TestServer(app)) as client:
        first = await client.post("/api/v1/connections", json={"name": "dup", "host": "h"})
        assert first.status == 201
        second = await client.post("/api/v1/connections", json={"name": "dup", "host": "h2"})
        assert second.status == 409


@pytest.mark.asyncio
async def test_update_connection(api):
    app = web.Application()
    app.router.add_post("/api/v1/connections", api.add_connection)
    app.router.add_put("/api/v1/connections/{name}", api.update_connection)
    async with TestClient(TestServer(app)) as client:
        await client.post("/api/v1/connections", json={
            "name": "prod", "host": "10.0.0.1", "user": "root",
            "auth_method": "identity", "identity_file": "~/.ssh/id_rsa",
        })
        resp = await client.put("/api/v1/connections/prod", json={
            "host": "10.0.0.2", "user": "deploy",
        })
        assert resp.status == 200
        updated = (await resp.json())["connection"]
        assert updated["host"] == "10.0.0.2"
        assert updated["user"] == "deploy"
        # Unchanged fields kept.
        assert updated["identity_file"] == "~/.ssh/id_rsa"


@pytest.mark.asyncio
async def test_update_connection_not_found(api):
    app = web.Application()
    app.router.add_put("/api/v1/connections/{name}", api.update_connection)
    async with TestClient(TestServer(app)) as client:
        resp = await client.put("/api/v1/connections/nope", json={"host": "h"})
        assert resp.status == 404


@pytest.mark.asyncio
async def test_update_connection_clears_password_when_empty(api):
    app = web.Application()
    app.router.add_post("/api/v1/connections", api.add_connection)
    app.router.add_put("/api/v1/connections/{name}", api.update_connection)
    async with TestClient(TestServer(app)) as client:
        await client.post("/api/v1/connections", json={
            "name": "pw", "host": "h", "auth_method": "password", "password": "old",
        })
        resp = await client.put("/api/v1/connections/pw", json={"password": ""})
        assert resp.status == 200
        updated = (await resp.json())["connection"]
        assert updated["has_password"] is False


@pytest.mark.asyncio
async def test_delete_connection(api):
    app = web.Application()
    app.router.add_post("/api/v1/connections", api.add_connection)
    app.router.add_delete("/api/v1/connections/{name}", api.delete_connection)
    async with TestClient(TestServer(app)) as client:
        await client.post("/api/v1/connections", json={"name": "prod", "host": "h"})
        resp = await client.delete("/api/v1/connections/prod")
        assert resp.status == 200
        assert (await resp.json())["status"] == "deleted"


@pytest.mark.asyncio
async def test_delete_connection_not_found(api):
    app = web.Application()
    app.router.add_delete("/api/v1/connections/{name}", api.delete_connection)
    async with TestClient(TestServer(app)) as client:
        resp = await client.delete("/api/v1/connections/ghost")
        assert resp.status == 404


@pytest.mark.asyncio
async def test_test_connection_not_found(api):
    app = web.Application()
    app.router.add_post("/api/v1/connections/{name}/test", api.test_connection)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/api/v1/connections/ghost/test")
        assert resp.status == 404


@pytest.mark.asyncio
async def test_refresh_returns_ssh_config_hosts(api, monkeypatch):
    from codex_pro.gateway.api import connections as connections_mod

    ssh_dir = Path("/tmp/fake-ssh")
    config_path = ssh_dir / "config"
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(
        "Host 10.1.2.3\n  HostName 10.1.2.3\n\nHost work\n  HostName work.example.com\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(connections_mod, "_ssh_config_path", lambda: config_path)

    app = web.Application()
    app.router.add_get("/api/v1/connections/refresh", api.refresh_connections)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/api/v1/connections/refresh")
        assert resp.status == 200
        data = await resp.json()
        hosts = [h["host"] for h in data["hosts"]]
        assert "10.1.2.3" in hosts
        assert "work" in hosts
