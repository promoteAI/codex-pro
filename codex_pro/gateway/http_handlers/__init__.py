"""HTTP handler modules for the gateway server.

Extracted from gateway/server.py to improve modularity and testability.
"""
from __future__ import annotations

from codex_pro.gateway.http_handlers.base import (
    check_csrf,
    idempotency_fingerprint,
    idempotency_key,
    is_loopback_peer,
    request_token,
    require_a2a_principal,
    require_admin_token,
    require_api_token,
    resolve_web_dir,
)
from codex_pro.gateway.http_handlers.message_handler import MessageHandler
from codex_pro.gateway.http_handlers.metadata_handler import MetadataHandlers
from codex_pro.gateway.http_handlers.session_handler import SessionHandlers

__all__ = [
    "check_csrf",
    "idempotency_fingerprint",
    "idempotency_key",
    "is_loopback_peer",
    "request_token",
    "require_a2a_principal",
    "require_admin_token",
    "require_api_token",
    "resolve_web_dir",
    "MessageHandler",
    "MetadataHandlers",
    "SessionHandlers",
]
