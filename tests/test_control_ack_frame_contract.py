"""Contract: lock-free control-ack frames (/approve, /deny, /clarify replies)
are stamped ``metadata["_control_turn"]=True`` so interactive clients (web
chat / sidechat) can distinguish a control ack from the REAL turn terminal.

Why: the TUI classifies these via send-order correlation (TurnRegistry), but
a web client sees only the outbound frame. Without a frame-level signal the
front end cannot tell that a parked primary turn is still running, so a
clarify answer's ack frame ends the original turn's spinner and its
tool/thinking activity. See docs/superpowers plans "fix-clarify-ws-terminal".
"""
from __future__ import annotations

import asyncio

import pytest

from codex_pro.agent.inbound import InboundHandler
from codex_pro.agent.loop import AgentLoop
from codex_pro.bus.events import InboundEvent
from codex_pro.bus.queue import MessageBus
from codex_pro.config.loader import load_config
from codex_pro.models.provider import LLMProvider, LLMResponse


class _StubProvider(LLMProvider):
    def __init__(self):
        super().__init__()

    async def chat(self, messages, tools=None, model=None, tool_choice=None, **kwargs):
        return LLMResponse(content="ok", finish_reason="stop")

    async def chat_stream(self, messages, tools=None, model=None, tool_choice=None, on_delta=None, **kwargs):
        return await self.chat(messages, tools, model, tool_choice, **kwargs)

    def get_default_model(self):
        return "stub"


def _make_loop(tmp_path, bus: MessageBus):
    config = load_config(overrides={"workspace": str(tmp_path)})
    loop = AgentLoop(bus=bus, config=config, provider=_StubProvider(), workspace=tmp_path)
    loop._running = True
    return loop


@pytest.mark.asyncio
async def test_clarify_ack_frame_is_stamped_control_turn(tmp_path):
    bus = MessageBus()
    loop = _make_loop(tmp_path, bus)
    published: list = []

    async def capture(event):
        published.append(event)

    bus.subscribe_outbound_global(capture)

    req = loop.clarify.request("选哪个?", ["A", "B"], user_id="u1")
    event = InboundEvent.text_message(
        channel="gateway:cli", chat_id="c", sender_id="u1",
        text=f"/clarify {req.id} A",
    )

    await InboundHandler._on_inbound(loop, event)
    await asyncio.sleep(0)

    acks = [e for e in published if e.metadata.get("_inbound_event_id") == event.event_id]
    assert len(acks) == 1
    assert acks[0].is_final
    assert acks[0].metadata.get("_control_turn") is True


@pytest.mark.asyncio
async def test_approve_ack_frame_is_stamped_control_turn(tmp_path):
    bus = MessageBus()
    loop = _make_loop(tmp_path, bus)
    published: list = []

    async def capture(event):
        published.append(event)

    bus.subscribe_outbound_global(capture)

    req = loop.approval.request_approval("test_tool", "test_tool", {"arg": "v"}, "user1")
    event = InboundEvent.text_message(
        channel="gateway:cli", chat_id="c", sender_id="user1",
        text=f"/approve {req.id}",
    )

    await InboundHandler._on_inbound(loop, event)
    await asyncio.sleep(0)

    acks = [e for e in published if e.metadata.get("_inbound_event_id") == event.event_id]
    assert len(acks) == 1
    assert acks[0].is_final
    assert acks[0].metadata.get("_control_turn") is True
