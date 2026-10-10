"""Regression: a cli: WS client that sends a plain-text turn receives the full
token-streaming + cognitive-thinking frame sequence.

The web frontend switched to the interactive /ws with platform="cli"
(delivery_key = gateway:cli:<chat_id>). This pins the end-to-end path the
frontend depends on:

  1. auth (platform=cli, session_key=cli:web-..., chat_id=...) → auth_ok
  2. send {type:"message", text} → accepted (carries event_id)
  3. a cognitive thinking frame (message_kind="cognitive", cog_type="thinking",
     data.text = whole trace) — only produced for gateway:cli
  4. a streaming token frame (message_kind="streaming", _token_stream=True)
  5. an eventual final frame (message_kind="final", full text)

It also guards the routing invariant: delivery_key == the chat_id the event
carries, so the socket that authenticated under chat_id=<session_key> is the
one that receives the reply.
"""

import asyncio

import aiohttp
import pytest
import pytest_asyncio

from codex_pro.bus.events import OutboundEvent, ContentBlock, ContentType


@pytest_asyncio.fixture
async def gateway_streaming_agent():
    """Gateway whose agent emits thinking → streaming → final for the turn."""
    from pathlib import Path
    from unittest.mock import AsyncMock, MagicMock

    from codex_pro.bus.queue import MessageBus
    from codex_pro.config.schema import (
        GatewayConfig,
        GatewayAuthConfig,
        GatewaySessionPolicyConfig,
    )
    from codex_pro.gateway.server import GatewayServer

    config = GatewayConfig(
        enabled=True,
        host="127.0.0.1",
        port=0,
        auth=GatewayAuthConfig(mode="open", api_tokens=[]),
        session_policy=GatewaySessionPolicyConfig(mode="none"),
    )

    bus = MessageBus()
    session_manager = MagicMock()
    session_manager.get_or_create = AsyncMock(return_value=MagicMock(status="active"))
    session_manager.get = AsyncMock(return_value=MagicMock(status="active"))

    async def fake_agent(event):
        # NOTE: each outbound builds a FRESH metadata dict — never
        # ``dict(event.metadata)``. The mock session_manager returns a
        # MagicMock whose ``.workspace`` is itself a MagicMock; the handler
        # stores that into ``event.metadata["workspace"]``, which json cannot
        # serialize. Fresh metadata (like the gateway_with_fresh_metadata_agent
        # fixture) sidesteps the leak and keeps the serializable payload.

        # 1) Cognitive thinking frame — gated to gateway:cli at the emitter.
        cog = OutboundEvent(
            channel=event.channel,
            chat_id=event.chat_id,
            content=[ContentBlock(type=ContentType.TEXT, text="思考中")],
            is_final=False,
            message_kind="cognitive",
            metadata={
                "_progress": True,
                "cog_type": "thinking",
                "cog_event_id": "evt_cog_1",
                "_inbound_event_id": event.event_id,
                "data": {
                    "thinking_id": "th_1",
                    "text": "Let me think through this.",
                    "duration_ms": 120,
                    "streaming": True,
                    "retracted": False,
                },
            },
        )
        await bus.publish_outbound(cog)

        # 2) Streaming token frame.
        stream = OutboundEvent(
            channel=event.channel,
            chat_id=event.chat_id,
            content=[ContentBlock(type=ContentType.TEXT, text="Hel")],
            is_final=False,
            message_kind="streaming",
            metadata={
                "_inbound_event_id": event.event_id,
                "_token_stream": True,
            },
        )
        await bus.publish_outbound(stream)

        # 3) Final frame (full text).
        final = OutboundEvent(
            channel=event.channel,
            chat_id=event.chat_id,
            content=[ContentBlock(type=ContentType.TEXT, text="Hello world")],
            is_final=True,
            message_kind="final",
            metadata={
                "_inbound_event_id": event.event_id,
                "_token_stream": True,
                "_stream_full_text": True,
            },
        )
        await bus.publish_outbound(final)

    bus.subscribe_inbound(fake_agent)

    server = GatewayServer(
        config=config,
        bus=bus,
        channel_manager=MagicMock(),
        session_manager=session_manager,
        workspace=Path("/tmp/codex-pro-test-stream"),
        agent_loop=None,
    )
    await bus.start()
    await server.start()
    try:
        yield f"ws://127.0.0.1:{server.actual_port}/ws"
    finally:
        await server.stop()
        await bus.stop()


@pytest.mark.asyncio
async def test_cli_client_receives_thinking_streaming_and_final(gateway_streaming_agent):
    """A platform=cli client receives the cognitive + streaming + final sequence."""
    async with aiohttp.ClientSession() as s:
        async with s.ws_connect(gateway_streaming_agent) as ws:
            await ws.send_json({
                "type": "auth",
                "platform": "cli",
                "user_id": "alice",
                "chat_id": "cli:web-test",
                "session_key": "cli:web-test",
            })
            assert (await ws.receive_json())["type"] == "auth_ok"

            await ws.send_json({"type": "message", "text": "hi"})

            # Collect until we have the final frame (or timeout).
            msg_kinds: list[str] = []
            chat_ids: set[str] = set()
            got_thinking = got_streaming = got_final = False
            for _ in range(10):
                m = await asyncio.wait_for(ws.receive_json(), timeout=5)
                if m.get("type") == "accepted":
                    continue
                if m.get("type") != "message":
                    continue
                msg_kinds.append(m.get("message_kind"))
                chat_ids.add(m.get("chat_id", ""))
                meta = m.get("metadata") or {}
                if m.get("message_kind") == "cognitive":
                    if meta.get("cog_type") == "thinking":
                        got_thinking = True
                        assert meta["data"]["text"] == "Let me think through this."
                        assert meta["data"]["thinking_id"] == "th_1"
                elif m.get("message_kind") == "streaming":
                    if meta.get("_token_stream"):
                        got_streaming = True
                elif m.get("message_kind") == "final":
                    got_final = True
                    assert m.get("text") == "Hello world"
                if got_thinking and got_streaming and got_final:
                    break

            assert got_thinking, f"no thinking frame; got kinds={msg_kinds}"
            assert got_streaming, f"no streaming frame; got kinds={msg_kinds}"
            assert got_final, f"no final frame; got kinds={msg_kinds}"
            # Routing invariant: every reply routed to the chat_id this socket
            # registered under (delivery_key = gateway:cli:cli:web-test).
            assert "cli:web-test" in chat_ids, f"wrong chat_id routing: {chat_ids}"
