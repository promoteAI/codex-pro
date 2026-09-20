"""SSH connection management — CRUD plus connectivity test and discovery.

Connections are saved as a small JSON document under the gateway's data dir
(``data/connections.json``), mirroring how the auth subsystem persists its
state there. No external SSH library is required: the ``test`` endpoint
performs a socket-level TCP probe against host:port (and checks the identity
file is readable when one is configured), and ``refresh`` parses
``~/.ssh/config`` for ``Host`` directives to seed the discovery list shown in
the UI.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import socket
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

from aiohttp import web
from loguru import logger

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer

# Auth methods a connection may use. "password" stores a secret that is never
# echoed back to clients; "identity" references a key file on disk.
AUTH_METHODS = {"none", "identity", "password"}

# Fields a client may set when creating/updating a connection.
_ALLOWED = {"name", "host", "port", "user", "auth_method", "identity_file", "password"}
# Fields that may change on update. The name (the record's key) is read-only —
# a rename is expressed by deleting and re-adding.
_EDITABLE = {"host", "port", "user", "auth_method", "identity_file", "password"}

_SSH_CONFIG_HOST_RE = re.compile(r"^\s*Host\s+(.+?)\s*$", re.IGNORECASE)


def _ssh_config_path() -> Path:
    """Path to the user's SSH config (overridable in tests)."""
    return Path.home() / ".ssh" / "config"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validate_record(body: dict[str, Any]) -> list[str]:
    """Return a list of validation errors (empty when the body is clean)."""
    errors: list[str] = []
    name = str(body.get("name", "")).strip()
    if not name:
        errors.append("name is required")
    host = str(body.get("host", "")).strip()
    if not host:
        errors.append("host is required")
    port = body.get("port", 22)
    if not isinstance(port, int) or isinstance(port, bool) or not 1 <= port <= 65535:
        errors.append("port must be an integer between 1 and 65535")
    auth_method = body.get("auth_method", "none")
    if auth_method not in AUTH_METHODS:
        errors.append(f"auth_method must be one of: {', '.join(sorted(AUTH_METHODS))}")
    if auth_method == "identity" and not str(body.get("identity_file", "")).strip():
        errors.append("identity_file is required when auth_method is 'identity'")
    return errors


