"""WebSocket handler — auth handshake + message loop.

Extracted from gateway/server.py to improve modularity and testability.
"""
from __future__ import annotations

import asyncio
import json
from typing import TYPE_CHECKING, Any

import aiohttp
from aiohttp import web
from loguru import logger

from codex_pro.bus.events import InboundEvent
from codex_pro.bus.idempotency import (
    IDEMPOTENCY_FINGERPRINT_METADATA,
    IDEMPOTENCY_NAMESPACE_METADATA,
    durable_fingerprint_conflicts,
)

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer


class WebSocketHandler:
    """Stateful WebSocket handler — handshake, message loop, outbound delivery."""

    def __init__(self, server: "GatewayServer"):
        self._server = server

    async def handle_websocket(self, request: web.Request) -> web.StreamResponse:
        """Handle WebSocket connection: Origin gate → auth handshake → message loop."""
        from codex_pro.gateway import ws_common
        from codex_pro.gateway.ws_session import resolve_client_session_key
        from codex_pro.gateway.http_handlers.base import (
            idempotency_fingerprint,
            idempotency_key as _idempotency_key_fn,
            is_loopback_peer,
            request_token,
        )
        from codex_pro.bus.idempotency import deterministic_event_id
        from codex_pro.gateway.session_context import set_session_vars, clear_session_vars

        # Gate A: reject cross-site browser upgrades BEFORE prepare()
        rejected = ws_common.reject_cross_site(request, self._server.auth, action="ws_auth")
        if rejected is not None:
            return rejected

        # Server-driven heartbeat
        hb = self._server._config.ws_heartbeat_seconds
        websocket = web.WebSocketResponse(heartbeat=hb if hb and hb > 0 else None)
        await websocket.prepare(request)

        delivery_key = None
        platform = "ws"
        user_id = ""
        chat_id = ""
        session_key = ""
        principal = "anonymous"
        auth_deadline = ws_common.AuthDeadline()

        try:
            while True:
                try:
                    raw_msg = await asyncio.wait_for(
                        websocket.receive(),
                        timeout=auth_deadline.remaining(),
                    )
                except asyncio.TimeoutError:
                    self._server.auth.audit("ws_auth", ok=False, reason="authentication timeout")
                    await websocket.close()
                    break

                if raw_msg.type == aiohttp.WSMsgType.TEXT:
                    try:
                        data = json.loads(raw_msg.data)
                    except json.JSONDecodeError:
                        await websocket.send_json({"error": "invalid JSON"})
                        continue

                    try:
                        msg_type = data.get("type", "message")

                        if msg_type == "auth":
                            platform = self._server._normalize_platform(data.get("platform"))
                            user_id = data.get("user_id", "")
                            chat_id = data.get("chat_id", user_id)
                            frame_token = str(data.get("token") or "")
                            token = str(frame_token or request_token(request))

                            if self._server._tokens_configured() and not self._server.auth.authenticate_token(token):
                                self._server.auth.audit(
                                    "ws_auth", platform=platform, user_id=user_id,
                                    ok=False, reason="invalid api token",
                                )
                                await websocket.send_json({"type": "error", "error": "unauthorized"})
                                await websocket.close()
                                return websocket
                            if self._server._tokens_configured():
                                principal = self._server.auth.principal_for_token(token) or "invalid"

                            trusted = is_loopback_peer(request)
                            normally_ok = self._server.auth.is_authorized(platform, user_id)
                            if not (normally_ok or trusted):
                                self._server.auth.audit(
                                    "ws_auth", platform=platform, user_id=user_id,
                                    ok=False, reason="user unauthorized",
                                )
                                await websocket.send_json({"type": "error", "error": "unauthorized"})
                                await websocket.close()
                                return websocket

                            session_key, sk_err = resolve_client_session_key(
                                data.get("session_key"),
                                platform=platform,
                                chat_id=chat_id,
                                allow_fallback=normally_ok,
                            )
                            if sk_err:
                                self._server.auth.audit(
                                    "ws_auth", platform=platform, user_id=user_id,
                                    ok=False, reason=sk_err,
                                )
                                await websocket.send_json({"type": "error", "error": "forbidden session_key"})
                                await websocket.close()
                                return websocket

                            delivery_key = f"gateway:{platform}:{chat_id}"
                            self._server._ws_clients[delivery_key] = websocket
                            auth_deadline.mark_authenticated()

                            session, _ = await self._server._reset_session_if_needed(session_key)

                            await websocket.send_json({"type": "auth_ok", "session_key": session_key})
                            self._server.auth.audit("ws_auth", platform=platform, user_id=user_id, ok=True)
                            await self._server.hooks.emit("auth_success", platform=platform, user_id=user_id)
                            continue

                        if msg_type == "message":
                            if not session_key:
                                await websocket.send_json({"type": "error", "error": "authenticate first"})
                                continue

                            text = data.get("text", "")
                            is_group = bool(data.get("is_group", False))
                            if not text:
                                continue

                            try:
                                idempotency_key_val = _idempotency_key_fn.__wrapped__(data.get("idempotency_key")) if hasattr(_idempotency_key_fn, '__wrapped__') else ""
                            except Exception:
                                idempotency_key_val = ""
                            from codex_pro.bus.idempotency import normalize_idempotency_key
                            try:
                                idempotency_key_val = normalize_idempotency_key(data.get("idempotency_key"))
                            except ValueError as e:
                                await websocket.send_json({"type": "error", "error": str(e)})
                                continue

                            claim = None
                            event_id = ""
                            operation_fingerprint = ""
                            durable_claimed = False
                            if idempotency_key_val:
                                scope = f"ws\0{principal}\0{session_key}"
                                event_id = deterministic_event_id("gateway-message", scope, idempotency_key_val)
                                operation_fingerprint = idempotency_fingerprint({
                                    "text": text,
                                    "is_group": is_group,
                                    "platform": platform,
                                    "user_id": user_id,
                                    "chat_id": chat_id,
                                })
                                claim = await self._server._message_idempotency.claim(
                                    namespace="gateway-message",
                                    scope=scope,
                                    key=idempotency_key_val,
                                    fingerprint=operation_fingerprint,
                                    event_id=event_id,
                                    context={"session_key": session_key, "wait": False, "transport": "ws"},
                                )
                                if claim.outcome == "conflict":
                                    await websocket.send_json({"type": "error", "error": "idempotency key was already used for a different request"})
                                    continue
                                if claim.outcome == "full":
                                    await websocket.send_json({"type": "error", "error": "idempotency store is full"})
                                    continue
                                if claim.outcome == "duplicate" and claim.entry is not None:
                                    cached = claim.entry.admission
                                    if cached is None:
                                        try:
                                            cached = await self._server._message_idempotency.wait_admitted(
                                                claim.entry, timeout=30,
                                            )
                                        except asyncio.TimeoutError:
                                            await websocket.send_json({
                                                "type": "error", "error": "idempotency outcome pending",
                                                "event_id": event_id,
                                            })
                                            continue
                                    await websocket.send_json(cached.payload)
                                    continue

                                try:
                                    durable_claim = await self._server._bus.claim_durable_idempotency(
                                        event_id,
                                        namespace="gateway-message",
                                        fingerprint=operation_fingerprint,
                                        session_key=session_key,
                                    )
                                except Exception as e:
                                    logger.error("Durable WS idempotency claim failed: {}", e)
                                    await self._server._message_idempotency.abort(claim.entry)
                                    await websocket.send_json({"type": "error", "error": "durable idempotency storage unavailable"})
                                    continue
                                durable_outcome = durable_claim.get("outcome")
                                durable_record = durable_claim.get("row")
                                if durable_outcome == "full":
                                    await self._server._message_idempotency.abort(claim.entry)
                                    await websocket.send_json({"type": "error", "error": "durable idempotency store is full"})
                                    continue
                                if durable_outcome == "conflict":
                                    await self._server._message_idempotency.abort(claim.entry)
                                    await websocket.send_json({"type": "error", "error": "idempotency key was already used for a different request"})
                                    continue
                                if durable_outcome == "duplicate" and isinstance(durable_record, dict):
                                    payload, terminal = self._server._ws_turn_run_payload(durable_record, event_id)
                                    if terminal:
                                        await self._server._message_idempotency.complete(claim.entry, status=200, payload=payload)
                                    else:
                                        await self._server._message_idempotency.abort(claim.entry, status=200, payload=payload)
                                    await websocket.send_json(payload)
                                    continue
                                if durable_outcome != "new":
                                    await self._server._message_idempotency.abort(claim.entry)
                                    await websocket.send_json({"type": "error", "error": "durable idempotency storage unavailable"})
                                    continue
                                durable_claimed = True

                                try:
                                    durable_row = await self._server._bus.get_turn_run(event_id)
                                except Exception as e:
                                    logger.error("Durable WS turn lookup failed: {}", e)
                                    await self._server._release_durable_claim(event_id)
                                    durable_claimed = False
                                    await self._server._message_idempotency.abort(claim.entry)
                                    await websocket.send_json({"type": "error", "error": "durable idempotency storage unavailable"})
                                    continue
                                if durable_row is not None and claim.entry is not None:
                                    if durable_fingerprint_conflicts(
                                        durable_row, namespace="gateway-message", fingerprint=operation_fingerprint,
                                    ):
                                        await self._server._release_durable_claim(event_id)
                                        durable_claimed = False
                                        payload = {"type": "error", "error": "idempotency key was already used for a different request"}
                                        await self._server._message_idempotency.abort(claim.entry, status=409, payload=payload)
                                        await websocket.send_json(payload)
                                        continue
                                    try:
                                        await self._server._bus.sync_durable_idempotency(durable_row)
                                    except Exception as e:
                                        logger.error("Durable WS idempotency sync failed: {}", e)
                                        await self._server._release_durable_claim(event_id)
                                        durable_claimed = False
                                        await self._server._message_idempotency.abort(claim.entry)
                                        await websocket.send_json({"type": "error", "error": "durable idempotency storage unavailable"})
                                        continue
                                    payload, terminal = self._server._ws_turn_run_payload(durable_row, event_id)
                                    if terminal:
                                        await self._server._message_idempotency.complete(claim.entry, status=200, payload=payload)
                                    else:
                                        await self._server._message_idempotency.abort(claim.entry, status=200, payload=payload)
                                    await websocket.send_json(payload)
                                    continue

                            if not self._server.rate_limiter.acquire(platform, chat_id):
                                if durable_claimed:
                                    await self._server._release_durable_claim(event_id)
                                    durable_claimed = False
                                if claim is not None and claim.entry is not None:
                                    await self._server._message_idempotency.abort(
                                        claim.entry, status=429, payload={"type": "error", "error": "rate limited"},
                                    )
                                await websocket.send_json({"type": "error", "error": "rate limited"})
                                continue

                            published = False
                            publish_outcome_unknown = False
                            tokens = set_session_vars(
                                platform=platform, chat_id=chat_id,
                                user_id=user_id, session_key=session_key,
                            )
                            try:
                                event = InboundEvent.text_message(
                                    channel=f"gateway:{platform}",
                                    sender_id=user_id,
                                    chat_id=chat_id,
                                    text=text,
                                    session_key_override=session_key,
                                    is_group=is_group,
                                )
                                if event_id:
                                    event.event_id = event_id
                                event.metadata["gateway"] = True
                                event.metadata["platform"] = platform
                                if operation_fingerprint:
                                    event.metadata[IDEMPOTENCY_NAMESPACE_METADATA] = "gateway-message"
                                    event.metadata[IDEMPOTENCY_FINGERPRINT_METADATA] = operation_fingerprint
                                await self._server._accept_turn(event, session)
                                try:
                                    accepted = await self._server._publish_accepted_turn(event)
                                except BaseException:
                                    publish_outcome_unknown = True
                                    raise
                                if not accepted:
                                    self._server._discard_turn_interrupt_admission(event)
                                    await self._server._bus.release_turn_acceptance(event.event_id, event.session_key)
                                    if durable_claimed:
                                        await self._server._release_durable_claim(event.event_id)
                                        durable_claimed = False
                                    if claim is not None and claim.entry is not None:
                                        await self._server._message_idempotency.abort(
                                            claim.entry, payload={"type": "error", "error": "server overloaded"},
                                        )
                                    await websocket.send_json({"type": "error", "error": "server overloaded"})
                                    continue
                                published = True
                                if durable_claimed:
                                    await asyncio.shield(
                                        self._server._bus.mark_durable_idempotency_admitted(event.event_id)
                                    )
                                    durable_claimed = False
                                accepted_payload = {"type": "accepted", "event_id": event.event_id}
                                if claim is not None and claim.entry is not None:
                                    await asyncio.shield(
                                        self._server._message_idempotency.complete(
                                            claim.entry, status=200, payload=accepted_payload,
                                        )
                                    )
                                await websocket.send_json(accepted_payload)
                            finally:
                                if not published and not publish_outcome_unknown and claim is not None and claim.entry is not None:
                                    await asyncio.shield(self._server._message_idempotency.abort(claim.entry))
                                if not published and not publish_outcome_unknown and durable_claimed:
                                    await asyncio.shield(self._server._release_durable_claim(event_id))
                                clear_session_vars(tokens)

                        if msg_type == "interrupt":
                            if not session_key:
                                await websocket.send_json({"type": "error", "error": "authenticate first"})
                                continue
                            interrupt_event = InboundEvent.text_message(
                                channel=f"gateway:{platform}",
                                sender_id=user_id,
                                chat_id=chat_id,
                                text="/__interrupt__",
                                session_key_override=session_key,
                                is_control=True,
                            )
                            target_id = data.get("event_id")
                            if target_id:
                                interrupt_event.metadata["_interrupt_target_event_id"] = str(target_id)
                            if not await self._server._bus.publish_inbound(interrupt_event):
                                await websocket.send_json({"type": "error", "error": "server overloaded"})
                                continue
                            await websocket.send_json({"type": "accepted"})

                        if msg_type == "ping":
                            await websocket.send_json({"type": "pong"})

                    except Exception as e:
                        logger.warning("WebSocket message handling failed: {}", e)
                        try:
                            await websocket.send_json({"type": "error", "error": "internal error"})
                        except Exception:
                            pass
                        continue

                elif raw_msg.type in (
                    aiohttp.WSMsgType.ERROR,
                    aiohttp.WSMsgType.CLOSE,
                    aiohttp.WSMsgType.CLOSED,
                    aiohttp.WSMsgType.CLOSING,
                ):
                    break

        except Exception as e:
            logger.error("WebSocket error: {}", e)
        finally:
            if delivery_key and self._server._ws_clients.get(delivery_key) is websocket:
                del self._server._ws_clients[delivery_key]
            if session_key:
                try:
                    cancel_event = InboundEvent.text_message(
                        channel=f"gateway:{platform}",
                        sender_id=user_id,
                        chat_id=chat_id,
                        text="/__clarify_cancel__",
                        session_key_override=session_key,
                        is_control=True,
                    )
                    await self._server._bus.publish_inbound(cancel_event)
                except Exception as e:
                    logger.warning("Clarify cancel on ws disconnect failed: {}", e)

        return websocket

    async def handle_outbound(self, event: Any) -> Any:
        """Deliver a gateway-bound event to its live client.

        Extracted from GatewayServer._handle_outbound.
        """
        from codex_pro.channels.base import SendResult
        from codex_pro.bus.events import TERMINAL_TURN_OUTCOMES, FAULTED_TURN_OUTCOMES, final_frame_http_status

        if event.metadata.get("_drop"):
            return None
        if not event.channel.startswith("gateway:"):
            return None
        self._server._purge_http_tool_deliveries()

        _, platform = event.channel.split(":", 1)
        session_key = f"gateway:{platform}:{event.chat_id}"
        payload = self._server._build_outbound_payload(event)
        is_final = event.is_final or event.message_kind == "final"
        is_tool_delivery = bool(event.metadata.get("_tool_delivery"))
        is_turn_terminal = is_final and not is_tool_delivery

        answered_http_waiter = False
        buffered_http_tool_delivery = False
        buffer_error: str | None = None
        correlation_id = str(event.metadata.get("_inbound_event_id") or event.reply_to_id or "")
        if correlation_id:
            future = self._server._pending_http.get(correlation_id)
            if is_tool_delivery and future is not None and not future.done():
                buffer_error = self._buffer_http_tool_delivery(correlation_id, payload)
                buffered_http_tool_delivery = buffer_error is None
            elif is_turn_terminal:
                tool_deliveries = self._take_http_tool_deliveries(correlation_id)
                if tool_deliveries:
                    payload = {**payload, "tool_deliveries": tool_deliveries}
                if future is not None and not future.done():
                    try:
                        future.set_result(payload)
                        answered_http_waiter = True
                    except asyncio.InvalidStateError:
                        pass
                    self._server._pending_http.pop(correlation_id, None)
            if is_turn_terminal:
                idempotency_context = await self._server._message_idempotency.context_for_event(correlation_id)
                if idempotency_context.get("transport") == "ws":
                    await self._server._message_idempotency.complete_event(
                        correlation_id, status=200, payload=payload,
                    )
                elif idempotency_context.get("transport") == "http":
                    response_status, response_payload = self._server._http_final_response(
                        correlation_id,
                        idempotency_context.get("session_key", session_key),
                        payload,
                    )
                    await self._server._message_idempotency.complete_event(
                        correlation_id, status=response_status, payload=response_payload,
                    )

        delivered = await self.broadcast_to_ws(session_key, payload)
        if buffer_error is not None:
            logger.warning(buffer_error)
            return SendResult(success=False, error=buffer_error)
        if delivered or answered_http_waiter:
            return SendResult(success=True)
        if buffered_http_tool_delivery:
            return SendResult(success=True, deferred=True)

        if not is_final and not is_tool_delivery:
            return None

        logger.warning(
            "Outbound FINAL reply not delivered to live client "
            "(session_key={}, event_id={}): socket missing or closed. "
            "Reply is persisted to history but the attached client missed it.",
            session_key, event.event_id,
        )
        return SendResult(
            success=False,
            error="no live gateway client for this session (reply persisted to history only)",
        )

    # ── Tool delivery forwarding ────────────────────────────────────────────

    def _buffer_http_tool_delivery(self, correlation_id: str, payload: dict[str, Any]) -> str | None:
        return self._server._buffer_http_tool_delivery(correlation_id, payload)

    def _pop_http_tool_deliveries(self, correlation_id: str) -> tuple[list[dict[str, Any]], int, float] | None:
        return self._server._pop_http_tool_deliveries(correlation_id)

    def _take_http_tool_deliveries(self, correlation_id: str) -> list[dict[str, Any]]:
        return self._server._take_http_tool_deliveries(correlation_id)

    def _clear_http_tool_deliveries(self, correlation_id: str) -> None:
        self._server._clear_http_tool_deliveries(correlation_id)

    def _purge_http_tool_deliveries(self, now: float | None = None) -> None:
        self._server._purge_http_tool_deliveries(now)

    def _make_http_tool_delivery_room(self, frame_chars: int, *, preserve: str) -> bool:
        return self._server._make_http_tool_delivery_room(frame_chars, preserve=preserve)

    def _clear_all_http_tool_deliveries(self) -> None:
        self._server._clear_all_http_tool_deliveries()

    async def _release_durable_claim(self, event_id: str) -> None:
        await self._server._release_durable_claim(event_id)

    async def broadcast_to_ws(self, session_key: str, data: dict[str, Any]) -> bool:
        ws = self._server._ws_clients.get(session_key)
        if ws is None:
            logger.debug("broadcast_to_ws: no live client for session_key={}", session_key)
            return False
        if ws.closed:
            logger.debug("broadcast_to_ws: client socket closed for session_key={}", session_key)
            return False
        try:
            await ws.send_json(data)
            return True
        except Exception as e:
            logger.warning("Failed to send WebSocket message (session_key={}): {}", session_key, e)
            return False
