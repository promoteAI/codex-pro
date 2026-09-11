"""WebSocket handler modules for the gateway server.

Extracted from gateway/server.py to improve modularity and testability.
"""
from __future__ import annotations

from codex_pro.gateway.ws_handlers.websocket import WebSocketHandler

__all__ = [
    "WebSocketHandler",
]
