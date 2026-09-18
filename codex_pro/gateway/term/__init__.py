"""Real terminal (PTY) subsystem for the gateway.

Provides interactive pseudo-terminal sessions exposed to the web UI over a
dedicated WebSocket endpoint (``/ws/term``). The PTY byte stream is passed
through verbatim to the browser, where ``xterm.js`` performs terminal emulation.
"""

from codex_pro.gateway.term.pty import PtyProcess
from codex_pro.gateway.term.ws_term import TerminalWebSocket

__all__ = ["PtyProcess", "TerminalWebSocket"]
