"""Session thinking persistence: reasoning spans live outside ``messages``.

Thinking is emitted live as cognitive frames but must survive a reopen. This
module pins the contract: ``Session.thinkings`` is a separate ordered list that
never enters the LLM context (``get_history`` reads only ``messages``), survives
both file and SQLite persistence, and is merged into the human-readable
transcript by ``display_messages`` just before the assistant reply it preceded.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from codex_pro.session.manager import Session, SessionManager


def _session_with_thinking() -> Session:
    """A user turn → tool round (thinking + tool_calls) → final answer.

    ``msg_index`` anchors each span to the assistant message of the round that
    produced it, so thinking interleaves with tool calls rather than piling up
    before the final reply.
    """
    s = Session(key="gateway:cli:test")
    s.add_message("user", "研究一下这个项目")
    # Round 1: model reasons then calls a tool; thinking anchors to the
    # assistant(tool_calls) message it precedes.
    s.add_thinking(thinking_id="t-1", text="用户想了解项目结构。", duration_ms=1200, msg_index=1)
    s.add_message("assistant", "", tool_calls=[{"id": "call_1", "type": "function", "function": {"name": "read", "arguments": "{}"}}])
    s.add_message("tool", "mock tool result", tool_call_id="call_1", name="read")
    # Round 2 (final): model reasons then answers; thinking anchors to the final
    # assistant reply.
    s.add_thinking(thinking_id="t-2", text="先看 manager.py 的 Session 类。", duration_ms=800, msg_index=3)
    s.add_message("assistant", "好的，项目是……")
    return s


def test_get_history_never_includes_thinking():
    """The LLM working record must not see thinking spans."""
    s = _session_with_thinking()
    history = s.get_history()
    assert all(m.get("role") != "thinking" for m in history)
    # get_history() returns messages after last_consolidated; the user turn, the
    # tool round, and the assistant reply are all present, thinking is not.
    assert [m.get("role") for m in history] == ["user", "assistant", "tool", "assistant"]


def test_display_messages_interleaves_thinking_before_reply():
    """The human transcript shows each thinking line just before its reply."""
    s = _session_with_thinking()
    visible = s.display_messages()
    roles = [m.get("role") for m in visible]
    # Thinking interleaves with tool calls: span t-1 precedes the tool round,
    # span t-2 precedes the final answer — not piled up before the answer.
    assert roles == ["user", "thinking", "assistant", "tool", "thinking", "assistant"]
    # Each thinking row carries the fields the frontend renders.
    th1, th2 = visible[1], visible[4]
    assert th1["internal"] is True
    assert th1["thinking_id"] == "t-1"
    assert th1["duration_ms"] == 1200
    assert th2["thinking_id"] == "t-2"


def test_thinkings_survive_file_roundtrip(tmp_path: Path):
    """_save_to_file → _load_from_file keeps thinkings and their order."""
    mgr = SessionManager(sessions_dir=tmp_path, storage=None)
    s = _session_with_thinking()
    import asyncio

    asyncio.run(mgr.save(s))
    loaded = asyncio.run(mgr._load_from_file(s.key))
    assert loaded is not None
    assert [t["thinking_id"] for t in loaded.thinkings] == ["t-1", "t-2"]
    assert loaded.thinkings[0]["text"] == "用户想了解项目结构。"
    assert loaded.thinkings[0]["msg_index"] == 1
    assert loaded.thinkings[1]["msg_index"] == 3
    # The messages list reconstructs without any thinking lines leaking in.
    assert [m.get("role") for m in loaded.messages] == ["user", "assistant", "tool", "assistant"]


class _MemoryBackend:
    """Minimal StorageBackend storing sessions as JSON blobs in a dict.

    Avoids aiosqlite's asyncio.Lock binding to a single event loop (which
    hangs when reused across ``asyncio.run`` calls in tests) while still
    exercising the ``_save_to_storage`` → ``_load_from_storage`` roundtrip.
    """

    def __init__(self) -> None:
        self._sessions: dict[str, dict] = {}

    async def initialize(self) -> None:
        pass

    async def close(self) -> None:
        pass

    async def store_session(self, key: str, data: dict[str, Any]) -> None:
        self._sessions[key] = data

    async def load_session(self, key: str) -> dict[str, Any] | None:
        return self._sessions.get(key)

    async def delete_session(self, key: str) -> bool:
        return self._sessions.pop(key, None) is not None

    async def store_project(self, project_id: str, data: dict[str, Any]) -> None:
        pass

    async def load_project(self, project_id: str) -> dict[str, Any] | None:
        return None

    async def delete_project(self, project_id: str) -> bool:
        return True


def test_thinkings_survive_sqlite_roundtrip(tmp_path: Path):
    """_save_to_storage → _load_from_storage keeps thinkings."""
    import asyncio

    store = _MemoryBackend()
    mgr = SessionManager(sessions_dir=tmp_path, storage=store)
    s = _session_with_thinking()
    asyncio.run(mgr.save(s))
    loaded = asyncio.run(mgr._load_from_storage(s.key))
    assert loaded is not None
    assert [t["thinking_id"] for t in loaded.thinkings] == ["t-1", "t-2"]
    assert [m.get("role") for m in loaded.messages] == ["user", "assistant", "tool", "assistant"]
    loaded_visible = loaded.display_messages()
    assert [m.get("role") for m in loaded_visible] == ["user", "thinking", "assistant", "tool", "thinking", "assistant"]


def test_legacy_session_without_thinkings_loads_empty():
    """Sessions written before the field existed reconstruct with thinkings=[]."""
    s = Session(key="gateway:cli:legacy")
    s.add_message("user", "hi")
    s.add_message("assistant", "hello")
    assert s.thinkings == []
    assert [m.get("role") for m in s.display_messages()] == ["user", "assistant"]
