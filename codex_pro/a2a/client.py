"""A2A client — discover and delegate to remote agents."""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlparse

import aiohttp

from codex_pro.a2a.models import AgentCard, A2ATask, A2AMessage
from codex_pro.security.net_guard import (
    ALLOWED_SCHEMES,
    RESOLVE_FAILED_PREFIX,
    GuardedFetchError,
    PinnedResolver,
    resolve_and_validate,
)

_MAX_RESPONSE_BYTES = 2 * 1024 * 1024


class A2AClientError(RuntimeError):
    """The remote A2A peer returned an invalid or unsuccessful response."""


class A2AClient:
    def __init__(self, timeout: float = 60, max_response_bytes: int = _MAX_RESPONSE_BYTES):
        self._timeout = timeout
        self._max_response_bytes = max_response_bytes

    async def discover(self, base_url: str, *, allow_private: bool = False) -> AgentCard:
        url = f"{base_url.rstrip('/')}/.well-known/agent.json"
        data = await self._request_json(url, allow_private=allow_private)
        return AgentCard(
            name=data.get("name", ""),
            description=data.get("description", ""),
            url=base_url,
            version=data.get("version", ""),
            capabilities=[],
        )

    async def send_task(
        self,
        base_url: str,
        message: str,
        task_id: str = "",
        *,
        allow_private: bool = False,
    ) -> A2ATask:
        url = f"{base_url.rstrip('/')}/a2a"
        payload = {
            "jsonrpc": "2.0",
            "id": "1",
            "method": "tasks/send",
            "params": {
                "id": task_id,
                "message": A2AMessage.text("user", message).to_dict(),
            },
        }
        data = await self._request_json(url, payload=payload, allow_private=allow_private)
        return A2ATask.from_dict(data.get("result", {}))

    async def get_task(
        self, base_url: str, task_id: str, *, allow_private: bool = False
    ) -> A2ATask:
        url = f"{base_url.rstrip('/')}/a2a"
        payload = {
            "jsonrpc": "2.0", "id": "1",
            "method": "tasks/get",
            "params": {"id": task_id},
        }
        data = await self._request_json(url, payload=payload, allow_private=allow_private)
        return A2ATask.from_dict(data.get("result", {}))

    async def cancel_task(
        self, base_url: str, task_id: str, *, allow_private: bool = False
    ) -> A2ATask:
        url = f"{base_url.rstrip('/')}/a2a"
        payload = {
            "jsonrpc": "2.0", "id": "1",
            "method": "tasks/cancel",
            "params": {"id": task_id},
        }
        data = await self._request_json(url, payload=payload, allow_private=allow_private)
        return A2ATask.from_dict(data.get("result", {}))

    async def _request_json(
        self,
        url: str,
        *,
        payload: dict[str, Any] | None = None,
        allow_private: bool = False,
    ) -> dict[str, Any]:
        """Send one pinned HTTP request; redirects and oversized bodies are rejected."""
        parsed = urlparse(url)
        if (
            parsed.scheme not in ALLOWED_SCHEMES
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
        ):
            raise GuardedFetchError("Blocked: invalid A2A endpoint URL")
        try:
            parsed.port
        except ValueError as exc:
            raise GuardedFetchError("Blocked: invalid A2A endpoint port") from exc

        addresses, error = await resolve_and_validate(url, allow_private=allow_private)
        if error:
            raise GuardedFetchError(
                error,
                blocked_by_policy=not error.startswith(RESOLVE_FAILED_PREFIX),
            )

        host = parsed.hostname
        connector = aiohttp.TCPConnector(
            resolver=PinnedResolver({host: addresses}),
            use_dns_cache=False,
        )
        timeout = aiohttp.ClientTimeout(total=self._timeout)
        method = "POST" if payload is not None else "GET"
        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            async with session.request(
                method,
                url,
                json=payload,
                headers={"Accept": "application/json"},
                allow_redirects=False,
            ) as response:
                if 300 <= response.status < 400:
                    raise GuardedFetchError(
                        f"Blocked: A2A peer redirect rejected (HTTP {response.status})"
                    )

                content_length = response.headers.get("Content-Length")
                if content_length:
                    try:
                        if int(content_length) > self._max_response_bytes:
                            raise GuardedFetchError(
                                "Blocked: A2A response exceeds the configured size limit"
                            )
                    except ValueError:
                        pass

                body = bytearray()
                async for chunk in response.content.iter_chunked(64 * 1024):
                    body.extend(chunk)
                    if len(body) > self._max_response_bytes:
                        raise GuardedFetchError(
                            "Blocked: A2A response exceeds the configured size limit"
                        )

                if response.status >= 400:
                    raise A2AClientError(f"A2A peer returned HTTP {response.status}")
                try:
                    data = json.loads(body)
                except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                    raise A2AClientError("A2A peer returned invalid JSON") from exc
                if not isinstance(data, dict):
                    raise A2AClientError("A2A peer returned a non-object JSON response")
                if "error" in data:
                    raise A2AClientError(f"A2A peer returned a JSON-RPC error: {data['error']}")
                return data
