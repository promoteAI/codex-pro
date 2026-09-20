"""Contract tests for A2ADelegateTool — outbound A2A delegation."""

from __future__ import annotations

from unittest.mock import AsyncMock

import aiohttp
import pytest

from codex_pro.tools import ToolExecutionContext
from codex_pro.agent.tools.a2a_delegate import A2ADelegateTool
from codex_pro.a2a.models import A2ATask, A2AMessage, AgentCard, TaskState


def _ctx(**kwargs) -> ToolExecutionContext:
    defaults = {"session_key": "cli:c1", "user_id": "u1", "trace_id": "t1"}
    defaults.update(kwargs)
    return ToolExecutionContext(**defaults)


def _make_tool(**overrides) -> A2ADelegateTool:
    defaults = dict(
        remote_agents=[{"id": "peer", "url": "https://peer.example.com", "description": "a peer"}],
        timeout_seconds=10.0,
    )
    defaults.update(overrides)
    return A2ADelegateTool(**defaults)


def _card(name: str = "PeerAgent") -> AgentCard:
    return AgentCard(name=name, url="https://peer.example.com", version="1.0")


def _task(task_id: str = "t-1", state: TaskState = TaskState.COMPLETED) -> A2ATask:
    return A2ATask(
        id=task_id,
        state=state,
        messages=[A2AMessage.text("agent", "all done")],
    )


class TestResolveUrl:
    def test_resolve_by_agent_name(self):
        tool = _make_tool()
        url, source = tool._resolve_url({"task": "x", "agent": "peer"})
        assert url == "https://peer.example.com"
        assert "peer" in source

    def test_resolve_by_url(self):
        tool = _make_tool()
        url, source = tool._resolve_url({"task": "x", "url": "https://other"})
        assert url == "https://other"
        assert "https://other" in source

    def test_resolve_both_rejected(self):
        tool = _make_tool()
        with pytest.raises(ValueError):
            tool._resolve_url({"task": "x", "agent": "peer", "url": "https://other"})

    def test_resolve_neither_rejected(self):
        tool = _make_tool()
        with pytest.raises(ValueError):
            tool._resolve_url({"task": "x"})

    def test_resolve_unknown_agent(self):
        tool = _make_tool()
        with pytest.raises(ValueError) as exc:
            tool._resolve_url({"task": "x", "agent": "nope"})
        assert "Unknown agent" in str(exc.value)
        assert "peer" in str(exc.value)


class TestExecutionMode:
    def test_get_is_read_only(self):
        assert _make_tool().execution_mode({"action": "get"}) == "read_only"

    def test_send_is_side_effect(self):
        assert _make_tool().execution_mode({"action": "send"}) == "side_effect"

    def test_cancel_is_side_effect(self):
        assert _make_tool().execution_mode({"action": "cancel"}) == "side_effect"

    def test_default_action_is_send(self):
        assert _make_tool().execution_mode({}) == "side_effect"

    def test_carries_network_outbound_capability(self):
        # Outbound delegation reaches an external peer; it must be gated by
        # execution.network_policy=deny like web_fetch/web_search.
        assert "network.outbound" in _make_tool().capabilities


