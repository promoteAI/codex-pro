# tests/test_interactions_api.py
from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestServer, TestClient

from codex_pro.agent.loop import AgentLoop
from codex_pro.agent.clarify_manager import ClarifyManager, ClarifyRequest
from codex_pro.permissions.manager import ApprovalRequest, ApprovalStatus
from codex_pro.gateway.api.interactions import InteractionsAPI


@pytest.fixture
def mock_server():
    server = MagicMock()
    server._require_api_token = MagicMock(return_value=None)
    # spec_set=AgentLoop so assigning an attribute the loop does not expose
    # raises AttributeError — catching contract drift the API would hit.
    loop = MagicMock(spec_set=AgentLoop)
    # approval / clarify are real so the endpoint can read real state. They are
    # instance attributes (set in AgentLoop.__init__), not class-level, so a
    # spec_set mock refuses a plain assignment; object.__setattr__ sets them
    # while keeping the spec_set contract-drift guard in place.
    object.__setattr__(loop, "approval", MagicMock())
    object.__setattr__(loop, "clarify", ClarifyManager())
    server._agent_loop = loop
    return server


@pytest.fixture
def api(mock_server):
    return InteractionsAPI(mock_server)


def _req(**kw) -> ApprovalRequest:
    defaults = dict(
        id="req-1", action="exec", tool_name="exec",
        params={"command": "rm -rf /tmp/x"}, user_id="",
        status=ApprovalStatus.PENDING, session_key="cli:abc",
    )
    defaults.update(kw)
    return ApprovalRequest(**defaults)


@pytest.mark.asyncio
async def test_interactions_returns_pending_approvals_for_session(mock_server, api):
    mock_server._agent_loop.approval.get_pending = MagicMock(return_value=[
        _req(id="req-1", session_key="cli:abc"),
        _req(id="req-2", session_key="cli:other"),
    ])
    app = web.Application()
    app.router.add_get("/api/v1/interactions", api.handle_interactions)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/api/v1/interactions?session_key=cli:abc")
        body = await resp.json()
    assert [a["id"] for a in body["approvals"]] == ["req-1"]
    assert body["approvals"][0]["risk"] == "exec"
    assert body["clarify"] is None


@pytest.mark.asyncio
async def test_interactions_returns_empty_when_no_pending(mock_server, api):
    mock_server._agent_loop.approval.get_pending = MagicMock(return_value=[])
    app = web.Application()
    app.router.add_get("/api/v1/interactions", api.handle_interactions)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/api/v1/interactions?session_key=cli:abc")
        body = await resp.json()
    assert body["approvals"] == []
    assert body["clarify"] is None


@pytest.mark.asyncio
async def test_interactions_returns_clarify_prompt(mock_server, api):
    mock_server._agent_loop.clarify._im_pending = {
        "cli:abc": ClarifyRequest(
            id="c-1", question="选哪个?", options=["A", "B"], session_key="cli:abc",
        ),
    }
    app = web.Application()
    app.router.add_get("/api/v1/interactions", api.handle_interactions)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/api/v1/interactions?session_key=cli:abc")
        body = await resp.json()
    assert body["clarify"]["id"] == "c-1"
    assert body["clarify"]["question"] == "选哪个?"
    assert body["clarify"]["options"] == ["A", "B"]
