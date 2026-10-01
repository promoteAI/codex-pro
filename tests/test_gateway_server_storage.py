"""Tests for GatewayServer storage wiring (project entity registration)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from codex_pro.config.schema import GatewayConfig, GatewayAuthConfig, GatewaySessionPolicyConfig


def _make_server(storage, workspace_registry=None):
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
        workspace_registry=workspace_registry,
    )


def test_gateway_server_exposes_storage_for_project_registration() -> None:
    """The storage backend passed to GatewayServer must be exposed as server.storage,
    so GitAPI._store_project_meta can actually register project entities in production.
    """
    storage = MagicMock()
    server = _make_server(storage)
    assert server.storage is storage


def test_gateway_server_accepts_workspace_registry() -> None:
    from codex_pro.workspace_registry import WorkspaceRegistry

    registry = WorkspaceRegistry()
    server = _make_server(MagicMock(), workspace_registry=registry)
    assert server.workspace_registry is registry
    # Fallback path: when no registry is supplied, one is created for the default
    # workspace so single-workspace callers keep working.
    fallback = _make_server(MagicMock(), workspace_registry=None)
    assert fallback.workspace_registry is not None
    assert fallback.workspace_registry.list() != []


def test_fallback_registry_entry_carries_session_manager() -> None:
    fallback = _make_server(MagicMock(), workspace_registry=None)
    entry = fallback.workspace_registry.default
    assert entry is not None
    assert entry.session_manager is fallback.session_manager
