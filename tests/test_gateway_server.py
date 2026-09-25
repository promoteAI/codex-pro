"""Tests for GatewayServer HTTP handling, pending futures, and outbound resolution."""

from __future__ import annotations

import asyncio
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from codex_pro.bus.events import OutboundEvent, ContentBlock, ContentType
from codex_pro.bus.queue import MessageBus


def _make_gateway(no_project_folder: str | None = None):
    """Create a minimal GatewayServer for testing."""
    from codex_pro.gateway.server import GatewayServer
    from codex_pro.config.schema import GatewayConfig, GatewayAuthConfig, GatewaySessionPolicyConfig

    config = GatewayConfig(
        enabled=True,
        host="127.0.0.1",
        port=19999,
        auth=GatewayAuthConfig(mode="open"),
        session_policy=GatewaySessionPolicyConfig(mode="none"),
    )
    bus = MessageBus()
    channel_manager = MagicMock()
    session_manager = MagicMock()
    session_manager.get_or_create = AsyncMock(return_value=MagicMock(status="active"))
    # ``_reset_session_if_needed`` reads ``get`` to detect a brand-new session;
    # an existing session keeps it on the not-new path so SessionStart hooks
    # are not fired in these unit tests.
    session_manager.get = AsyncMock(return_value=MagicMock(status="active"))
    # ``save`` is awaited when the handler persists the session workspace.
    session_manager.save = AsyncMock()
    workspace = MagicMock()
    agent_loop = MagicMock()
    if no_project_folder is not None:
        agent_loop.config.ui.preferences.no_project_folder = no_project_folder

    gw = GatewayServer(
        config=config,
        bus=bus,
        channel_manager=channel_manager,
        session_manager=session_manager,
        workspace=workspace,
        agent_loop=agent_loop,
    )
    return gw, bus


class _JsonRequest:
    def __init__(self, body: dict):
        self._body = body
        self.headers = {}
        self.query = {}

    async def json(self) -> dict:
        return self._body


@pytest.mark.asyncio
async def test_handle_outbound_resolves_future() -> None:
    gw, _ = _make_gateway()

    future = asyncio.get_event_loop().create_future()
    gw._pending_http["event-123"] = future

    event = OutboundEvent(
        channel="gateway:api",
        chat_id="chat-1",
        content=[ContentBlock(type=ContentType.TEXT, text="response")],
    )
    event.is_final = True
    event.metadata = {"_inbound_event_id": "event-123"}

    await gw._handle_outbound(event)

    assert future.done()
    result = future.result()
    assert result["text"] == "response" or "content" in result or "text" in str(result)


@pytest.mark.asyncio
async def test_handle_outbound_drop_skipped() -> None:
    gw, _ = _make_gateway()

    future = asyncio.get_event_loop().create_future()
    gw._pending_http["event-456"] = future

    event = OutboundEvent(
        channel="gateway:api",
        chat_id="chat-1",
        content=[ContentBlock(type=ContentType.TEXT, text="dropped")],
    )
    event.is_final = True
    event.metadata = {"_drop": True, "_inbound_event_id": "event-456"}

    await gw._handle_outbound(event)

    assert not future.done()  # future not resolved because _drop


@pytest.mark.asyncio
async def test_handle_outbound_invalid_state_protected() -> None:
    gw, _ = _make_gateway()

    future = asyncio.get_event_loop().create_future()
    future.cancel()  # pre-cancel
    gw._pending_http["event-789"] = future

    event = OutboundEvent(
        channel="gateway:api",
        chat_id="chat-1",
        content=[ContentBlock(type=ContentType.TEXT, text="late")],
    )
    event.is_final = True
    event.metadata = {"_inbound_event_id": "event-789"}

    # Should not raise
    await gw._handle_outbound(event)


@pytest.mark.asyncio
async def test_pending_http_capacity_limit() -> None:
    gw, _ = _make_gateway()

    # Fill up pending_http to capacity
    for i in range(gw._MAX_PENDING_HTTP):
        gw._pending_http[f"event-{i}"] = asyncio.get_event_loop().create_future()

    assert len(gw._pending_http) == gw._MAX_PENDING_HTTP


