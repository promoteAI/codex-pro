"""A2A outbound delegation tool — delegate a task to a remote A2A agent.

Unlike ``delegate_task`` (which fans out to in-process worker agents), this tool
drives the A2A client library to hand work to a *remote* peer agent over the
A2A JSON-RPC protocol. The Agent selects a peer ID from the operator-configured
``a2a.remote_agents`` allowlist; it cannot provide an arbitrary URL. The tool
discovers the peer's AgentCard and sends/gets/cancels a task, returning a
structured result (task id, status, output) the orchestrator can act on.

Unreachable/unsupported peers are reported as graceful failures classified with
``ToolResult.error_kind`` so the circuit breaker treats them as infra failures.
"""

from __future__ import annotations

import asyncio
from typing import Any

import aiohttp
from loguru import logger

from codex_pro.a2a.client import A2AClient, A2AClientError
from codex_pro.a2a.models import A2ATask, TaskState
from codex_pro.security.net_guard import GuardedFetchError
from codex_pro.tools import Tool, ToolExecutionContext, ToolResult

# Terminal states after which a task has settled; no further polling is useful.
_TERMINAL_STATES = frozenset({
    TaskState.COMPLETED,
    TaskState.FAILED,
    TaskState.CANCELED,
})

# Default peer timeout; kept under the registry's ``timeout_seconds`` so the
# tool's own deadline wins the race and classification stays deterministic.
_DEFAULT_TIMEOUT_SECONDS = 30.0
_POLL_INTERVAL_SECONDS = 1.0
_MAX_POLL_ITERATIONS = 30


def _error_kind_for(exc: BaseException) -> str:
    """Map a transport exception to a ``ToolResult.error_kind``.

    Mirrors the web tools' convention: timeouts classify as ``timeout``, other
    aiohttp/OS errors as ``dependency``, everything else ``internal``.
    """
    if isinstance(exc, asyncio.TimeoutError):
        return "timeout"
    if isinstance(exc, GuardedFetchError):
        return "dependency" if not exc.blocked_by_policy else "validation"
    if isinstance(exc, A2AClientError):
        return "dependency"
    if isinstance(exc, (aiohttp.ClientError, OSError)):
        return "dependency"
    return "internal"


