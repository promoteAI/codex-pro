"""A2AClient contract and outbound-network guard tests."""

from __future__ import annotations

import socket
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aiohttp import web

from codex_pro.a2a.client import A2AClient
from codex_pro.a2a.models import AgentCard, A2ATask, TaskState
from codex_pro.security.net_guard import GuardedFetchError, resolve_and_validate


class _Body:
    def __init__(self, chunks: list[bytes]):
        self._chunks = chunks

    async def iter_chunked(self, _size: int):
        for chunk in self._chunks:
            yield chunk


class _Response:
    def __init__(self, *, status: int = 200, chunks: list[bytes] | None = None):
        self.status = status
        self.headers: dict[str, str] = {}
        self.content = _Body(chunks or [b"{}"])

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False


class _Session:
    def __init__(self, response: _Response):
        self.response = response
        self.request = MagicMock(return_value=response)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False


def _guarded_session(response: _Response):
    session = _Session(response)
    connector = object()
    return session, connector


class TestA2AClientMethods:
    @pytest.mark.asyncio
    async def test_discover_parses_card(self):
        client = A2AClient()
        client._request_json = AsyncMock(return_value={
            "name": "RemoteAgent",
            "description": "does things",
            "version": "1.2.3",
        })
        card = await client.discover("https://agent.example.com/")
        assert isinstance(card, AgentCard)
        assert card.name == "RemoteAgent"
        assert card.version == "1.2.3"
        assert card.url == "https://agent.example.com/"
        client._request_json.assert_awaited_once_with(
            "https://agent.example.com/.well-known/agent.json", allow_private=False
        )

    @pytest.mark.asyncio
    async def test_discover_passes_explicit_private_opt_in(self):
        client = A2AClient()
        client._request_json = AsyncMock(return_value={})
        await client.discover("http://localhost:9000", allow_private=True)
        client._request_json.assert_awaited_once_with(
            "http://localhost:9000/.well-known/agent.json", allow_private=True
        )

    @pytest.mark.asyncio
    async def test_send_task_builds_jsonrpc_payload(self):
        client = A2AClient()
        client._request_json = AsyncMock(return_value={
            "result": {"id": "task-1", "state": "completed", "messages": []},
        })
        task = await client.send_task("https://x/", "hello", task_id="t-1")
        assert isinstance(task, A2ATask)
        assert task.id == "task-1"
        assert task.state == TaskState.COMPLETED
        url, kwargs = client._request_json.await_args.args[0], client._request_json.await_args.kwargs
        assert url == "https://x/a2a"
        payload = kwargs["payload"]
        assert payload["method"] == "tasks/send"
        assert payload["params"]["id"] == "t-1"
        assert payload["params"]["message"]["role"] == "user"
        assert payload["params"]["message"]["parts"][0]["text"] == "hello"

    @pytest.mark.asyncio
    async def test_send_task_preserves_empty_result_compatibility(self):
        client = A2AClient()
        client._request_json = AsyncMock(return_value={})
        task = await client.send_task("https://x", "hi")
        assert task.state == TaskState.SUBMITTED

    @pytest.mark.asyncio
    async def test_get_task(self):
        client = A2AClient()
        client._request_json = AsyncMock(return_value={
            "result": {"id": "g1", "state": "working", "messages": []},
        })
        task = await client.get_task("https://x", "g1")
        assert task.id == "g1"
        assert task.state == TaskState.WORKING
        payload = client._request_json.await_args.kwargs["payload"]
        assert payload["method"] == "tasks/get"
        assert payload["params"]["id"] == "g1"

    @pytest.mark.asyncio
    async def test_cancel_task(self):
        client = A2AClient()
        client._request_json = AsyncMock(return_value={
            "result": {"id": "c1", "state": "canceled", "messages": []},
        })
        task = await client.cancel_task("https://x", "c1")
        assert task.state == TaskState.CANCELED
        payload = client._request_json.await_args.kwargs["payload"]
        assert payload["method"] == "tasks/cancel"
        assert payload["params"]["id"] == "c1"