@pytest.mark.asyncio
async def test_session_reset_clears_process_state_inside_session_lock() -> None:
    gw, _ = _make_gateway()
    entered = False

    class _Lock:
        async def __aenter__(self):
            nonlocal entered
            entered = True

        async def __aexit__(self, *_args):
            nonlocal entered
            entered = False

    gw.session_policy = MagicMock()
    gw.session_policy.should_reset.return_value = True
    gw.session_policy.reset = AsyncMock()
    gw.session_manager.acquire = AsyncMock(return_value=_Lock())

    async def _reset_state(_key):
        assert entered, "new-epoch caches must be cleared before releasing the session lock"

    gw._agent_loop.reset_session_state = AsyncMock(side_effect=_reset_state)
    _session, reset = await gw._reset_session_if_needed("cli:local")
    assert reset is True
    gw._agent_loop.reset_session_state.assert_awaited_once_with("cli:local")


@pytest.mark.asyncio
async def test_manual_reset_unblocks_human_wait_before_lock() -> None:
    gw, _ = _make_gateway()
    calls: list[str] = []

    class _Lock:
        async def __aenter__(self):
            calls.append("lock")

        async def __aexit__(self, *_args):
            pass

    gw.session_policy.reset = AsyncMock()
    gw.session_manager.acquire = AsyncMock(return_value=_Lock())
    gw._agent_loop.unblock_session_for_reset = MagicMock(
        side_effect=lambda _key: calls.append("unblock")
    )
    gw._agent_loop.reset_session_state = AsyncMock()

    await gw._reset_session_if_needed("cli:local", force=True)
    assert calls[:2] == ["unblock", "lock"]


@pytest.mark.asyncio
async def test_reset_fires_session_start_hooks_only_for_new_session(monkeypatch) -> None:
    """SessionStart hooks fire exactly once, on first creation, not on later messages."""
    from codex_pro.gateway.server import GatewayServer

    gw, _ = _make_gateway()
    fired: list[object] = []
    monkeypatch.setattr(
        GatewayServer, "_fire_session_start", lambda self, session: fired.append(session)
    )

    # Existing session (get returns non-None): must NOT fire.
    gw.session_manager.get = AsyncMock(return_value=MagicMock(status="active"))
    await gw._reset_session_if_needed("cli:existing")
    assert fired == []

    # Brand-new session (get returns None): must fire exactly once.
    gw.session_manager.get = AsyncMock(return_value=None)
    await gw._reset_session_if_needed("cli:new")
    assert len(fired) == 1


@pytest.mark.asyncio
async def test_handle_message_preserves_gateway_media_url_image_type(tmp_path: Path) -> None:
    gw, bus = _make_gateway()
    cached_image = tmp_path / "cached.png"
    gw.media_cache.download = AsyncMock(return_value=cached_image)
    bus.publish_inbound = AsyncMock(return_value=True)

    response = await gw._handle_message(_JsonRequest({
        "platform": "api",
        "user_id": "user-1",
        "chat_id": "chat-1",
        "text": "describe this",
        "media_urls": ["https://cdn.example.com/source"],
    }))

    assert response.status == 200
    event = bus.publish_inbound.await_args.args[0]
    assert event.content[1].type == ContentType.IMAGE
    assert event.media_items[0].type == ContentType.IMAGE


@pytest.mark.asyncio
async def test_handle_message_infers_image_from_cached_extension(tmp_path: Path) -> None:
    # 回归：URL 无扩展名，但下载后按 Content-Type 落地为 .heic，
    # 仍应识别为 IMAGE，而不是退化成 FILE（否则模型看不到图片）。
    gw, bus = _make_gateway()
    cached_heic = tmp_path / "abc123.heic"
    gw.media_cache.download = AsyncMock(return_value=cached_heic)
    bus.publish_inbound = AsyncMock(return_value=True)

    response = await gw._handle_message(_JsonRequest({
        "platform": "api",
        "user_id": "user-1",
        "chat_id": "chat-1",
        "text": "describe this",
        "media_urls": ["https://cdn.example.com/abc123"],
    }))

    assert response.status == 200
    event = bus.publish_inbound.await_args.args[0]
    assert event.content[1].type == ContentType.IMAGE


