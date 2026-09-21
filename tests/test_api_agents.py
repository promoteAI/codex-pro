# tests/test_api_agents.py
import pytest
from unittest.mock import MagicMock
from aiohttp import web
from aiohttp.test_utils import TestServer, TestClient

from codex_pro.agent.multi_agent.store import WorkerProfileStore, profile_from_dict
from codex_pro.gateway.api.agents import AgentsAPI


@pytest.fixture
def mock_server(tmp_path):
    loop = MagicMock()
    loop.config.multi_agent.enabled = True
    server = MagicMock()
    server._require_api_token = MagicMock(return_value=None)
    # Mutations moved to the admin guard; keep both mocked so these tests
    # exercise handler logic rather than authorization.
    server._require_admin_token = MagicMock(return_value=None)
    server.auth = MagicMock()
    server._workspace = tmp_path
    server._agent_loop = loop
    return server


@pytest.fixture
def api(mock_server):
    return AgentsAPI(mock_server)


def sample_record(**overrides):
    base = {
        "id": "coder",
        "name": "Coding Worker",
        "description": "Writes and tests code.",
        "instructions": "Focus on correct, tested code.",
        "default_tools": ["read_file", "write_file"],
        "model": "",
        "provider": "",
        "max_iterations": 12,
        "max_tokens": 8192,
        "temperature": 0.3,
    }
    base.update(overrides)
    return base


def test_store_roundtrip(tmp_path):
    store = WorkerProfileStore(tmp_path)
    rec = sample_record()
    store.create(rec)
    loaded = store.list_records()
    assert len(loaded) == 1
    assert loaded[0]["name"] == "Coding Worker"
    # upsert + delete
    assert store.upsert("coder", {"temperature": 0.5})["temperature"] == 0.5
    assert store.delete("coder") is True
    assert store.delete("coder") is False


def test_profile_from_dict_defaults():
    p = profile_from_dict({"id": "x", "name": "X"})
    assert p.max_iterations == 12
    assert p.max_tokens == 8192
    assert p.default_tools == ()


@pytest.mark.asyncio
async def test_list_agents(mock_server, api):
    store = WorkerProfileStore(mock_server._workspace)
    store.create(sample_record())

    app = web.Application()
    app.router.add_get("/api/v1/agents", api.list_agents)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/api/v1/agents")
        assert resp.status == 200
        data = await resp.json()
        assert data["total"] == 1
        assert data["agents"][0]["id"] == "coder"
        assert data["agents"][0]["default_tools"] == ["read_file", "write_file"]


@pytest.mark.asyncio
async def test_create_agent(mock_server, api):
    app = web.Application()
    app.router.add_post("/api/v1/agents", api.create_agent)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/api/v1/agents", json=sample_record())
        assert resp.status == 201
        data = await resp.json()
        assert data["agent"]["id"] == "coder"


@pytest.mark.asyncio
async def test_create_agent_requires_name(mock_server, api):
    app = web.Application()
    app.router.add_post("/api/v1/agents", api.create_agent)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/api/v1/agents", json={"id": "coder", "name": ""})
        assert resp.status == 400


@pytest.mark.asyncio
async def test_create_agent_duplicate_id(mock_server, api):
    store = WorkerProfileStore(mock_server._workspace)
    store.create(sample_record())
    app = web.Application()
    app.router.add_post("/api/v1/agents", api.create_agent)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/api/v1/agents", json=sample_record())
        assert resp.status == 409


@pytest.mark.asyncio
async def test_create_agent_invalid_id(mock_server, api):
    app = web.Application()
    app.router.add_post("/api/v1/agents", api.create_agent)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/api/v1/agents", json=sample_record(id="bad id!", name="X"))
        assert resp.status == 400


@pytest.mark.asyncio
async def test_delete_agent(mock_server, api):
    store = WorkerProfileStore(mock_server._workspace)
    store.create(sample_record())
    app = web.Application()
    app.router.add_delete("/api/v1/agents/{id}", api.delete_agent)
    async with TestClient(TestServer(app)) as client:
        resp = await client.delete("/api/v1/agents/coder")
        assert resp.status == 200
        assert store.list_records() == []
        resp2 = await client.delete("/api/v1/agents/coder")
        assert resp2.status == 404


@pytest.mark.asyncio
async def test_update_agent(mock_server, api):
    store = WorkerProfileStore(mock_server._workspace)
    store.create(sample_record())
    app = web.Application()
    app.router.add_put("/api/v1/agents/{id}", api.update_agent)
    async with TestClient(TestServer(app)) as client:
        resp = await client.put("/api/v1/agents/coder", json={"temperature": 0.7})
        assert resp.status == 200
        data = await resp.json()
        assert data["agent"]["temperature"] == 0.7
        # omitted fields preserved
        assert data["agent"]["name"] == "Coding Worker"


@pytest.mark.asyncio
async def test_update_agent_not_found(mock_server, api):
    app = web.Application()
    app.router.add_put("/api/v1/agents/{id}", api.update_agent)
    async with TestClient(TestServer(app)) as client:
        resp = await client.put("/api/v1/agents/missing", json={"name": "X"})
        assert resp.status == 404


@pytest.mark.asyncio
async def test_list_agents_disabled(mock_server, api):
    mock_server._agent_loop.config.multi_agent.enabled = False
    app = web.Application()
    app.router.add_get("/api/v1/agents", api.list_agents)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/api/v1/agents")
        assert resp.status == 503
