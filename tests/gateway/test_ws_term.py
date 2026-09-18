# tests/gateway/test_ws_term.py
"""Tests for the /ws/term terminal WebSocket endpoint."""

import asyncio
import base64
import json
from unittest.mock import MagicMock

import aiohttp
import pytest
import pytest_asyncio

from aiohttp import web

from codex_pro.config.schema_defs.gateway import TerminalConfig


class FakePty:
    """In-memory stand-in for a real PTY, injected via TerminalWebSocket."""

    def __init__(self, **kwargs):
        self.on_read = None
        self.exit_code = 0
        self.writes: list[bytes] = []
        self.resize_calls: list[tuple[int, int]] = []
        self.terminated = False
        self.started = False
        self._proc = None  # signals interrupt() to no-op in TermSession
        self.kwargs = kwargs

    def set_on_read(self, cb):
        self.on_read = cb

    async def start(self):
        self.started = True

    async def write(self, data: bytes):
        self.writes.append(data)

    async def resize(self, cols: int, rows: int):
        self.resize_calls.append((cols, rows))

    async def terminate(self, grace: float = 5.0):
        self.terminated = True

    async def _emit(self, chunk: bytes):
        if self.on_read is not None:
            await self.on_read(chunk)


@pytest_asyncio.fixture
async def term_ws_url():
    """Start a minimal aiohttp app with TerminalWebSocket on loopback."""
    from codex_pro.gateway.term.ws_term import TerminalWebSocket

    server_mock = MagicMock()
    server_mock.auth = MagicMock()
    server_mock.auth.authenticate_token = MagicMock(return_value=True)
    server_mock.auth.is_cross_site_browser = MagicMock(return_value=False)
    server_mock.auth.audit = MagicMock()
    server_mock._config = MagicMock()
    server_mock._config.ws_heartbeat_seconds = 0

    created_ptys: list[FakePty] = []

    def pty_factory(**kwargs):
        p = FakePty(**kwargs)
        created_ptys.append(p)
        return p

    tws = TerminalWebSocket(server_mock, TerminalConfig(), pty_factory=pty_factory)

    app = web.Application()
    app.router.add_get("/ws/term", tws.handle)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = runner.addresses[0][1]

    try:
        yield {
            "url": f"ws://127.0.0.1:{port}/ws/term",
            "tws": tws,
            "server_mock": server_mock,
            "created_ptys": created_ptys,
        }
    finally:
        await site.stop()
        await runner.cleanup()


@pytest.mark.asyncio
async def test_bad_token_returns_auth_error(term_ws_url):
    info = term_ws_url
    info["server_mock"].auth.authenticate_token = MagicMock(return_value=False)

    async with aiohttp.ClientSession() as s:
        async with s.ws_connect(info["url"]) as ws:
            await ws.send_json({"type": "auth", "token": "bad"})
            msg = await asyncio.wait_for(ws.receive_json(), timeout=3)
            assert msg["type"] == "auth_error"


@pytest.mark.asyncio
async def test_auth_then_start_returns_process_id(term_ws_url):
    info = term_ws_url

    async with aiohttp.ClientSession() as s:
        async with s.ws_connect(info["url"]) as ws:
            await ws.send_json({"type": "auth", "token": "good"})
            assert (await asyncio.wait_for(ws.receive_json(), timeout=3))["type"] == "auth_ok"
            await ws.send_json({"type": "start", "id": "req1",
                                "params": {"shell": "/bin/sh", "cwd": "/tmp"}})
            msg = await asyncio.wait_for(ws.receive_json(), timeout=3)
            assert msg["type"] == "started"
            assert msg["reqId"] == "req1"
            assert msg["processId"].startswith("term_")


@pytest.mark.asyncio
async def test_pty_output_streamed_as_base64(term_ws_url):
    info = term_ws_url

    async with aiohttp.ClientSession() as s:
        async with s.ws_connect(info["url"]) as ws:
            await ws.send_json({"type": "auth", "token": "good"})
            await asyncio.wait_for(ws.receive_json(), timeout=3)
            await ws.send_json({"type": "start", "id": "r1", "params": {}})
            started = await asyncio.wait_for(ws.receive_json(), timeout=3)
            process_id = started["processId"]

            pty = info["created_ptys"][-1]
            await pty._emit(b"hello\r\n")

            msg = await asyncio.wait_for(ws.receive_json(), timeout=3)
            assert msg["type"] == "output"
            assert msg["processId"] == process_id
            assert msg["stream"] == "pty"
            assert msg["data"] == base64.b64encode(b"hello\r\n").decode("ascii")
            assert msg["seq"] == 1


