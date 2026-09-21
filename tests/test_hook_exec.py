# tests/test_hook_exec.py
from __future__ import annotations

import asyncio
from unittest.mock import MagicMock

import pytest

from codex_pro.gateway.api.hooks import HookStore
from codex_pro.gateway.hook_exec import (
    SESSION_START_PROMPT_KEY,
    collect_session_start_hooks,
    execute_session_start,
    _inject_session_start_prompt,
    _run_process_hook,
)
from codex_pro.session.manager import Session


def _make_hook(**overrides) -> dict:
    base = {
        "id": "h1",
        "event": "SessionStart",
        "run_mode": "process",
        "scope": "用户",
        "command": "echo hi",
        "name": "",
        "enabled": True,
    }
    base.update(overrides)
    return base


def _make_store(tmp_path, *hooks) -> HookStore:
    store = HookStore(tmp_path)
    for hook in hooks:
        store.create(hook)
    return store


def test_collect_filters_event_and_enabled(tmp_path):
    store = _make_store(
        tmp_path,
        _make_hook(id="a", event="SessionStart"),
        _make_hook(id="b", event="SessionStart", enabled=False),
        _make_hook(id="c", event="Stop"),
    )
    collected = collect_session_start_hooks(store)
    assert [h["id"] for h in collected] == ["a"]


@pytest.mark.asyncio
async def test_run_process_hook_ok(tmp_path):
    # A trivial command that should succeed; the function must not raise.
    await _run_process_hook("echo session-start-ok")


@pytest.mark.asyncio
async def test_run_process_hook_timeout_does_not_raise(tmp_path, monkeypatch):
    # Deterministically exercise the timeout branch: a subprocess whose
    # communicate() raises TimeoutError must be killed, waited on, and the hook
    # must return without raising. (Real subprocess kill on Windows can leave an
    # orphaned grandchild, so the timeout path is mocked here.)
    from unittest.mock import AsyncMock

    proc = MagicMock()
    proc.returncode = None

    async def _communicate():
        raise asyncio.TimeoutError

    proc.communicate = _communicate
    proc.kill = MagicMock()  # real asyncio process.kill() is synchronous
    proc.wait = AsyncMock()
    monkeypatch.setattr(
        "codex_pro.gateway.hook_exec.asyncio.create_subprocess_shell",
        AsyncMock(return_value=proc),
    )

    await asyncio.wait_for(_run_process_hook("whatever"), timeout=2)
    proc.kill.assert_called_once()
    proc.wait.assert_awaited_once()


@pytest.mark.asyncio
async def test_run_process_hook_failure_does_not_raise(tmp_path):
    await _run_process_hook("this-command-definitely-does-not-exist-xyz")


@pytest.mark.asyncio
async def test_inject_prompt_persists_to_session(tmp_path):
    from unittest.mock import AsyncMock

    server = MagicMock()
    manager = MagicMock()
    server._workspace = tmp_path
    server.session_manager = manager
    manager.save = AsyncMock()

    session = Session(key="api:u1")
    await _inject_session_start_prompt(server, session, ["first", "second"])

    assert session.metadata[SESSION_START_PROMPT_KEY] == "first\n\nsecond"
    manager.save.assert_awaited_once_with(session)


@pytest.mark.asyncio
async def test_inject_prompt_appends_to_existing(tmp_path):
    from unittest.mock import AsyncMock

    server = MagicMock()
    manager = MagicMock()
    server._workspace = tmp_path
    server.session_manager = manager
    manager.save = AsyncMock()

    session = Session(key="api:u1")
    session.metadata[SESSION_START_PROMPT_KEY] = "existing"
    await _inject_session_start_prompt(server, session, ["more"])
    assert session.metadata[SESSION_START_PROMPT_KEY] == "existing\n\nmore"


@pytest.mark.asyncio
async def test_execute_session_start_process_and_prompt(tmp_path):
    from unittest.mock import AsyncMock

    server = MagicMock()
    manager = MagicMock()
    server._workspace = tmp_path
    server.session_manager = manager
    manager.save = AsyncMock()

    _make_store(
        tmp_path,
        _make_hook(id="p1", run_mode="prompt", command="You are a helpful assistant."),
        _make_hook(id="c1", run_mode="process", command="echo ran"),
    )

    session = Session(key="api:u1")
    await execute_session_start(server, session)

    assert SESSION_START_PROMPT_KEY in session.metadata
    assert "helpful assistant" in session.metadata[SESSION_START_PROMPT_KEY]


@pytest.mark.asyncio
async def test_execute_session_start_noop_when_no_hooks(tmp_path):
    server = MagicMock()
    server._workspace = tmp_path
    server.session_manager = MagicMock()
    _make_store(tmp_path)  # empty store

    session = Session(key="api:u1")
    await execute_session_start(server, session)
    assert SESSION_START_PROMPT_KEY not in session.metadata


@pytest.mark.asyncio
async def test_execute_session_start_disabled_hooks_ignored(tmp_path):
    server = MagicMock()
    manager = MagicMock()
    server._workspace = tmp_path
    server.session_manager = manager

    _make_store(
        tmp_path,
        _make_hook(id="off", run_mode="prompt", command="nope", enabled=False),
    )
    session = Session(key="api:u1")
    await execute_session_start(server, session)
    assert SESSION_START_PROMPT_KEY not in session.metadata
