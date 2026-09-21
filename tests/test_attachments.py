"""Attachment upload endpoint and the attachment store.

The upload handler is exercised with the same fake multipart reader pattern
used by test_gateway_api_modules.py (a channel-level handler test), so we can
drive ``request.multipart()`` directly without a live HTTP server.
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiohttp import web

from codex_pro.gateway.api.attachments import AttachmentsAPI, AttachmentStore
from codex_pro.bus.events import ContentType


class _Request:
    """Minimal aiohttp.Request stand-in exposing multipart()."""

    def __init__(self, *, multipart=None):
        self._multipart = multipart
        self.headers = {}

    async def multipart(self):
        return self._multipart


class _Part:
    """A fake multipart body part exposing read_chunk() and headers."""

    def __init__(self, *, name, filename, chunks, content_type="application/octet-stream"):
        self.name = name
        self.filename = filename
        self._chunks = list(chunks) + [b""]  # trailing empty signals EOF
        self.headers = {"Content-Type": content_type}

    async def read_chunk(self, size=8192):
        return self._chunks.pop(0) if self._chunks else b""

    async def release(self):
        self._chunks.clear()


class _MultipartReader:
    """A fake multipart reader yielding parts via next()."""

    def __init__(self, parts):
        self._parts = list(parts) + [None]  # trailing None signals end

    async def next(self):
        return self._parts.pop(0) if self._parts else None


def _payload(response: web.Response) -> dict:
    return json.loads(response.body.decode())


def _make_server(tmp_path: Path, *, max_file_mb: int = 25) -> MagicMock:
    server = MagicMock()
    server._require_api_token = MagicMock(return_value=None)
    server._workspace = tmp_path
    config = MagicMock()
    config.media_max_file_mb = max_file_mb
    server._config = config
    # A MagicMock would otherwise return a mock for ``_attachment_store``; pin a
    # real store so the handler operates on actual filesystem paths.
    server._attachment_store = AttachmentStore(
        tmp_path / "data" / "attachments",
        max_file_bytes=max_file_mb * 1024 * 1024,
    )
    return server


def _make_api(server):
    return AttachmentsAPI(server)


@pytest.mark.asyncio
async def test_upload_stores_file_and_returns_metadata(tmp_path):
    server = _make_server(tmp_path)
    api = _make_api(server)
    reader = _MultipartReader(
        [_Part(name="file", filename="note.txt", chunks=[b"hello ", b"world"], content_type="text/plain")]
    )
    resp = await api.upload(_Request(multipart=reader))
    assert resp.status == 201, resp.body.decode()
    data = _payload(resp)
    assert data["name"] == "note.txt"
    assert data["mime_type"] == "text/plain"
    assert data["size"] == len(b"hello world")
    assert data["attachment_id"]
    saved = Path(data["url"])
    assert saved.is_file()
    assert saved.read_bytes() == b"hello world"
    # Stored under an id-derived name, not the client filename.
    assert "note.txt" not in data["url"]


@pytest.mark.asyncio
async def test_upload_rejects_oversized_file(tmp_path):
    server = _make_server(tmp_path, max_file_mb=25)
    api = _make_api(server)
    big = b"x" * (26 * 1024 * 1024)
    reader = _MultipartReader(
        [_Part(name="file", filename="big.bin", chunks=[big[: 24 * 1024 * 1024], big[24 * 1024 * 1024:]])]
    )
    resp = await api.upload(_Request(multipart=reader))
    assert resp.status == 413
    # Nothing partial left behind in the store.
    store_dir = tmp_path / "data" / "attachments"
    leftovers = [p for p in store_dir.rglob("*") if p.is_file()]
    assert leftovers == []


@pytest.mark.asyncio
async def test_upload_requires_multipart(tmp_path):
    server = _make_server(tmp_path)
    api = _make_api(server)
    resp = await api.upload(_Request(multipart=None))
    assert resp.status == 400


@pytest.mark.asyncio
async def test_upload_requires_file_part(tmp_path):
    server = _make_server(tmp_path)
    api = _make_api(server)
    reader = _MultipartReader(
        [_Part(name="other", filename="z.txt", chunks=[b"z"])]
    )
    resp = await api.upload(_Request(multipart=reader))
    assert resp.status == 400


@pytest.mark.asyncio
async def test_upload_rejects_empty_file(tmp_path):
    server = _make_server(tmp_path)
    api = _make_api(server)
    reader = _MultipartReader([_Part(name="file", filename="empty.txt", chunks=[])])
    resp = await api.upload(_Request(multipart=reader))
    assert resp.status == 400


@pytest.mark.asyncio
async def test_upload_requires_token(tmp_path):
    server = _make_server(tmp_path)
    rejection = web.json_response({"error": "unauthorized"}, status=401)
    server._require_api_token = MagicMock(return_value=rejection)
    api = _make_api(server)
    reader = _MultipartReader([_Part(name="file", filename="a.txt", chunks=[b"a"])])
    resp = await api.upload(_Request(multipart=reader))
    assert resp.status == 401


def test_store_get_path_resolves_and_persists(tmp_path):
    store = AttachmentStore(tmp_path / "attachments")
    staging = tmp_path / "stage.txt"
    staging.write_text("data", encoding="utf-8")
    record = store.store(filename="a b.txt", mime_type="text/plain", size=4, source=staging)
    # A fresh store over the same dir proves the index persists.
    store2 = AttachmentStore(tmp_path / "attachments")
    assert store2.get_path(record["attachment_id"]) == Path(record["url"])
    assert store2.get(record["attachment_id"])["name"] == "a b.txt"
    assert Path(record["url"]).read_text(encoding="utf-8") == "data"


def test_store_unknown_id_returns_none(tmp_path):
    store = AttachmentStore(tmp_path / "attachments")
    assert store.get_path("nope") is None
    assert store.get("nope") is None


# ── /message attachment resolution ────────────────────────────────────────


class _JsonRequest:
    def __init__(self, body: dict):
        self._body = body
        self.headers = {}
        self.query = {}

    async def json(self) -> dict:
        return self._body


def _make_gateway(tmp_path: Path):
    from codex_pro.gateway.server import GatewayServer
    from codex_pro.config.schema import GatewayConfig, GatewayAuthConfig, GatewaySessionPolicyConfig
    from codex_pro.bus.queue import MessageBus
    from codex_pro.gateway.api.attachments import AttachmentStore

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
    session_manager.get = AsyncMock(return_value=MagicMock(status="active"))
    session_manager.get_or_create = AsyncMock(return_value=MagicMock(status="active"))
    agent_loop = MagicMock()

    gw = GatewayServer(
        config=config,
        bus=bus,
        channel_manager=channel_manager,
        session_manager=session_manager,
        workspace=tmp_path,
        agent_loop=agent_loop,
    )
    # Pin a real store so attachment ids resolve to real files on disk.
    gw._attachment_store = AttachmentStore(tmp_path / "data" / "attachments")
    return gw, bus


@pytest.mark.asyncio
async def test_message_resolves_uploaded_attachment_to_file_block(tmp_path):
    gw, bus = _make_gateway(tmp_path)
    bus.publish_inbound = AsyncMock(return_value=True)
    staging = tmp_path / "stage.txt"
    staging.write_text("hello", encoding="utf-8")
    record = gw._attachment_store.store(
        filename="note.txt",
        mime_type="text/plain",
        size=5,
        source=staging,
    )

    resp = await gw._handle_message(_JsonRequest({
        "platform": "api",
        "user_id": "user-1",
        "chat_id": "chat-1",
        "text": "please read this",
        "attachments": [{"attachment_id": record["attachment_id"]}],
    }))

    assert resp.status == 200, resp.text
    event = bus.publish_inbound.await_args.args[0]
    block = event.content[1]
    assert block.type == ContentType.FILE
    assert block.url == record["url"]
    assert block.mime_type == "text/plain"
    assert block.metadata.get("name") == "note.txt"


@pytest.mark.asyncio
async def test_message_rejects_unknown_attachment(tmp_path):
    gw, _ = _make_gateway(tmp_path)
    resp = await gw._handle_message(_JsonRequest({
        "platform": "api",
        "user_id": "user-1",
        "chat_id": "chat-1",
        "text": "hi",
        "attachments": [{"attachment_id": "ghost"}],
    }))
    assert resp.status == 400
    assert "unknown attachment" in _payload(resp).get("error", "")


@pytest.mark.asyncio
async def test_message_requires_attachment_id(tmp_path):
    gw, _ = _make_gateway(tmp_path)
    resp = await gw._handle_message(_JsonRequest({
        "platform": "api",
        "user_id": "user-1",
        "chat_id": "chat-1",
        "text": "hi",
        "attachments": [{"not_id": "x"}],
    }))
    assert resp.status == 400


@pytest.mark.asyncio
async def test_message_attachments_must_be_list(tmp_path):
    gw, _ = _make_gateway(tmp_path)
    resp = await gw._handle_message(_JsonRequest({
        "platform": "api",
        "user_id": "user-1",
        "chat_id": "chat-1",
        "text": "hi",
        "attachments": {"attachment_id": "x"},
    }))
    assert resp.status == 400