@pytest.mark.asyncio
async def test_write_forwards_base64_to_pty(term_ws_url):
    info = term_ws_url

    async with aiohttp.ClientSession() as s:
        async with s.ws_connect(info["url"]) as ws:
            await ws.send_json({"type": "auth", "token": "good"})
            await asyncio.wait_for(ws.receive_json(), timeout=3)
            await ws.send_json({"type": "start", "id": "r1", "params": {}})
            started = await asyncio.wait_for(ws.receive_json(), timeout=3)
            process_id = started["processId"]
            pty = info["created_ptys"][-1]

            payload = base64.b64encode(b"ls -la\n").decode("ascii")
            await ws.send_json({"type": "write", "processId": process_id, "data": payload})
            await asyncio.sleep(0.1)

            assert pty.writes == [b"ls -la\n"]


@pytest.mark.asyncio
async def test_resize_forwards_to_pty(term_ws_url):
    info = term_ws_url

    async with aiohttp.ClientSession() as s:
        async with s.ws_connect(info["url"]) as ws:
            await ws.send_json({"type": "auth", "token": "good"})
            await asyncio.wait_for(ws.receive_json(), timeout=3)
            await ws.send_json({"type": "start", "id": "r1", "params": {}})
            started = await asyncio.wait_for(ws.receive_json(), timeout=3)
            process_id = started["processId"]
            pty = info["created_ptys"][-1]

            await ws.send_json({"type": "resize", "processId": process_id,
                                "cols": 120, "rows": 30})
            await asyncio.sleep(0.1)

            assert (120, 30) in pty.resize_calls


@pytest.mark.asyncio
async def test_disconnect_terminates_all_sessions(term_ws_url):
    info = term_ws_url

    async with aiohttp.ClientSession() as s:
        ws = await s.ws_connect(info["url"])
        await ws.send_json({"type": "auth", "token": "good"})
        await asyncio.wait_for(ws.receive_json(), timeout=3)
        await ws.send_json({"type": "start", "id": "r1", "params": {}})
        await asyncio.wait_for(ws.receive_json(), timeout=3)

    await asyncio.sleep(0.1)
    # The socket closed -> the owned process must be terminated.
    assert all(p.terminated for p in info["created_ptys"])
    assert info["tws"].session_count == 0


@pytest.mark.asyncio
async def test_exited_event_on_pty_eof(term_ws_url):
    info = term_ws_url

    async with aiohttp.ClientSession() as s:
        async with s.ws_connect(info["url"]) as ws:
            await ws.send_json({"type": "auth", "token": "good"})
            await asyncio.wait_for(ws.receive_json(), timeout=3)
            await ws.send_json({"type": "start", "id": "r1", "params": {}})
            started = await asyncio.wait_for(ws.receive_json(), timeout=3)
            process_id = started["processId"]
            pty = info["created_ptys"][-1]
            pty.exit_code = 0

            await pty._emit(b"")  # EOF

            msg = await asyncio.wait_for(ws.receive_json(), timeout=3)
            assert msg["type"] == "exited"
            assert msg["processId"] == process_id
            assert msg["exitCode"] == 0


@pytest.mark.asyncio
async def test_ping_pong(term_ws_url):
    info = term_ws_url

    async with aiohttp.ClientSession() as s:
        async with s.ws_connect(info["url"]) as ws:
            await ws.send_json({"type": "auth", "token": "good"})
            await asyncio.wait_for(ws.receive_json(), timeout=3)
            await ws.send_json({"type": "ping"})
            msg = await asyncio.wait_for(ws.receive_json(), timeout=3)
            assert msg["type"] == "pong"


@pytest.mark.asyncio
async def test_cross_site_origin_rejected(term_ws_url):
    info = term_ws_url
    info["server_mock"].auth.is_cross_site_browser = MagicMock(return_value=True)

    async with aiohttp.ClientSession() as s:
        with pytest.raises(aiohttp.WSServerHandshakeError) as excinfo:
            await s.ws_connect(info["url"], headers={"Origin": "https://evil.example.com"})
        assert excinfo.value.status == 403


@pytest.mark.asyncio
async def test_unauthenticated_socket_closed_after_timeout(term_ws_url, monkeypatch):
    from codex_pro.gateway import ws_common

    monkeypatch.setattr(ws_common, "WEB_AUTH_TIMEOUT_SECONDS", 0.2)

    async with aiohttp.ClientSession() as s:
        async with s.ws_connect(term_ws_url["url"]) as ws:
            msg = await asyncio.wait_for(ws.receive(), timeout=3)
            assert msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED)


@pytest.mark.asyncio
async def test_disabled_terminal_returns_403(term_ws_url, monkeypatch):
    info = term_ws_url
    info["tws"]._config.enabled = False

    async with aiohttp.ClientSession() as s:
        with pytest.raises(aiohttp.WSServerHandshakeError) as excinfo:
            await s.ws_connect(info["url"])
        assert excinfo.value.status == 403
