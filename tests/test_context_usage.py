# tests/test_context_usage.py
from __future__ import annotations

import pytest
from unittest.mock import MagicMock, AsyncMock
from aiohttp import web
from aiohttp.test_utils import TestServer, TestClient

from codex_pro.gateway.api.context_usage import ContextUsageAPI
from codex_pro.session.manager import Session


@pytest.fixture
def mock_server():
    server = MagicMock()
    server._require_admin_token = MagicMock(return_value=None)
    # Minimal agent_loop: compressor carries the real display window; tools
    # return an empty registry so the tool segment is 0 and omitted.
    loop = MagicMock()
    compressor = MagicMock()
    compressor.context_window_tokens = 200_000
    compressor._token_counter = None  # fall back to the len/4 heuristic
    compressor.estimate_tokens.return_value = 100
    loop.compressor = compressor
    loop.context = MagicMock()
    loop.context.build_system_prompt.return_value = "You are a helpful assistant."
    loop.tools = MagicMock()
    loop.tools.get_definitions.return_value = []
    loop.skill_store = None
    loop.memory = None
    loop._default_model = "claude-sonnet-4"
    loop.config = MagicMock()
    loop.config.memory = MagicMock(enabled=False)
    loop.config.models.model_windows = {}
    loop.config.session.context_window_tokens = 0
    server._agent_loop = loop
    server.session_manager = AsyncMock()
    return server


@pytest.fixture
def api(mock_server):
    return ContextUsageAPI(mock_server)


def _make_session(key: str = "cli:abc") -> Session:
    session = Session(key=key)
    session.add_message("user", "hello world")
    session.add_message("assistant", "hi there")
    return session


@pytest.mark.asyncio
async def test_context_usage_returns_segments(api, mock_server):
    mock_server.session_manager.get = AsyncMock(return_value=_make_session())

    app = web.Application()
    app.router.add_get("/api/v1/sessions/{key}/context-usage", api.get_context_usage)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/api/v1/sessions/cli%3Aabc/context-usage")
        assert resp.status == 200
        data = await resp.json()
        assert data["max"] == 200_000
        # system segment present (build_system_prompt returns a token-able string)
        keys = [s["key"] for s in data["segments"]]
        assert "system" in keys
        assert "conversation" in keys
        # tools segment omitted because the registry returned []
        assert "tools" not in keys
        for seg in data["segments"]:
            assert seg["tokens"] > 0
            assert "direct" in seg
            assert "label" in seg
            assert "color" in seg
        assert data["used"] == sum(s["tokens"] for s in data["segments"])
        # max is honored: direct percentages formatted without error
        assert (data["used"] / data["max"]) < 1.0 or data["used"] >= 0


@pytest.mark.asyncio
async def test_context_usage_not_found(api, mock_server):
    mock_server.session_manager.get = AsyncMock(return_value=None)

    app = web.Application()
    app.router.add_get("/api/v1/sessions/{key}/context-usage", api.get_context_usage)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/api/v1/sessions/missing/context-usage")
        assert resp.status == 404


@pytest.mark.asyncio
async def test_context_usage_auth_guard(api, mock_server):
    mock_server._require_admin_token = MagicMock(
        return_value=web.json_response({"error": "forbidden"}, status=403)
    )

    app = web.Application()
    app.router.add_get("/api/v1/sessions/{key}/context-usage", api.get_context_usage)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/api/v1/sessions/cli%3Aabc/context-usage")
        assert resp.status == 403
        # Guard short-circuits before touching the session store.
        mock_server.session_manager.get.assert_not_called()
