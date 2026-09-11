"""HTTP handler base utilities — pure helpers extracted from GatewayServer.

These are stateless or minimally-stateful helpers used by multiple handler
modules. Keeping them here avoids circular imports and makes unit testing
straightforward.
"""
from __future__ import annotations

import ipaddress
import time
from pathlib import Path
from typing import Any

from aiohttp import web

from codex_pro.bus.idempotency import (
    canonical_operation_fingerprint,
    normalize_idempotency_key,
)


# ---------------------------------------------------------------------------
# Token & auth helpers
# ---------------------------------------------------------------------------

def request_token(request: web.Request, auth: Any = None) -> str:
    """Extract the API/admin token from headers or query string.

    Tries the Authorization header first, then the auth-configured header
    name (e.g. ``X-Codex Pro-Token``), then the query-string ``token``.
    """
    auth_val = request.headers.get("Authorization", "")
    if auth_val:
        stripped = auth_val.strip()
        if stripped.lower().startswith("bearer "):
            return stripped[7:]
        return stripped
    if auth is not None:
        try:
            h = auth.token_from_headers(request.headers)
            if h:
                return h
        except Exception:
            pass
    return request.query.get("token", "").strip()


# ---------------------------------------------------------------------------
# Idempotency helpers
# ---------------------------------------------------------------------------

def idempotency_key(request: web.Request, body: dict[str, Any]) -> str:
    """Normalize an idempotency key from headers or body."""
    header_key = normalize_idempotency_key(
        request.headers.get("Idempotency-Key") or request.headers.get("X-Idempotency-Key")
    )
    body_key = normalize_idempotency_key(body.get("idempotency_key"))
    if header_key and body_key and header_key != body_key:
        raise ValueError("conflicting idempotency keys")
    return header_key or body_key


def idempotency_fingerprint(body: dict[str, Any]) -> str:
    return canonical_operation_fingerprint(body)


# ---------------------------------------------------------------------------
# Loopback trust
# ---------------------------------------------------------------------------

def is_loopback_peer(request: web.Request) -> bool:
    """Whether the request arrives over a loopback socket.

    Derives the verdict from the real TCP peer (``transport.get_extra_info
    ('peername')``), NEVER from ``request.remote`` or forwarded headers such
    as ``X-Forwarded-For`` — those are client-controllable and would let a
    remote caller spoof local trust.
    """
    transport = getattr(request, "transport", None)
    peername = transport.get_extra_info("peername") if transport else None
    if not peername:
        return False
    host = peername[0]
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# CSRF check
# ---------------------------------------------------------------------------

def check_csrf(request: web.Request, auth: Any, *, action: str) -> web.Response | None:
    """Reject cross-site browser requests to mutating endpoints.

    Returns a 403 response to return from the handler, or None to continue.
    Non-browser clients (the CLI) send no Origin / Sec-Fetch-Site and pass.
    """
    origin = request.headers.get("Origin", "").strip()
    sec_fetch_site = request.headers.get("Sec-Fetch-Site", "").strip()
    host = request.headers.get("Host", "").strip()
    is_browser_request = bool(origin) or sec_fetch_site not in ("", "none")
    if not is_browser_request:
        return None
    if auth.is_cross_site_browser(origin, sec_fetch_site, host):
        auth.audit(action, ok=False, reason=f"cross-site origin rejected: {origin or '?'}")
        return web.json_response({"error": "cross-site request forbidden"}, status=403)
    if not auth.is_host_allowed(host):
        auth.audit(action, ok=False, reason=f"untrusted host rejected: {host or '?'}")
        return web.json_response({"error": "cross-site request forbidden"}, status=403)
    return None


# ---------------------------------------------------------------------------
# Token requirement helpers
# ---------------------------------------------------------------------------

def require_api_token(
    request: web.Request,
    auth: Any,
    tokens_configured: bool,
    *,
    action: str,
) -> web.Response | None:
    """Guard for read/chat-level endpoints. Admin tokens also pass."""
    if not tokens_configured:
        return None
    token = request_token(request, auth)
    if auth.authenticate_token(token):
        auth.audit(action, ok=True)
        return None
    auth.audit(action, ok=False, reason="invalid api token")
    return web.json_response({"error": "unauthorized"}, status=401)


def require_admin_token(
    request: web.Request,
    auth: Any,
    admin_tokens: list[str],
    *,
    action: str,
) -> web.Response | None:
    """Guard for high-risk admin endpoints. Enforces CSRF + admin token."""
    csrf = check_csrf(request, auth, action=action)
    if csrf is not None:
        return csrf
    if not admin_tokens:
        return None  # unauthenticated deployment (loopback, no tokens)
    token = request_token(request)
    if auth.authenticate_admin_token(token):
        auth.audit(action, ok=True)
        return None
    auth.audit(action, ok=False, reason="invalid admin token")
    return web.json_response({"error": "admin authorization required"}, status=403)


def require_a2a_principal(
    request: web.Request,
    auth: Any,
    tokens_configured: bool,
    default_owner: str,
) -> str | web.Response:
    """Authenticate A2A and return the caller identity, not just a bool."""
    if not tokens_configured:
        return default_owner
    token = request_token(request)
    principal = auth.principal_for_token(token)
    if principal is not None:
        auth.audit("a2a:rpc", ok=True)
        return principal
    auth.audit("a2a:rpc", ok=False, reason="invalid api token")
    return web.json_response({"error": "unauthorized"}, status=401)


# ---------------------------------------------------------------------------
# Playground & web UI paths
# ---------------------------------------------------------------------------

def playground_path() -> Path:
    return Path(__file__).resolve().parent.parent / "static" / "index.html"


def resolve_web_dir() -> Path | None:
    """Locate the Codex Pro web UI build directory.

    Checks candidates in order:
    1. Bundled in wheel: ``codex_pro/_bundled/web/``
    2. Development: ``web/dist/`` relative to the project root
    """
    pkg_root = Path(__file__).resolve().parent.parent.parent
    candidates = [
        pkg_root / "_bundled" / "web",
        pkg_root.parent / "web" / "dist",
    ]
    for p in candidates:
        if (p / "index.html").exists():
            return p
    return None
