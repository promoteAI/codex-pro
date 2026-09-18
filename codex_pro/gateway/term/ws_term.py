"""Terminal WebSocket endpoint — real interactive PTY sessions for the UI.

Provides ``/ws/term`` with token auth and per-connection PTY session
management. Unlike the broadcast-style ``/ws/web`` subscription channel, this
endpoint carries a bidirectional byte stream: the client spawns an interactive
shell and streams its stdin across, while the PTY output is streamed back as
base64-encoded chunks for the browser's terminal emulator (``xterm.js``).

On disconnect every process owned by the connection is terminated as a tree, so
an orphaned shell (and any descendants it spawned, e.g. a backgrounded job)
cannot outlive the socket.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import itertools
import json
from typing import Any, TYPE_CHECKING

from aiohttp import web, WSMsgType
from loguru import logger

from codex_pro.config.schema_defs.gateway import TerminalConfig
from codex_pro.gateway import ws_common
from codex_pro.gateway.term.pty import PtyProcess

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer

_MAX_CHUNK_BYTES = 8192
_OUTPUT_DRAIN_TIMEOUT_SECONDS = 2.0
_SHUTDOWN_GRACE_SECONDS = 2.0


class TerminalWebSocket:
    """Owns all live terminal connections on the gateway."""

    def __init__(
        self,
        server: GatewayServer,
        config: TerminalConfig,
        pty_factory: Any | None = None,
    ):
        self._server = server
        self._config = config
        # Swappable so tests can inject a fake PTY instead of spawning real shells.
        self._pty_factory = pty_factory or (lambda **kw: PtyProcess(**kw))
        # conn_id -> {process_id -> TermSession}
        self._connections: dict[str, dict[str, TermSession]] = {}
        self._counter = 0
        self._process_counter = itertools.count(1)
        self._closed = False

    @property
    def config(self) -> TerminalConfig:
        return self._config

    async def handle(self, request: web.Request) -> web.StreamResponse:
        """Origin gate → upgrade → authenticated handshake → message loop."""
        if not self._config.enabled:
            return web.json_response({"error": "terminal disabled"}, status=403)

        rejected = ws_common.reject_cross_site(request, self._server.auth, action="term_ws_auth")
        if rejected is not None:
            return rejected

        if not self._has_capacity():
            self._server.auth.audit(
                "term_ws_auth",
                ok=False,
                reason="too many terminal connections",
            )
            return web.json_response({"error": "too many terminal connections"}, status=503)

        # Reserve a pre-auth slot so the cap check is meaningful even before the
        # handshake completes (same rationale as ws_web.py).
        conn_id = f"term_{self._counter}"
        self._counter += 1
        self._connections[conn_id] = {}

        hb = getattr(self._server._config, "ws_heartbeat_seconds", 0)
        ws = web.WebSocketResponse(heartbeat=hb if hb and hb > 0 else None)
        try:
            await ws.prepare(request)
        except Exception:
            self._connections.pop(conn_id, None)
            raise

        auth_deadline = ws_common.AuthDeadline()
        authenticated = False

        try:
            while True:
                try:
                    msg = await asyncio.wait_for(
                        ws.receive(),
                        timeout=auth_deadline.remaining(),
                    )
                except asyncio.TimeoutError:
                    self._server.auth.audit(
                        "term_ws_auth", ok=False, reason="authentication timeout",
                    )
                    await ws.close()
                    break

                if msg.type != WSMsgType.TEXT:
                    if msg.type in (WSMsgType.ERROR, WSMsgType.CLOSE,
                                    WSMsgType.CLOSED, WSMsgType.CLOSING):
                        break
                    continue

                try:
                    data = json.loads(msg.data)
                except json.JSONDecodeError:
                    continue

                msg_type = data.get("type")

                if msg_type == "auth":
                    token = data.get("token", "")
                    if self._server.auth.authenticate_token(token):
                        authenticated = True
                        auth_deadline.mark_authenticated()
                        self._server.auth.audit("term_ws_auth", ok=True)
                        await ws.send_json({"type": "auth_ok"})
                    else:
                        self._server.auth.audit(
                            "term_ws_auth", ok=False, reason="invalid token",
                        )
                        await ws.send_json({"type": "auth_error", "message": "invalid token"})
                        await ws.close()
                        break

                elif not authenticated:
                    await ws.send_json({"type": "error", "message": "not authenticated"})

                elif msg_type == "start":
                    await self._handle_start(conn_id, ws, data)

                elif msg_type == "write":
                    await self._handle_write(conn_id, data)

                elif msg_type == "resize":
                    await self._handle_resize(conn_id, data)

                elif msg_type == "signal":
                    await self._handle_signal(conn_id, data)

                elif msg_type == "terminate":
                    await self._handle_terminate(conn_id, ws, data)

                elif msg_type == "ping":
                    await ws.send_json({"type": "pong"})
        finally:
            await self._kill_all(conn_id)
            if not authenticated:
                self._server.auth.audit("term_ws_auth", ok=False, reason="disconnected")

        return ws

    # ── Connection capacity ────────────────────────────────────────────────

    def _has_capacity(self) -> bool:
        max_conns = self._config.max_connections_total
        if max_conns > 0 and len(self._connections) >= max_conns:
            return False
        return True

    @property
    def open_connections(self) -> int:
        return len(self._connections)

    # ── Message handlers ───────────────────────────────────────────────────

    async def _handle_start(self, conn_id: str, ws: web.WebSocketResponse, data: dict[str, Any]) -> None:
        req_id = data.get("id")
        params = data.get("params") or {}
        conn = self._connections.get(conn_id)
        if conn is None:
            await ws.send_json({"type": "error", "reqId": req_id, "message": "connection closed"})
            return
        if len(conn) >= self._config.max_processes_per_connection:
            await ws.send_json({"type": "error", "reqId": req_id,
                                "message": "too many processes in connection"})
            return

        process_id = f"term_{next(self._process_counter)}"
        session = TermSession(
            process_id=process_id,
            pty_factory=self._pty_factory,
            shell=params.get("shell") or self._config.default_shell,
            cwd=params.get("cwd") or self._config.working_dir,
            cols=int(params.get("cols") or self._config.default_cols),
            rows=int(params.get("rows") or self._config.default_rows),
            env=params.get("env"),
            max_buffer_bytes=self._config.output_buffer_bytes,
            max_chunk_bytes=self._config.max_chunk_bytes or _MAX_CHUNK_BYTES,
        )
        conn[process_id] = session

        # Stream PTY output and exit events to this client.
        async def _on_output(chunk: bytes) -> None:
            if not chunk:
                code = session.pty.exit_code
                await ws.send_json({"type": "exited", "processId": process_id,
                                    "exitCode": code if code is not None else -1})
                return
            payload = base64.b64encode(chunk).decode("ascii")
            await self._send_bounded(ws, {"type": "output", "processId": process_id,
                                          "seq": session.next_seq(), "stream": "pty",
                                          "data": payload})

        await session.start(_on_output)

        if session.started:
            await ws.send_json({"type": "started", "reqId": req_id, "processId": process_id})
        else:
            await ws.send_json({"type": "error", "reqId": req_id,
                                "message": "failed to start process"})

    async def _handle_write(self, conn_id: str, data: dict[str, Any]) -> None:
        process_id = data.get("processId")
        session = self._sessions(conn_id).get(process_id)
        if session is None:
            return
        raw = data.get("data", "")
        try:
            payload = base64.b64decode(raw, validate=True)
        except (binascii.Error, ValueError):
            return
        await session.write(payload)

    async def _handle_resize(self, conn_id: str, data: dict[str, Any]) -> None:
        process_id = data.get("processId")
        session = self._sessions(conn_id).get(process_id)
        if session is None:
            return
        cols = int(data.get("cols") or 0)
        rows = int(data.get("rows") or 0)
        if cols and rows:
            await session.resize(cols, rows)

    async def _handle_signal(self, conn_id: str, data: dict[str, Any]) -> None:
        process_id = data.get("processId")
        session = self._sessions(conn_id).get(process_id)
        if session is None:
            return
        sig = data.get("signal", "interrupt")
        if sig == "interrupt":
            await session.interrupt()
        else:
            logger.debug("unknown terminal signal {} on {}", sig, process_id)

    async def _handle_terminate(self, conn_id: str, ws: web.WebSocketResponse, data: dict[str, Any]) -> None:
        process_id = data.get("processId")
        session = self._sessions(conn_id).pop(process_id, None)
        if session is None:
            await ws.send_json({"type": "error", "reqId": data.get("id"),
                                "message": "no such process"})
            return
        await session.terminate()

    # ── Session lookup / teardown ──────────────────────────────────────────

    def _sessions(self, conn_id: str) -> dict[str, TermSession]:
        return self._connections.get(conn_id, {})

    async def _send_bounded(self, ws: web.WebSocketResponse, payload: dict[str, Any]) -> None:
        """Send a frame without letting one slow client stall the reader."""
        try:
            await asyncio.wait_for(
                ws.send_json(payload),
                timeout=_OUTPUT_DRAIN_TIMEOUT_SECONDS,
            )
        except Exception:
            # A broken socket is removed by the main loop's finally; the reader
            # side must not spin forever trying to deliver.
            raise

    async def _kill_all(self, conn_id: str) -> None:
        sessions = self._connections.pop(conn_id, {})
        for session in sessions.values():
            try:
                await asyncio.wait_for(session.terminate(), timeout=_SHUTDOWN_GRACE_SECONDS)
            except Exception:
                pass

    async def close_all(self) -> None:
        """Terminate every terminal session, for gateway shutdown."""
        self._closed = True
        for conn_id in list(self._connections.keys()):
            await self._kill_all(conn_id)

    @property
    def session_count(self) -> int:
        return sum(len(v) for v in self._connections.values())


class TermSession:
    """One interactive PTY process tied to a client connection."""

    def __init__(
        self,
        *,
        process_id: str,
        pty_factory: Any,
        shell: str,
        cwd: str,
        cols: int,
        rows: int,
        env: dict[str, str] | None,
        max_buffer_bytes: int,
        max_chunk_bytes: int,
    ):
        self.process_id = process_id
        self.pty = pty_factory(shell=shell, cwd=cwd, cols=cols, rows=rows, env=env)
        self._max_buffer_bytes = max_buffer_bytes
        self._max_chunk_bytes = max_chunk_bytes
        self._seq = 0
        self._started = False
        self._disposed = False

    @property
    def started(self) -> bool:
        return self._started

    def next_seq(self) -> int:
        self._seq += 1
        return self._seq

    async def start(self, on_output) -> None:
        """Attach the output callback and spawn the PTY process."""
        self.pty.set_on_read(on_output)
        try:
            await self.pty.start()
            self._started = True
        except Exception as e:
            logger.warning("terminal process {} failed to start: {}", self.process_id, e)
            self._started = False

    async def write(self, data: bytes) -> None:
        if self._disposed:
            return
        await self.pty.write(data)

    async def resize(self, cols: int, rows: int) -> None:
        if self._disposed:
            return
        await self.pty.resize(cols, rows)

    async def interrupt(self) -> None:
        """Send SIGINT (Ctrl-C) to the process group."""
        if self._disposed:
            return
        proc = self.pty._proc
        if proc is None:
            return
        import signal as _signal
        try:
            if hasattr(proc, "send_signal"):
                proc.send_signal(_signal.SIGINT)
        except Exception:
            pass

    async def terminate(self) -> None:
        if self._disposed:
            return
        self._disposed = True
        await self.pty.terminate()
