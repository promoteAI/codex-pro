"""Interactions API — expose pending approvals / clarify prompts for the web UI.

The approval-gate decision and the /approve|/deny|/clarify command handling live
in the agent loop already; this endpoint only READS what is pending so a web
client (which does not attach to the cli WebSocket) can render confirmation
cards. Reply is still the existing /message command path.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from aiohttp import web

from codex_pro.permissions.manager import ApprovalStatus
from codex_pro.security.risk_classifier import classify_risk

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer


class InteractionsAPI:
    def __init__(self, server: GatewayServer):
        self._server = server

    def _guard(self, request: web.Request, action: str) -> web.Response | None:
        return self._server._require_api_token(request, action=action)

    async def handle_interactions(self, request: web.Request) -> web.Response:
        guard = self._guard(request, "interactions_list")
        if guard is not None:
            return guard
        session_key = request.query.get("session_key", "")
        loop = getattr(self._server, "_agent_loop", None)
        approvals: list[dict[str, Any]] = []
        clarify: dict[str, Any] | None = None
        if loop is not None:
            approvals = self._collect_approvals(loop, session_key)
            clarify = self._collect_clarify(loop, session_key)
        return web.json_response({"approvals": approvals, "clarify": clarify})

    @staticmethod
    def _collect_approvals(loop, session_key: str) -> list[dict[str, Any]]:
        manager = getattr(loop, "approval", None)
        if manager is None:
            return []
        out = []
        for req in manager.get_pending():
            if req.status != ApprovalStatus.PENDING:
                continue
            if session_key and req.session_key != session_key:
                continue
            risk = classify_risk(req.tool_name or req.action, req.params).value
            out.append({
                "id": req.id,
                "tool": req.tool_name or req.action,
                "params": req.params,
                "risk": risk,
                "reason": "",
                "user_id": req.user_id,
                "created_at": req.created_at,
            })
        return out

    @staticmethod
    def _collect_clarify(loop, session_key: str) -> dict[str, Any] | None:
        manager = getattr(loop, "clarify", None)
        if manager is None or not session_key:
            return None
        req = manager.get_im_pending(session_key)
        if req is None:
            return None
        return {"id": req.id, "question": req.question, "options": req.options}
