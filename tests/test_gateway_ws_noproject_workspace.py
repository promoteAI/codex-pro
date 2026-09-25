"""WS 无项目会话工作区验证:首条消息应把 no_project_dir 写入 event.metadata["workspace"]。

回归:此前 WS 路径把 project 当 workspace,无项目时 metadata["workspace"] 为空,
导致工具回落到全局 ~/.codex-pro 执行。
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import aiohttp
import pytest

from codex_pro.session.manager import Session, SessionManager
from codex_pro.spill.layout import session_dir_name


async def _ws_auth(ws) -> None:
    await ws.send_json({
        "type": "auth",
        "platform": "api",
        "user_id": "user",
        "chat_id": "chat",
    })
    assert (await asyncio.wait_for(ws.receive_json(), timeout=2))["type"] == "auth_ok"


def _gateway(tmp_path: Path):
    from codex_pro.bus.queue import MessageBus
    from codex_pro.config.loader import load_config
    from codex_pro.config.schema import (
        GatewayAuthConfig,
        GatewayConfig,
        GatewaySessionPolicyConfig,
    )
    from codex_pro.gateway.server import GatewayServer

    config = GatewayConfig(
        enabled=True,
        host="127.0.0.1",
        port=0,
        auth=GatewayAuthConfig(mode="open"),
        session_policy=GatewaySessionPolicyConfig(mode="none"),
    )
    bus = MessageBus()
    bus.publish_inbound = AsyncMock(return_value=True)
    # 真实 config 提供 ui.preferences.no_project_folder,否则 WS 无项目分支会 AttributeError。
    config_obj = load_config(tmp_path / "nope.yaml") if False else None
    sessions = SessionManager(sessions_dir=tmp_path / "sessions")
    # agent_loop 需要 .config.ui.preferences.no_project_folder
    agent_loop = MagicMock()
    from codex_pro.config.schema_defs.ui import UIPreferences
    from codex_pro.config.schema_defs.ui import UIConfig, UIPreferences
    agent_loop.config.ui.preferences.no_project_folder = str(tmp_path / "no-project")
    gateway = GatewayServer(
        config=config,
        bus=bus,
        channel_manager=MagicMock(),
        session_manager=sessions,
        workspace=tmp_path,
        agent_loop=agent_loop,
    )
    return gateway, bus.publish_inbound, sessions


@pytest.mark.asyncio
async def test_ws_no_project_persists_workspace_and_metadata(tmp_path: Path) -> None:
    gateway, publish, sessions = _gateway(tmp_path)
    await gateway.start()
    try:
        async with aiohttp.ClientSession() as client:
            async with client.ws_connect(
                f"ws://127.0.0.1:{gateway.actual_port}/ws"
            ) as ws:
                await _ws_auth(ws)
                await ws.send_json({
                    "type": "message",
                    "text": "list current directory",
                    "session_key": "cli:web-np-1",
                })
                # 等待消息被处理并发布 inbound event
                for _ in range(20):
                    if publish.await_args is not None:
                        break
                    await asyncio.sleep(0.1)
                assert publish.await_args is not None, "no inbound event published"

                event = publish.await_args.args[0]
                assert event.metadata.get("gateway") is True, event.metadata
                expected = (
                    tmp_path / "no-project" /
                    __import__("datetime").datetime.now().strftime("%Y-%m-%d") /
                    session_dir_name("cli:web-np-1")
                )
                # 路径是绝对路径,但 tmp_path 可能是相对;用 resolve 后的字符串比较
                got = event.metadata.get("workspace", "")
                assert got, f"workspace empty in metadata: {event.metadata}"
                assert Path(got).name == expected.name, f"got {got}"
                assert "no-project" in Path(got).parts, f"got {got}"

        # session manager 里也持久化了 workspace
        session = await sessions.get("cli:web-np-1")
        assert session is not None
        assert session.project == ""
        assert session.workspace, "session.workspace not persisted"
        assert "no-project" in Path(session.workspace).parts, session.workspace
    finally:
        await gateway.stop()