class ConnectionsAPI:
    """RESTful management of saved SSH connections."""

    def __init__(self, server: GatewayServer):
        self._server = server
        self._lock = asyncio.Lock()

    # ── guards ────────────────────────────────────────────────────────────────

    def _guard(self, request: web.Request, action: str) -> web.Response | None:
        # Connections reference host/credentials on the local machine, so every
        # action (including listing) is admin-scoped. _require_admin_token also
        # enforces CSRF/Host checks for the state-changing endpoints, and on a
        # token-less deployment falls back to those same origin checks as the
        # boundary (the same posture as cron/providers).
        return self._server._require_admin_token(request, action=action)

    # ── persistence ───────────────────────────────────────────────────────────

    def _store_path(self) -> Path:
        return Path(self._server._workspace) / "data" / "connections.json"

    def _load(self) -> dict[str, dict[str, Any]]:
        """Load the connection store as a {name: record} mapping."""
        path = self._store_path()
        if not path.exists():
            return {}
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("cannot read connections store {}: {}", path, exc)
            return {}
        if not isinstance(raw, dict):
            return {}
        return {
            str(name): rec for name, rec in raw.items() if isinstance(rec, dict)
        }

    async def _save(self, store: dict[str, dict[str, Any]]) -> None:
        path = self._store_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(
            json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        os.replace(tmp, path)

    @staticmethod
    def _serialize(record: dict[str, Any]) -> dict[str, Any]:
        """Return a client-safe view, redacting any stored secret."""
        out = {
            "name": record.get("name", ""),
            "host": record.get("host", ""),
            "port": record.get("port", 22),
            "user": record.get("user", ""),
            "auth_method": record.get("auth_method", "none"),
            "identity_file": record.get("identity_file", ""),
            "created_at": record.get("created_at", ""),
            "updated_at": record.get("updated_at", ""),
        }
        # Never echo the password back. The UI only needs to know whether one is
        # set so it can display the edit form correctly.
        out["has_password"] = bool(record.get("password"))
        return out

    # ── handlers ──────────────────────────────────────────────────────────────

    async def list_connections(self, request: web.Request) -> web.Response:
        guard = self._guard(request, "connections_list")
        if guard is not None:
            return guard
        store = self._load()
        connections = [self._serialize(rec) for rec in store.values()]
        return web.json_response({"connections": connections, "total": len(connections)})

    async def add_connection(self, request: web.Request) -> web.Response:
        guard = self._guard(request, "connections_create")
        if guard is not None:
            return guard
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        if not isinstance(body, dict):
            return web.json_response({"error": "body must be a JSON object"}, status=400)

        body = {k: body[k] for k in _ALLOWED if k in body}
        errors = _validate_record(body)
        if errors:
            return web.json_response({"error": "; ".join(errors)}, status=400)

        name = str(body["name"]).strip()
        async with self._lock:
            store = self._load()
            if name in store:
                return web.json_response({"error": f"connection '{name}' already exists"}, status=409)
            now = _now()
            record: dict[str, Any] = {
                "name": name,
                "host": str(body["host"]).strip(),
                "port": body.get("port", 22),
                "user": str(body.get("user", "")).strip(),
                "auth_method": body.get("auth_method", "none"),
                "identity_file": str(body.get("identity_file", "")).strip(),
                "created_at": now,
                "updated_at": now,
            }
            if body.get("password"):
                record["password"] = str(body["password"])
            store[name] = record
            await self._save(store)
        return web.json_response({"connection": self._serialize(record)}, status=201)

    async def update_connection(self, request: web.Request) -> web.Response:
        guard = self._guard(request, "connections_update")
        if guard is not None:
            return guard
        name = request.match_info["name"]
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        if not isinstance(body, dict):
            return web.json_response({"error": "body must be a JSON object"}, status=400)

        async with self._lock:
            store = self._load()
            record = store.get(name)
            if record is None:
                return web.json_response({"error": f"connection '{name}' not found"}, status=404)

            merged = dict(record)
            for k in _EDITABLE:
                if k in body:
                    merged[k] = body[k]
            errors = _validate_record(merged)
            if errors:
                return web.json_response({"error": "; ".join(errors)}, status=400)
            merged["name"] = name
            merged["host"] = str(merged["host"]).strip()
            merged["user"] = str(merged.get("user", "")).strip()
            if merged.get("identity_file") is not None:
                merged["identity_file"] = str(merged["identity_file"]).strip()
            else:
                merged["identity_file"] = ""
            # An empty password on update clears the stored secret; the request
            # simply omits the key to leave it unchanged.
            if "password" in body and not body["password"]:
                merged.pop("password", None)
            elif body.get("password"):
                merged["password"] = str(body["password"])
            merged["updated_at"] = _now()
            store[name] = merged
            await self._save(store)
            return web.json_response({"connection": self._serialize(merged)})

    async def delete_connection(self, request: web.Request) -> web.Response:
        guard = self._guard(request, "connections_delete")
        if guard is not None:
            return guard
        name = request.match_info["name"]
        async with self._lock:
            store = self._load()
            if name not in store:
                return web.json_response({"error": f"connection '{name}' not found"}, status=404)
            del store[name]
            await self._save(store)
        return web.json_response({"status": "deleted"})

    async def test_connection(self, request: web.Request) -> web.Response:
        """Probe connectivity for a saved connection.

        Returns immediately with the probe result; never blocks on a long
        handshake (a short TCP connect timeout keeps the UI responsive).
        """
        guard = self._guard(request, "connections_test")
        if guard is not None:
            return guard
        name = request.match_info["name"]
        store = self._load()
        record = store.get(name)
        if record is None:
            return web.json_response({"error": f"connection '{name}' not found"}, status=404)

        host = record.get("host", "")
        port = int(record.get("port", 22) or 22)
        user = record.get("user", "")
        identity = record.get("identity_file", "")

        result = await self._probe(host, port)
        ok, detail = result
        if ok and identity:
            guest_ident = _identity_ok(identity)
            if guest_ident:
                ok = False
                detail = f"identity file not readable: {guest_ident}"

        return web.json_response({
            "ok": ok,
            "host": host,
            "port": port,
            "user": user,
            "detail": detail,
            "checked_at": _now(),
        })

    async def refresh_connections(self, request: web.Request) -> web.Response:
        """Discover SSH connections on this machine.

        Parses ``~/.ssh/config`` for ``Host`` directives and returns them as a
        list of candidate hosts for the UI's discovery pane. This does not
        persist anything — the user picks a candidate and saves it explicitly.
        """
        guard = self._guard(request, "connections_refresh")
        if guard is not None:
            return guard
        hosts: list[dict[str, Any]] = []
        config_path = _ssh_config_path()
        if config_path.exists():
            try:
                for line in config_path.read_text(encoding="utf-8", errors="replace").splitlines():
                    m = _SSH_CONFIG_HOST_RE.match(line)
                    if not m:
                        continue
                    for raw in re.split(r"[\s,]+", m.group(1).strip()):
                        if not raw:
                            continue
                        host = raw.strip()
                        if host in {"*"}:
                            continue
                        if all(host not in h["host"] for h in hosts):
                            hosts.append({"host": host})
            except OSError as exc:
                logger.warning("cannot read ssh config {}: {}", config_path, exc)
        return web.json_response({"hosts": hosts, "total": len(hosts)})

    # ── helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    async def _probe(host: str, port: int) -> tuple[bool, str]:
        """Socket-level TCP connect probe to host:port."""
        loop = asyncio.get_running_loop()
        try:
            await asyncio.wait_for(loop.run_in_executor(None, _tcp_connect, host, port), timeout=5)
        except (asyncio.TimeoutError, OSError) as exc:
            return False, f"cannot connect to {host}:{port} ({exc})"
        return True, "reachable"


def _tcp_connect(host: str, port: int) -> None:
    with socket.create_connection((host, port), timeout=3):
        pass


def _identity_ok(path: str) -> str | None:
    """Return an error string when an identity file is missing, else None."""
    expanded = Path(path).expanduser()
    if not expanded.exists():
        return f"{path} does not exist"
    if not os.access(expanded, os.R_OK):
        return f"{path} is not readable"
    return None