class TestGuardedRequest:
    @pytest.mark.asyncio
    async def test_real_loopback_peer_requires_opt_in_and_uses_pinned_request(self):
        async def agent_card(_request):
            return web.json_response({"name": "LocalPeer", "version": "1"})

        app = web.Application()
        app.router.add_get("/.well-known/agent.json", agent_card)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", 0)
        await site.start()
        assert site._server is not None
        port = site._server.sockets[0].getsockname()[1]
        base_url = f"http://127.0.0.1:{port}"
        try:
            client = A2AClient()
            with pytest.raises(GuardedFetchError, match="non-public address"):
                await client.discover(base_url)
            card = await client.discover(base_url, allow_private=True)
            assert card.name == "LocalPeer"
        finally:
            await runner.cleanup()

    @pytest.mark.asyncio
    async def test_private_dns_result_requires_explicit_opt_in(self):
        infos = [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("127.0.0.1", 9000))]
        with patch("codex_pro.security.net_guard.socket.getaddrinfo", return_value=infos):
            addresses, error = await resolve_and_validate("http://peer.example")
            assert addresses == []
            assert error and "127.0.0.1" in error

            addresses, error = await resolve_and_validate(
                "http://peer.example", allow_private=True
            )
        assert error is None
        assert addresses == ["127.0.0.1"]

    @pytest.mark.asyncio
    @pytest.mark.parametrize("address", ["169.254.169.254", "224.0.0.1", "0.0.0.0"])
    async def test_private_opt_in_never_allows_link_local_or_special_addresses(self, address: str):
        infos = [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, 0))]
        with patch("codex_pro.security.net_guard.socket.getaddrinfo", return_value=infos):
            addresses, error = await resolve_and_validate(
                "http://peer.example", allow_private=True
            )
        assert addresses == []
        assert error is not None

    @pytest.mark.asyncio
    async def test_request_pins_resolved_address_and_disables_redirects(self):
        client = A2AClient()
        response = _Response(chunks=[b'{"name":"peer"}'])
        session, connector = _guarded_session(response)
        with (
            patch("codex_pro.a2a.client.resolve_and_validate", new=AsyncMock(return_value=(["203.0.113.8"], None))) as resolve,
            patch("codex_pro.a2a.client.aiohttp.TCPConnector", return_value=connector) as connector_factory,
            patch("codex_pro.a2a.client.aiohttp.ClientSession", return_value=session),
        ):
            data = await client._request_json("https://peer.example/.well-known/agent.json")

        assert data == {"name": "peer"}
        resolve.assert_awaited_once_with("https://peer.example/.well-known/agent.json", allow_private=False)
        resolver = connector_factory.call_args.kwargs["resolver"]
        assert resolver._map == {"peer.example": ["203.0.113.8"]}
        assert session.request.call_args.args == ("GET", "https://peer.example/.well-known/agent.json")
        assert session.request.call_args.kwargs["allow_redirects"] is False
        assert session.request.call_args.kwargs["json"] is None

    @pytest.mark.asyncio
    async def test_private_target_is_rejected_before_opening_a_session(self):
        client = A2AClient()
        with (
            patch(
                "codex_pro.a2a.client.resolve_and_validate",
                new=AsyncMock(return_value=([], "Blocked: target resolves to private address")),
            ),
            patch("codex_pro.a2a.client.aiohttp.ClientSession") as session_factory,
        ):
            with pytest.raises(GuardedFetchError, match="private address"):
                await client._request_json("http://127.0.0.1/a2a")
        session_factory.assert_not_called()

    @pytest.mark.asyncio
    async def test_private_target_opt_in_is_forwarded_to_resolver(self):
        client = A2AClient()
        response = _Response(chunks=[b"{}"])
        session, connector = _guarded_session(response)
        with (
            patch("codex_pro.a2a.client.resolve_and_validate", new=AsyncMock(return_value=(["127.0.0.1"], None))) as resolve,
            patch("codex_pro.a2a.client.aiohttp.TCPConnector", return_value=connector),
            patch("codex_pro.a2a.client.aiohttp.ClientSession", return_value=session),
        ):
            await client._request_json("http://localhost:9000/a2a", allow_private=True)
        resolve.assert_awaited_once_with("http://localhost:9000/a2a", allow_private=True)

    @pytest.mark.asyncio
    async def test_redirect_is_rejected_without_following_location(self):
        client = A2AClient()
        response = _Response(status=302)
        session, connector = _guarded_session(response)
        with (
            patch("codex_pro.a2a.client.resolve_and_validate", new=AsyncMock(return_value=(["203.0.113.8"], None))),
            patch("codex_pro.a2a.client.aiohttp.TCPConnector", return_value=connector),
            patch("codex_pro.a2a.client.aiohttp.ClientSession", return_value=session),
        ):
            with pytest.raises(GuardedFetchError, match="redirect rejected"):
                await client._request_json("https://peer.example/a2a")
        session.request.assert_called_once()
        assert session.request.call_args.kwargs["allow_redirects"] is False

    @pytest.mark.asyncio
    async def test_chunked_response_size_is_bounded(self):
        client = A2AClient(max_response_bytes=3)
        response = _Response(chunks=[b"1234"])
        session, connector = _guarded_session(response)
        with (
            patch("codex_pro.a2a.client.resolve_and_validate", new=AsyncMock(return_value=(["203.0.113.8"], None))),
            patch("codex_pro.a2a.client.aiohttp.TCPConnector", return_value=connector),
            patch("codex_pro.a2a.client.aiohttp.ClientSession", return_value=session),
        ):
            with pytest.raises(GuardedFetchError, match="size limit"):
                await client._request_json("https://peer.example/a2a")

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "url",
        ["file:///etc/passwd", "https://user:pass@peer.example/a2a", "https://peer.example/a2a?x=1"],
    )
    async def test_invalid_endpoint_url_rejected_before_dns(self, url: str):
        client = A2AClient()
        with patch("codex_pro.a2a.client.resolve_and_validate", new=AsyncMock()) as resolve:
            with pytest.raises(GuardedFetchError, match="invalid A2A endpoint URL"):
                await client._request_json(url)
        resolve.assert_not_awaited()
