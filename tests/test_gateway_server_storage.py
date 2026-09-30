"""Tests for GatewayServer storage wiring (project entity registration)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from codex_pro.config.schema import GatewayConfig, GatewayAuthConfig, GatewaySessionPolicyConfig


def _make_server(storage):
    from codex_pro.gateway.server import GatewayServer
    from codex_pro.bus.queue import MessageBus

    config = GatewayConfig(
        enabled=True,
        host="127.0.0.1",
        port=0,
        auth=GatewayAuthConfig(mode="open", api_tokens=[]),
        session_policy=GatewaySessionPolicyConfig(mode="none"),
    )
    session_manager = MagicMock()
    session_manager.get_or_create = AsyncMock(return_value=MagicMock(status="active"))
    session_manager.get = AsyncMock(return_value=MagicMock(status="active"))
    return GatewayServer(
        config=config,
        bus=MessageBus(),
        channel_manager=MagicMock(),
        session_manager=session_manager,
        workspace=Path("/tmp/codex-pro-test-ws"),
        agent_loop=None,
        storage=storage,
    )


def test_gateway_server_exposes_storage_for_project_registration() -> None:
    """The storage backend passed to GatewayServer must be exposed as server.storage,
    so GitAPI._store_project_meta can actually register project entities in production.
    """
    storage = MagicMock()
    server = _make_server(storage)
    assert server.storage is storage
