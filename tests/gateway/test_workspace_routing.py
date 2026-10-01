"""Tests for multi-workspace request routing (workspace-key resolution)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from codex_pro.workspace_registry import WorkspaceRegistry

_WORKSPACE_HEADER = "X-Codex-Workspace"


def _server_with(reg: WorkspaceRegistry):
    from codex_pro.gateway.server import GatewayServer
    from codex_pro.bus.queue import MessageBus
    from codex_pro.config.schema import GatewayConfig, GatewayAuthConfig, GatewaySessionPolicyConfig

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
        storage=MagicMock(),
        workspace_registry=reg,
    )


def test_resolve_absent_header_returns_default():
    reg = WorkspaceRegistry()
    reg.register("default", "/p/default")
    reg.register("other", "/p/other")
    assert _server_with(reg)._resolve_workspace(None).workspace_key == "default"


def test_resolve_known_key_returns_that_entry():
    reg = WorkspaceRegistry()
    reg.register("default", "/p/default")
    reg.register("other", "/p/other")
    assert _server_with(reg)._resolve_workspace("other").workspace_key == "other"


def test_resolve_unknown_key_falls_back_to_default():
    reg = WorkspaceRegistry()
    reg.register("default", "/p/default")
    assert _server_with(reg)._resolve_workspace("nope").workspace_key == "default"


def test_request_workspace_key_reads_header():
    class _Req:
        headers = {_WORKSPACE_HEADER: "ws-header"}

    assert _server_with(WorkspaceRegistry())._request_workspace_key(_Req()) == "ws-header"


def test_request_workspace_key_empty_header_returns_none():
    class _Req:
        headers = {_WORKSPACE_HEADER: "   "}

    assert _server_with(WorkspaceRegistry())._request_workspace_key(_Req()) is None
