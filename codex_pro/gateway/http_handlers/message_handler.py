"""HTTP message handler — the core /message endpoint.

Extracted from gateway/server.py. Handles authentication, idempotency,
turn acceptance, and the HTTP wait-for-response flow.
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from aiohttp import web
from loguru import logger

from codex_pro.bus.events import (
    ContentBlock,
    ContentType,
    FAULTED_TURN_OUTCOMES,
    InboundEvent,
    OutboundEvent,
    TERMINAL_TURN_OUTCOMES,
    final_frame_http_status,
    turn_outcome_http_status,
)
from codex_pro.bus.idempotency import (
    IDEMPOTENCY_FINGERPRINT_METADATA,
    IDEMPOTENCY_NAMESPACE_METADATA,
    durable_fingerprint_conflicts,
    idempotency_ledger_metadata,
)


class MessageHandler:
    """HTTP POST /message handler — authentication, idempotency, turn flow."""

    def __init__(self, server: Any):
        self._server = server

    # ── Static helpers (moved from GatewayServer) ──────────────────────────

    @staticmethod
    def _http_final_response(
        event_id: str,
        session_key: str,
        reply: dict[str, Any],
    ) -> tuple[int, dict[str, Any]]:
        """Map a final outbound frame to truthful synchronous HTTP semantics."""
        metadata = reply.get("metadata")
        metadata = metadata if isinstance(metadata, dict) else {}
        turn_status = str(metadata.get("_turn_status") or "")
        if turn_status not in TERMINAL_TURN_OUTCOMES:
            turn_status = "failed" if metadata.get("_error") else "completed"
        status = final_frame_http_status(metadata, turn_status)
        payload: dict[str, Any] = {
            "status": turn_status,
            "event_id": event_id,
            "session_key": session_key,
            "reply": reply,
        }
        if turn_status != "completed":
            default_reason = (
                "agent processing failed" if turn_status in FAULTED_TURN_OUTCOMES else f"turn {turn_status}"
            )
            payload["error"] = str(metadata.get("_error_reason") or default_reason)
        return status, payload

    @staticmethod
    def _http_turn_run_response(
        row: dict[str, Any],
        event_id: str,
        session_key: str,
    ) -> tuple[int, dict[str, Any], bool]:
        """Represent an event already known by the durable turn ledger."""
        status = str(row.get("status") or "accepted")
        base = {
            "status": status,
            "event_id": event_id,
            "session_key": session_key,
        }
        if status not in TERMINAL_TURN_OUTCOMES:
            return 200, base, False
        response_text = str(row.get("response_text") or "")
        http_status = turn_outcome_http_status(status)
        if status == "completed":
            return (
                http_status,
                {
                    **base,
                    "reply": {
                        "text": response_text,
                        "is_final": True,
                        "message_kind": "final",
                        "metadata": {"_inbound_event_id": event_id},
                    },
                },
                True,
            )
        payload = {
            **base,
            "error": str(row.get("error") or f"turn {status}"),
        }
        if response_text:
            payload["response_text"] = response_text
        return http_status, payload, True

    # ── Tool delivery buffering ────────────────────────────────────────────

    def _buffer_http_tool_delivery(
        self,
        correlation_id: str,
        payload: dict[str, Any],
    ) -> str | None:
        """Snapshot one tool delivery for a synchronous HTTP response."""
        try:
            encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            snapshot = json.loads(encoded)
        except (TypeError, ValueError) as exc:
            return f"gateway tool delivery is not JSON serializable: {exc}"

        now = time.monotonic()
        self._server._purge_http_tool_deliveries(now)
        entry = self._server._pending_http_tool_deliveries.get(correlation_id)
        frames, char_count = (entry[0], entry[1]) if entry is not None else ([], 0)
        metadata = snapshot.get("metadata")
        metadata = metadata if isinstance(metadata, dict) else {}
        artifact_delivery_id = str(metadata.get("_artifact_delivery_id") or "")
        artifact_part = metadata.get("_artifact_part")
        if artifact_delivery_id and artifact_part is not None:
            for frame in frames:
                existing_metadata = frame.get("metadata")
                if not isinstance(existing_metadata, dict):
                    continue
                if (
                    str(existing_metadata.get("_artifact_delivery_id") or "")
                    == artifact_delivery_id
                    and existing_metadata.get("_artifact_part") == artifact_part
                ):
                    self._server._pending_http_tool_deliveries[correlation_id] = (
                        frames, char_count, now,
                    )
                    return None
        frame_chars = len(encoded)
        if (
            len(frames) >= self._server._MAX_HTTP_TOOL_DELIVERY_FRAMES
            or char_count + frame_chars > self._server._MAX_HTTP_TOOL_DELIVERY_CHARS
            or not self._server._make_http_tool_delivery_room(
                frame_chars, preserve=correlation_id,
            )
        ):
            return (
                "gateway HTTP tool-delivery buffer limit exceeded "
                f"(correlation_id={correlation_id})"
            )

        frames.append(snapshot)
        self._server._pending_http_tool_deliveries[correlation_id] = (
            frames, char_count + frame_chars, now,
        )
        self._server._pending_http_tool_delivery_frames += 1
        self._server._pending_http_tool_delivery_chars += frame_chars
        return None

    def _pop_http_tool_deliveries(self, correlation_id: str) -> tuple[list[dict[str, Any]], int, float] | None:
        entry = self._server._pending_http_tool_deliveries.pop(correlation_id, None)
        if entry is None:
            return None
        frames, char_count, updated_at = entry
        self._server._pending_http_tool_delivery_frames = max(
            0, self._server._pending_http_tool_delivery_frames - len(frames),
        )
        self._server._pending_http_tool_delivery_chars = max(
            0, self._server._pending_http_tool_delivery_chars - char_count,
        )
        return frames, char_count, updated_at

    def _take_http_tool_deliveries(self, correlation_id: str) -> list[dict[str, Any]]:
        entry = self._pop_http_tool_deliveries(correlation_id)
        if entry is None:
            return []
        frames, _char_count, updated_at = entry
        if time.monotonic() - updated_at > self._server._HTTP_TOOL_DELIVERY_TTL_SECONDS:
            return []
        return frames

    def _clear_http_tool_deliveries(self, correlation_id: str) -> None:
        self._pop_http_tool_deliveries(correlation_id)

    def _purge_http_tool_deliveries(self, now: float | None = None) -> None:
        current = time.monotonic() if now is None else now
        expired = [
            correlation_id
            for correlation_id, (_frames, _chars, updated_at)
            in self._server._pending_http_tool_deliveries.items()
            if current - updated_at > self._server._HTTP_TOOL_DELIVERY_TTL_SECONDS
        ]
        for correlation_id in expired:
            self._clear_http_tool_deliveries(correlation_id)

    def _make_http_tool_delivery_room(self, frame_chars: int, *, preserve: str) -> bool:
        """Evict oldest orphaned wait buffers under global memory pressure."""
        def has_room() -> bool:
            return (
                self._server._pending_http_tool_delivery_frames + 1
                <= self._server._MAX_HTTP_TOOL_DELIVERY_TOTAL_FRAMES
                and self._server._pending_http_tool_delivery_chars + frame_chars
                <= self._server._MAX_HTTP_TOOL_DELIVERY_TOTAL_CHARS
            )

        while not has_room():
            orphaned = [
                (updated_at, correlation_id)
                for correlation_id, (_frames, _chars, updated_at)
                in self._server._pending_http_tool_deliveries.items()
                if (
                    correlation_id != preserve
                    and (
                        correlation_id not in self._server._pending_http
                        or self._server._pending_http[correlation_id].done()
                    )
                )
            ]
            if not orphaned:
                return False
            _updated_at, oldest = min(orphaned)
            logger.warning(
                "Evicting orphaned gateway HTTP tool-delivery buffer "
                "under capacity pressure (correlation_id={})",
                oldest,
            )
            self._clear_http_tool_deliveries(oldest)
        return True

    def _clear_all_http_tool_deliveries(self) -> None:
        self._server._pending_http_tool_deliveries.clear()
        self._server._pending_http_tool_delivery_frames = 0
        self._server._pending_http_tool_delivery_chars = 0

    async def _release_durable_claim(self, event_id: str) -> None:
        """Best-effort release of a tombstone this request can no longer own."""
        try:
            await self._server._bus.release_durable_idempotency(event_id)
        except Exception as e:
            logger.error(
                "Releasing durable idempotency claim {} failed: {}",
                event_id, e,
            )

    # ── Core handler ───────────────────────────────────────────────────────

    async def handle_message(self, request: web.Request) -> web.Response:
        """Handle HTTP POST /message: auth → rate limit → session → bus publish."""
        from codex_pro.gateway.http_handlers.base import (
            idempotency_fingerprint,
            idempotency_key,
            is_loopback_peer,
            request_token,
            require_api_token,
        )
        from codex_pro.gateway.ws_session import resolve_client_session_key

        # Auth gate
        guard = require_api_token(
            request, self._server.auth, self._server._tokens_configured(),
            action="message",
        )
        if guard is not None:
            return guard

        origin = request.headers.get("Origin", "").strip()
        sec_fetch_site = request.headers.get("Sec-Fetch-Site", "").strip()
        host = request.headers.get("Host", "").strip()
        if self._server.auth.is_cross_site_browser(origin, sec_fetch_site, host):
            self._server.auth.audit("message", ok=False, reason=f"cross-site origin rejected: {origin or '?'}")
            return web.json_response({"error": "cross-site request forbidden"}, status=403)

        # Parse body
        try:
            body = await request.json()
        except json.JSONDecodeError:
            return web.json_response({"error": "invalid JSON"}, status=400)
        if not isinstance(body, dict):
            return web.json_response({"error": "JSON body must be an object"}, status=400)

        # Idempotency key
        try:
            idempotency_key_val = idempotency_key(request, body)
        except ValueError as e:
            return web.json_response({"error": str(e)}, status=400)

        # Normalize platform
        platform = self._server._normalize_platform(body.get("platform") or "api")
        user_id = body.get("user_id", "")
        chat_id = body.get("chat_id", user_id)
        text = body.get("text", "")
        media_urls = body.get("media_urls", [])
        wait = bool(body.get("wait", False))
        is_group = bool(body.get("is_group", False))
        timeout_seconds = max(1, min(int(body.get("timeout_seconds", 180)), 600))

        if not text and not media_urls:
            return web.json_response({"error": "text or media_urls required"}, status=400)

        # Validate media_urls
        if not isinstance(media_urls, list):
            return web.json_response({"error": "media_urls must be a list"}, status=400)
        max_urls = self._server._config.media_max_urls_per_message
        if len(media_urls) > max_urls:
            return web.json_response(
                {"error": f"too many media_urls (max {max_urls})"},
                status=400,
            )

        # Rate limit pre-check (don't consume yet — idempotency may short-circuit)
        rejection = self._server._authenticate_and_check_rate_limit(
            platform, user_id, chat_id,
            trusted=is_loopback_peer(request),
            consume_rate_limit=False,
        )
        if rejection == "unauthorized":
            await self._server.hooks.emit("auth_failed", platform=platform, user_id=user_id)
            return web.json_response({"error": "unauthorized"}, status=403)
        self._server.auth.audit("message", platform=platform, user_id=user_id, ok=True)

        # Session key resolution
        normally_ok = self._server.auth.is_authorized(platform, user_id)
        session_key, sk_err = resolve_client_session_key(
            body.get("session_key"),
            platform=platform,
            chat_id=chat_id,
            allow_fallback=normally_ok,
        )
        if sk_err:
            self._server.auth.audit(
                "message", platform=platform, user_id=user_id,
                ok=False, reason=sk_err,
            )
            return web.json_response({"error": "forbidden session_key"}, status=403)

        # Idempotency machinery
        claim = None
        event_id = ""
        operation_fingerprint = ""
        durable_claimed = False
        if idempotency_key_val:
            principal = "anonymous"
            if self._server._tokens_configured():
                principal = self._server.auth.principal_for_token(
                    request_token(request)
                ) or "invalid"
            scope = f"http\0{principal}\0{session_key}"
            from codex_pro.bus.idempotency import (
                deterministic_event_id,
            )
            event_id = deterministic_event_id("gateway-message", scope, idempotency_key_val)
            operation_fingerprint = idempotency_fingerprint({
                "platform": platform,
                "user_id": user_id,
                "chat_id": chat_id,
                "text": text,
                "media_urls": media_urls,
                "is_group": is_group,
                "session_key": session_key,
            })
            claim = await self._server._message_idempotency.claim(
                namespace="gateway-message",
                scope=scope,
                key=idempotency_key_val,
                fingerprint=operation_fingerprint,
                event_id=event_id,
                context={"session_key": session_key, "wait": wait, "transport": "http"},
            )
            if claim.outcome == "conflict":
                return web.json_response(
                    {"error": "idempotency key was already used for a different request"},
                    status=409,
                )
            if claim.outcome == "full":
                return web.json_response({"error": "idempotency store is full"}, status=503)
            if claim.outcome == "duplicate" and claim.entry is not None:
                cached = claim.entry.response if wait else claim.entry.admission
                if cached is not None:
                    return web.json_response(cached.payload, status=cached.status)
                try:
                    waiter = (
                        self._server._message_idempotency.wait(claim.entry, timeout=timeout_seconds)
                        if wait
                        else self._server._message_idempotency.wait_admitted(
                            claim.entry, timeout=timeout_seconds,
                        )
                    )
                    cached = await waiter
                    return web.json_response(cached.payload, status=cached.status)
                except asyncio.TimeoutError:
                    return web.json_response(
                        {"error": "timeout", "event_id": event_id, "session_key": session_key},
                        status=504,
                    )

            # Durable idempotency claim
            try:
                durable_claim = await self._server._bus.claim_durable_idempotency(
                    event_id,
                    namespace="gateway-message",
                    fingerprint=operation_fingerprint,
                    session_key=session_key,
                )
            except Exception as e:
                logger.error("Durable idempotency claim failed: {}", e)
                if claim.entry is not None:
                    await self._server._message_idempotency.abort(claim.entry)
                return web.json_response(
                    {"error": "durable idempotency storage unavailable"}, status=503,
                )
            durable_outcome = durable_claim.get("outcome")
            durable_record = durable_claim.get("row")
            if durable_outcome == "full":
                if claim.entry is not None:
                    await self._server._message_idempotency.abort(claim.entry)
                return web.json_response(
                    {"error": "durable idempotency store is full"}, status=503,
                )
            if durable_outcome == "conflict":
                if claim.entry is not None:
                    await self._server._message_idempotency.abort(claim.entry)
                return web.json_response(
                    {"error": "idempotency key was already used for a different request"},
                    status=409,
                )
            if durable_outcome == "duplicate" and isinstance(durable_record, dict):
                response_status, response_payload, terminal = self._http_turn_run_response(
                    durable_record, event_id, session_key,
                )
                if terminal:
                    await self._server._message_idempotency.complete(
                        claim.entry, status=response_status, payload=response_payload,
                    )
                else:
                    await self._server._message_idempotency.abort(
                        claim.entry, status=response_status, payload=response_payload,
                    )
                return web.json_response(response_payload, status=response_status)
            if durable_outcome != "new":
                if claim.entry is not None:
                    await self._server._message_idempotency.abort(claim.entry)
                return web.json_response(
                    {"error": "durable idempotency storage unavailable"}, status=503,
                )
            durable_claimed = True

            # Process-local replay
            try:
                durable_row = await self._server._bus.get_turn_run(event_id)
            except Exception:
                await self._server._release_durable_claim(event_id)
                durable_claimed = False
                if claim.entry is not None:
                    await self._server._message_idempotency.abort(claim.entry)
                raise
            if durable_row is not None and claim.entry is not None:
                if durable_fingerprint_conflicts(
                    durable_row, namespace="gateway-message", fingerprint=operation_fingerprint,
                ):
                    await self._server._release_durable_claim(event_id)
                    durable_claimed = False
                    await self._server._message_idempotency.abort(
                        claim.entry, status=409,
                        payload={"error": "idempotency key was already used for a different request"},
                    )
                    return web.json_response(
                        {"error": "idempotency key was already used for a different request"},
                        status=409,
                    )
                try:
                    await self._server._bus.sync_durable_idempotency(durable_row)
                except Exception as e:
                    logger.error("Durable idempotency sync failed: {}", e)
                    await self._server._release_durable_claim(event_id)
                    durable_claimed = False
                    await self._server._message_idempotency.abort(claim.entry)
                    return web.json_response(
                        {"error": "durable idempotency storage unavailable"}, status=503,
                    )
                response_status, response_payload, terminal = self._http_turn_run_response(
                    durable_row, event_id, session_key,
                )
                if terminal:
                    await self._server._message_idempotency.complete(
                        claim.entry, status=response_status, payload=response_payload,
                    )
                else:
                    await self._server._message_idempotency.abort(
                        claim.entry, status=response_status, payload=response_payload,
                    )
                return web.json_response(response_payload, status=response_status)

        # Main publish path
        published = False
        publish_outcome_unknown = False
        pending_event_id = ""
        tokens = None
        try:
            if not self._server.rate_limiter.acquire(platform, chat_id):
                if durable_claimed:
                    await self._server._release_durable_claim(event_id)
                    durable_claimed = False
                if claim is not None and claim.entry is not None:
                    await self._server._message_idempotency.abort(
                        claim.entry, status=429, payload={"error": "rate limited"},
                    )
                return web.json_response({"error": "rate limited"}, status=429)

            session, _ = await self._server._reset_session_if_needed(session_key)
            from codex_pro.gateway.session_context import set_session_vars
            tokens = set_session_vars(
                platform=platform, chat_id=chat_id, user_id=user_id,
                session_key=session_key,
            )

            content_blocks = [ContentBlock(type=ContentType.TEXT, text=text)]
            if media_urls:
                paths = await asyncio.gather(
                    *(self._server.media_cache.download(url, platform) for url in media_urls),
                    return_exceptions=True,
                )
                for url, path in zip(media_urls, paths):
                    if isinstance(path, Exception):
                        logger.warning("Gateway media download failed for {}: {}", url, path)
                        continue
                    if not path:
                        continue
                    content_blocks.append(
                        ContentBlock(
                            type=self._server._infer_media_content_type(str(path), url),
                            url=str(path),
                        )
                    )

            event = InboundEvent(
                channel=f"gateway:{platform}",
                sender_id=user_id,
                chat_id=chat_id,
                content=content_blocks,
                session_key_override=session_key,
                is_group=is_group,
                metadata={"gateway": True, "platform": platform, "user_id": user_id},
            )
            if event_id:
                event.event_id = event_id
            if operation_fingerprint:
                event.metadata[IDEMPOTENCY_NAMESPACE_METADATA] = "gateway-message"
                event.metadata[IDEMPOTENCY_FINGERPRINT_METADATA] = operation_fingerprint

            future: asyncio.Future[dict[str, Any]] | None = None
            if wait:
                if len(self._server._pending_http) >= self._server._MAX_PENDING_HTTP:
                    if durable_claimed:
                        await self._server._release_durable_claim(event_id)
                        durable_claimed = False
                    if claim is not None and claim.entry is not None:
                        await self._server._message_idempotency.abort(
                            claim.entry, payload={"error": "too many pending requests"},
                        )
                    return web.json_response({"error": "too many pending requests"}, status=503)
                future = asyncio.get_running_loop().create_future()
                self._server._pending_http[event.event_id] = future
                pending_event_id = event.event_id

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
                        claim.entry, payload={"error": "server overloaded"},
                    )
                return web.json_response({"error": "server overloaded"}, status=503)

            published = True
            await self._server._web_ws.broadcast(
                'session_message',
                {'session_key': session_key, 'event_id': event.event_id},
            )
            if durable_claimed:
                await asyncio.shield(
                    self._server._bus.mark_durable_idempotency_admitted(event.event_id)
                )
                durable_claimed = False
            admission_payload = {
                "status": "accepted",
                "event_id": event.event_id,
                "session_key": session_key,
            }
            if claim is not None and claim.entry is not None:
                if future:
                    await asyncio.shield(
                        self._server._message_idempotency.mark_admitted(
                            claim.entry, status=200, payload=admission_payload,
                        )
                    )
                else:
                    await asyncio.shield(
                        self._server._message_idempotency.complete(
                            claim.entry, status=200, payload=admission_payload,
                        )
                    )
            await self._server.hooks.emit(
                "message_received", platform=platform, user_id=user_id, chat_id=chat_id,
            )

            if future:
                try:
                    payload = await asyncio.wait_for(future, timeout=timeout_seconds)
                except asyncio.TimeoutError:
                    return web.json_response(
                        {"error": "timeout", "event_id": event.event_id, "session_key": session_key},
                        status=504,
                    )
                response_status, response_payload = self._http_final_response(
                    event.event_id, session_key, payload,
                )
                if claim is not None and claim.entry is not None:
                    await self._server._message_idempotency.complete(
                        claim.entry, status=response_status, payload=response_payload,
                    )
                return web.json_response(response_payload, status=response_status)

            return web.json_response(admission_payload)

        except asyncio.CancelledError:
            if not published and not publish_outcome_unknown and claim is not None and claim.entry is not None:
                await asyncio.shield(self._server._message_idempotency.abort(claim.entry))
            if not published and not publish_outcome_unknown and durable_claimed:
                await asyncio.shield(self._server._release_durable_claim(event_id))
            raise
        except Exception:
            if not published and not publish_outcome_unknown and claim is not None and claim.entry is not None:
                await self._server._message_idempotency.abort(claim.entry)
            if not published and not publish_outcome_unknown and durable_claimed:
                await self._server._release_durable_claim(event_id)
            raise
        finally:
            if pending_event_id:
                self._server._pending_http.pop(pending_event_id, None)
                if not published and not publish_outcome_unknown:
                    self._clear_http_tool_deliveries(pending_event_id)
            if tokens is not None:
                from codex_pro.gateway.session_context import clear_session_vars
                clear_session_vars(tokens)