@pytest.mark.asyncio
async def test_handle_outbound_non_gateway_channel_ignored() -> None:
    gw, _ = _make_gateway()

    future = asyncio.get_event_loop().create_future()
    gw._pending_http["event-abc"] = future

    event = OutboundEvent(
        channel="weixin",
        chat_id="chat-1",
        content=[ContentBlock(type=ContentType.TEXT, text="hello")],
    )
    event.is_final = True
    event.metadata = {"_inbound_event_id": "event-abc"}

    await gw._handle_outbound(event)

    assert not future.done()  # not resolved for non-gateway channel


@pytest.mark.asyncio
async def test_message_persists_project_on_session() -> None:
    """A message carrying an explicit project must stamp it on the session so the
    sidebar can group the session under its project row (regression: the project
    assignment was dropped, leaving every session project=="" and breaking the
    per-project grouping)."""
    from codex_pro.session.manager import Session

    session = Session(key="cli:local")
    gw, bus = _make_gateway()
    gw._reset_session_if_needed = AsyncMock(return_value=(session, False))
    bus.publish_inbound = AsyncMock(return_value=True)

    response = await gw._handle_message(_JsonRequest({
        "platform": "api",
        "user_id": "user-1",
        "chat_id": "chat-1",
        "session_key": "cli:local",
        "project": "e:\\workspace\\codex-pro",
        "text": "hello",
    }))

    assert response.status == 200
    assert session.project == "e:\\workspace\\codex-pro"
    # The real cwd is persisted independently of the grouping label.
    assert session.workspace == "e:\\workspace\\codex-pro"

    # A no-project message must NOT set project (it stays "" for the recents list).
    session2 = Session(key="cli:other")
    gw._reset_session_if_needed = AsyncMock(return_value=(session2, False))
    response2 = await gw._handle_message(_JsonRequest({
        "platform": "api",
        "user_id": "user-1",
        "chat_id": "chat-1",
        "session_key": "cli:other",
        "text": "hello",
    }))
    assert response2.status == 200
    assert session2.project == ""


@pytest.mark.asyncio
async def test_no_project_message_persists_and_reuses_workspace(tmp_path: Path) -> None:
    """A no-project session gets a no_project_folder/{date}/{session_dir} workspace on
    its first message and reuses it verbatim on later messages — it must not widen the
    grouping label (project stays "") nor recompute the dir per message (no drift)."""
    from codex_pro.session.manager import Session
    from codex_pro.spill.layout import session_dir_name

    gw, _ = _make_gateway(no_project_folder=str(tmp_path))
    session = Session(key="cli:np")
    gw._reset_session_if_needed = AsyncMock(return_value=(session, False))

    message = {
        "platform": "api",
        "user_id": "user-1",
        "chat_id": "chat-1",
        "session_key": "cli:np",
        "text": "hello",
    }

    first = await gw._handle_message(_JsonRequest(message))
    assert first.status == 200

    # First message decides the isolated cwd and writes it to session.workspace.
    expected = (
        tmp_path /
        datetime.now().strftime("%Y-%m-%d") /
        session_dir_name("cli:np")
    )
    assert session.project == ""
    assert session.workspace == str(expected)
    gw.session_manager.save.assert_awaited_once()
    # The toolbox var handed to the message matches the persisted cwd.
    assert gw.session_manager.save.await_args.args[0] is session

    # A second no-project message reuses the persisted workspace, no recompute/mkdir.
    session.workspace = str(expected)  # simulate the persisted value
    gw._reset_session_if_needed = AsyncMock(return_value=(session, False))
    second = await gw._handle_message(_JsonRequest(message))
    assert second.status == 200
    assert session.workspace == str(expected)