class A2ADelegateTool(Tool):
    """Delegate a task to a remote A2A agent."""

    name = "delegate_a2a"
    description = (
        "Delegate a task to a remote A2A agent and return its result. "
        "Use when work should be handed to an external agent reachable over A2A "
        "(e.g. a specialized peer service) rather than done locally. "
        "Specify 'agent' as the ID of an operator-configured remote peer. "
        "Set action='send' to dispatch and wait, 'get' to poll an existing task, "
        "or 'cancel' to stop one. For tasks you can do yourself, do NOT delegate."
    )
    parameters = {
        "type": "object",
        "properties": {
            "task": {
                "type": "string",
                "description": "The task description / instruction to hand to the remote agent. Required for action='send'; ignored for 'get'/'cancel'.",
            },
            "agent": {
                "type": "string",
                "description": "ID of a peer preconfigured by the operator under a2a.remote_agents.",
            },
            "action": {
                "type": "string",
                "enum": ["send", "get", "cancel"],
                "description": "Operation to perform. 'send' dispatches a new task and waits for completion; 'get' polls an existing task by task_id; 'cancel' stops one.",
                "default": "send",
            },
            "task_id": {
                "type": "string",
                "description": "Task ID required for action='get' or 'cancel'. For 'send', provide it to reuse/continue a task, or omit to let the peer assign one.",
            },
            "wait": {
                "type": "boolean",
                "description": "For action='send', whether to poll until the task reaches a terminal state. Default true.",
                "default": True,
            },
        },
        "required": ["agent"],
    }
    # Sending or cancelling mutates remote state; polling is read-only.
    risk_level = "exec"
    # Outbound delegation reaches an external peer over HTTP, so it carries the
    # same capability as web_fetch/web_search and is gated by execution's
    # network_policy (a "deny" policy blocks it, exactly like the web tools).
    capabilities = ("network.outbound",)
    timeout_seconds = 120

    def __init__(
        self,
        *,
        remote_agents: list[dict[str, Any]] | None = None,
        timeout_seconds: float = _DEFAULT_TIMEOUT_SECONDS,
    ):
        # ``remote_agents`` is the operator-controlled destination allowlist,
        # baked in at registration time from config. Model calls select only an
        # ID; they cannot supply an arbitrary URL.
        self._remote_agents = {a["id"]: a for a in (remote_agents or []) if a.get("id") and a.get("url")}
        self._timeout_seconds = timeout_seconds
        self._client = A2AClient(timeout=timeout_seconds)

    def is_ready(self) -> bool:
        """The tool is usable only when an operator-configured peer exists."""
        return bool(self._remote_agents)

    def readiness_detail(self) -> tuple[bool, str]:
        if self._remote_agents:
            return True, f"{len(self._remote_agents)} remote agent(s) configured"
        return False, "no remote agents configured under a2a.remote_agents"

    def execution_mode(self, params: dict[str, Any]) -> str:
        return "read_only" if params.get("action") == "get" else "side_effect"

    def _resolve_target(self, params: dict[str, Any]) -> tuple[str, str, bool]:
        """Resolve an allowlisted target as (url, source, allow_private)."""
        if params.get("url"):
            raise ValueError(
                "Direct URLs are not accepted. Select an operator-configured agent ID."
            )
        agent_name = params.get("agent", "")
        if agent_name:
            entry = self._remote_agents.get(agent_name)
            if not entry:
                known = ", ".join(sorted(self._remote_agents)) or "(none configured)"
                raise ValueError(
                    f"Unknown agent '{agent_name}'. Configured agents: {known}"
                )
            return entry["url"], f"agent '{agent_name}'", bool(entry.get("allow_private", False))
        raise ValueError("Specify 'agent' using an operator-configured remote agent ID.")

    async def execute(self, params: dict[str, Any], ctx: ToolExecutionContext | None = None) -> ToolResult:
        try:
            url, source, allow_private = self._resolve_target(params)
        except ValueError as e:
            return ToolResult(success=False, error=str(e), error_kind="validation")

        action = params.get("action", "send")
        task_id = params.get("task_id", "")

        try:
            if action == "send":
                return await self._send_and_wait(params, url, source, allow_private)
            if action == "get":
                return await self._get(url, source, task_id, allow_private)
            if action == "cancel":
                return await self._cancel(url, source, task_id, allow_private)
            return ToolResult(
                success=False,
                error=f"Unsupported action '{action}'.",
                error_kind="validation",
            )
        except Exception as e:
            logger.warning("A2A delegate ({}) failed: {}", source, e)
            return ToolResult(
                success=False,
                error=f"A2A delegation to {source} failed: {e}",
                error_kind=_error_kind_for(e),
            )

    async def _send_and_wait(
        self, params: dict[str, Any], url: str, source: str, allow_private: bool
    ) -> ToolResult:
        task_desc = params.get("task", "")
        if not task_desc:
            return ToolResult(
                success=False,
                error="action='send' requires a non-empty 'task'.",
                error_kind="validation",
            )
        task_id = params.get("task_id", "")
        wait = params.get("wait", True)

        # Discover first so we surface an unreachable/unsupported peer cleanly
        # before spending a task; the card name is also useful context for output.
        try:
            card = await self._client.discover(url, allow_private=allow_private)
        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Cannot reach A2A agent at {source} ({url}): {e}",
                error_kind=_error_kind_for(e),
            )

        task = await self._client.send_task(
            url, task_desc, task_id=task_id, allow_private=allow_private
        )

        if wait and not self._is_terminal(task.state):
            task = await self._poll(url, task.id, allow_private)

        return self._format_task(task, source, card.name, action="send")

    async def _get(
        self, url: str, source: str, task_id: str, allow_private: bool
    ) -> ToolResult:
        if not task_id:
            return ToolResult(
                success=False,
                error="action='get' requires a task_id.",
                error_kind="validation",
            )
        task = await self._client.get_task(url, task_id, allow_private=allow_private)
        return self._format_task(task, source, "", action="get")

    async def _cancel(
        self, url: str, source: str, task_id: str, allow_private: bool
    ) -> ToolResult:
        if not task_id:
            return ToolResult(
                success=False,
                error="action='cancel' requires a task_id.",
                error_kind="validation",
            )
        task = await self._client.cancel_task(url, task_id, allow_private=allow_private)
        return self._format_task(task, source, "", action="cancel")

    async def _poll(self, url: str, task_id: str, allow_private: bool) -> A2ATask:
        """Poll tasks/get until the task reaches a terminal state or we give up."""
        task = await self._client.get_task(url, task_id, allow_private=allow_private)
        for _ in range(_MAX_POLL_ITERATIONS):
            if self._is_terminal(task.state):
                return task
            await asyncio.sleep(_POLL_INTERVAL_SECONDS)
            task = await self._client.get_task(url, task_id, allow_private=allow_private)
        logger.warning("A2A task {} did not settle within {} polls", task_id, _MAX_POLL_ITERATIONS)
        return task

    @staticmethod
    def _is_terminal(state: TaskState) -> bool:
        return state in _TERMINAL_STATES

    @staticmethod
    def _task_output(task: A2ATask) -> str:
        """Extract the last agent (or any) message text as the task output."""
        texts = [m.text_content for m in task.messages if m.role == "agent" and m.text_content]
        if texts:
            return texts[-1]
        return "".join(m.text_content for m in task.messages if m.text_content)

    def _format_task(self, task: A2ATask, source: str, card_name: str, *, action: str) -> ToolResult:
        output = self._task_output(task)
        state = task.state.value
        success = task.state == TaskState.COMPLETED

        lines = [f"Action: {action}", f"Task ID: {task.id}", f"State: {state}"]
        if card_name:
            lines.append(f"Agent: {card_name}")
        if output:
            lines.append(f"Output:\n{output}")

        metadata = {
            "task_id": task.id,
            "state": state,
            "agent": card_name or source,
            "action": action,
        }
        if not success and task.state == TaskState.FAILED:
            error = output or "Remote task failed."
            return ToolResult(success=False, output="\n".join(lines), error=error, metadata=metadata)
        return ToolResult(success=success, output="\n".join(lines), metadata=metadata)