class TestExecuteSend:
    @pytest.mark.asyncio
    async def test_send_happy_path(self):
        tool = _make_tool()
        tool._client.discover = AsyncMock(return_value=_card())
        tool._client.send_task = AsyncMock(return_value=_task("t-1", TaskState.COMPLETED))
        result = await tool.execute({"task": "do it", "agent": "peer"}, _ctx())
        assert result.success is True
        assert result.metadata["task_id"] == "t-1"
        assert result.metadata["state"] == "completed"
        assert "all done" in result.output
        tool._client.discover.assert_awaited_once()
        tool._client.send_task.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_send_no_wait_returns_early(self):
        tool = _make_tool()
        tool._client.discover = AsyncMock(return_value=_card())
        tool._client.send_task = AsyncMock(return_value=_task("t-1", TaskState.WORKING))
        tool._client.get_task = AsyncMock()
        result = await tool.execute(
            {"task": "do it", "agent": "peer", "wait": False}, _ctx()
        )
        assert result.success is False
        assert result.metadata["state"] == "working"
        # Do not poll a non-terminal task when wait=False.
        assert not tool._client.get_task.called

    @pytest.mark.asyncio
    async def test_send_polls_until_terminal(self):
        tool = _make_tool()
        tool._client.discover = AsyncMock(return_value=_card())
        tool._client.send_task = AsyncMock(return_value=_task("t-1", TaskState.WORKING))
        # First poll still working, second completed.
        tool._client.get_task = AsyncMock(side_effect=[
            _task("t-1", TaskState.WORKING),
            _task("t-1", TaskState.COMPLETED),
        ])
        result = await tool.execute({"task": "do it", "agent": "peer"}, _ctx())
        assert result.success is True
        assert result.metadata["state"] == "completed"
        assert tool._client.get_task.await_count == 2

    @pytest.mark.asyncio
    async def test_send_unreachable_peer(self):
        tool = _make_tool()
        tool._client.discover = AsyncMock(side_effect=aiohttp.ClientConnectionError("boom"))
        result = await tool.execute({"task": "do it", "agent": "peer"}, _ctx())
        assert result.success is False
        assert result.error_kind == "dependency"
        assert "boom" in result.error

    @pytest.mark.asyncio
    async def test_send_timeout(self):
        tool = _make_tool()
        tool._client.discover = AsyncMock(side_effect=aiohttp.ServerTimeoutError("slow"))
        result = await tool.execute({"task": "do it", "agent": "peer"}, _ctx())
        assert result.success is False
        assert result.error_kind == "timeout"

    @pytest.mark.asyncio
    async def test_send_failed_task_reports_error(self):
        tool = _make_tool()
        tool._client.discover = AsyncMock(return_value=_card())
        tool._client.send_task = AsyncMock(
            return_value=_task("t-1", TaskState.FAILED)
        )
        result = await tool.execute({"task": "do it", "agent": "peer"}, _ctx())
        assert result.success is False
        assert result.error

    @pytest.mark.asyncio
    async def test_send_validation_error_no_target(self):
        tool = _make_tool()
        result = await tool.execute({"task": "do it"}, _ctx())
        assert result.success is False
        assert result.error_kind == "validation"

    @pytest.mark.asyncio
    async def test_send_requires_task(self):
        tool = _make_tool()
        result = await tool.execute({"agent": "peer"}, _ctx())
        assert result.success is False
        assert result.error_kind == "validation"
        assert "task" in result.error


class TestExecuteGetCancel:
    @pytest.mark.asyncio
    async def test_get_requires_task_id(self):
        tool = _make_tool()
        result = await tool.execute({"task": "x", "agent": "peer", "action": "get"}, _ctx())
        assert result.success is False
        assert result.error_kind == "validation"
        assert "task_id" in result.error

    @pytest.mark.asyncio
    async def test_get_happy_path(self):
        tool = _make_tool()
        tool._client.get_task = AsyncMock(return_value=_task("g1", TaskState.WORKING))
        result = await tool.execute(
            {"task": "x", "agent": "peer", "action": "get", "task_id": "g1"}, _ctx()
        )
        assert result.success is False  # WORKING is not completed
        assert result.metadata["task_id"] == "g1"
        assert tool._client.get_task.await_count == 1

    @pytest.mark.asyncio
    async def test_cancel_requires_task_id(self):
        tool = _make_tool()
        result = await tool.execute(
            {"task": "x", "agent": "peer", "action": "cancel"}, _ctx()
        )
        assert result.success is False
        assert result.error_kind == "validation"

    @pytest.mark.asyncio
    async def test_cancel_happy_path(self):
        tool = _make_tool()
        tool._client.cancel_task = AsyncMock(return_value=_task("c1", TaskState.CANCELED))
        result = await tool.execute(
            {"task": "x", "agent": "peer", "action": "cancel", "task_id": "c1"}, _ctx()
        )
        assert result.success is False  # canceled is not completed
        assert result.metadata["state"] == "canceled"
        assert tool._client.cancel_task.await_count == 1


class TestFormatting:
    def test_task_output_uses_last_agent_message(self):
        task = A2ATask(
            id="t",
            state=TaskState.COMPLETED,
            messages=[A2AMessage.text("agent", "first"), A2AMessage.text("agent", "second")],
        )
        assert A2ADelegateTool._task_output(task) == "second"

    def test_task_output_falls_back_to_any_text(self):
        task = A2ATask(
            id="t",
            state=TaskState.COMPLETED,
            messages=[A2AMessage.text("user", "asked")],
        )
        assert A2ADelegateTool._task_output(task) == "asked"
