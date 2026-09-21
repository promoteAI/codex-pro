# tests/test_browser_tabs.py
"""Tests for the browser tabs API and its JSON-backed store."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from codex_pro.gateway.api.browser_tabs import BrowserTabsAPI, TabStore


@pytest.fixture
def mock_server(tmp_path):
    server = MagicMock()
    server._require_api_token = MagicMock(return_value=None)
    server._require_admin_token = MagicMock(return_value=None)
    server._workspace = tmp_path
    return server


@pytest.fixture
def api(mock_server):
    return BrowserTabsAPI(mock_server)


def test_store_roundtrip(tmp_path):
    store = TabStore(tmp_path)
    assert store.list_all() == []
    tab = store.create(title="codex", url="https://example.com", suffix="· Chrome")
    assert tab["id"]
    loaded = store.list_all()
    assert len(loaded) == 1
    assert loaded[0]["title"] == "codex"
    assert loaded[0]["url"] == "https://example.com"
    assert store.delete(tab["id"]) is True
    assert store.delete(tab["id"]) is False
    assert store.list_all() == []


def test_store_handles_corrupt_file(tmp_path):
    store = TabStore(tmp_path)
    store._path.parent.mkdir(parents=True, exist_ok=True)
    store._path.write_text("{not json", encoding="utf-8")
    assert store.list_all() == []


@pytest.mark.asyncio
async def test_list_tabs_empty(mock_server, api):
    app = web.Application()
    app.router.add_get("/api/v1/browser/tabs", api.list_tabs)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/api/v1/browser/tabs")
        assert resp.status == 200
        data = await resp.json()
        assert data["tabs"] == []


@pytest.mark.asyncio
async def test_create_and_list_tab(mock_server, api):
    app = web.Application()
    app.router.add_get("/api/v1/browser/tabs", api.list_tabs)
    app.router.add_post("/api/v1/browser/tabs", api.create_tab)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/api/v1/browser/tabs", json={
            "title": "codex", "url": "https://example.com", "suffix": "· Chrome",
        })
        assert resp.status == 201
        tab = (await resp.json())["tab"]
        assert tab["title"] == "codex"

        resp = await client.get("/api/v1/browser/tabs")
        data = await resp.json()
        assert len(data["tabs"]) == 1
        assert data["tabs"][0]["id"] == tab["id"]


@pytest.mark.asyncio
async def test_create_tab_requires_title_and_url(mock_server, api):
    app = web.Application()
    app.router.add_post("/api/v1/browser/tabs", api.create_tab)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/api/v1/browser/tabs", json={"url": "https://x.com"})
        assert resp.status == 400
        resp = await client.post("/api/v1/browser/tabs", json={"title": "x"})
        assert resp.status == 400


@pytest.mark.asyncio
async def test_create_tab_invalid_json(mock_server, api):
    app = web.Application()
    app.router.add_post("/api/v1/browser/tabs", api.create_tab)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/api/v1/browser/tabs", data="not-json")
        assert resp.status == 400


@pytest.mark.asyncio
async def test_delete_tab(mock_server, api):
    app = web.Application()
    app.router.add_post("/api/v1/browser/tabs", api.create_tab)
    app.router.add_delete("/api/v1/browser/tabs/{id}", api.delete_tab)
    async with TestClient(TestServer(app)) as client:
        tab = (await (await client.post("/api/v1/browser/tabs", json={
            "title": "a", "url": "https://x.com"})).json())["tab"]
        resp = await client.delete(f"/api/v1/browser/tabs/{tab['id']}")
        assert resp.status == 200
        resp = await client.delete(f"/api/v1/browser/tabs/{tab['id']}")
        assert resp.status == 404


@pytest.mark.asyncio
async def test_mutations_require_admin(mock_server, api):
    # A token guard returning 403 stands in for the admin gate.
    server = mock_server
    server._require_admin_token = MagicMock(
        return_value=web.json_response({"error": "admin required"}, status=403))
    api = BrowserTabsAPI(server)
    app = web.Application()
    app.router.add_post("/api/v1/browser/tabs", api.create_tab)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/api/v1/browser/tabs", json={
            "title": "a", "url": "https://x.com"})
        assert resp.status == 403
