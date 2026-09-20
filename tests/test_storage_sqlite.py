"""Tests for async SQLite storage backend."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
import pytest_asyncio

from codex_pro.storage.sqlite import SQLiteBackend
from codex_pro.session.manager import SessionManager


@pytest_asyncio.fixture
async def backend(tmp_path: Path) -> SQLiteBackend:
    db = SQLiteBackend(tmp_path / "test.db")
    await db.initialize()
    yield db
    await db.close()


@pytest.mark.asyncio
async def test_initialize_creates_db(tmp_path: Path) -> None:
    db = SQLiteBackend(tmp_path / "sub" / "test.db")
    await db.initialize()
    assert db._db is not None
    await db.close()
    assert db._db is None


@pytest.mark.asyncio
async def test_store_and_load_session(backend: SQLiteBackend) -> None:
    data = {"messages": [{"role": "user", "content": "hi"}], "status": "active"}
    await backend.store_session("test:1", data)
    loaded = await backend.load_session("test:1")
    assert loaded is not None
    assert loaded["messages"][0]["content"] == "hi"


@pytest.mark.asyncio
async def test_list_sessions_returns_storage_metadata(backend: SQLiteBackend) -> None:
    await backend.store_session(
        "test:1",
        {
            "messages": [{"role": "user", "content": "hi"}],
            "status": "active",
            "metadata": {"channel": "test"},
        },
    )

    sessions = await backend.list_sessions()

    assert sessions[0]["key"] == "test:1"
    assert sessions[0]["status"] == "active"
    assert sessions[0]["metadata"] == {"channel": "test"}
    assert sessions[0]["message_count"] == 1


@pytest.mark.asyncio
async def test_list_sessions_returns_project(backend: SQLiteBackend) -> None:
    await backend.store_session(
        "test:1",
        {
            "messages": [{"role": "user", "content": "hi"}],
            "status": "active",
            "project": "e:\\workspace\\codex-pro",
        },
    )

    sessions = await backend.list_sessions()

    assert sessions[0]["project"] == "e:\\workspace\\codex-pro"
    # project is a top-level field, not nested in metadata.
    assert "project" not in sessions[0]["metadata"]


@pytest.mark.asyncio
async def test_session_manager_archives_storage_session_without_deleting(tmp_path: Path, backend: SQLiteBackend) -> None:
    manager = SessionManager(sessions_dir=tmp_path / "sessions", storage=backend)
    session = await manager.get_or_create("store:1")
    session.add_message("user", "persist me")
    await manager.save(session)

    assert await manager.archive_session("store:1") is True
    assert await manager.archive_session("missing:1") is False

    loaded = await backend.load_session("store:1")
    listed = await manager.list_sessions_async()

    assert loaded is not None
    assert loaded["status"] == "archived"
    assert listed[0]["key"] == "store:1"
    assert listed[0]["status"] == "archived"


@pytest.mark.asyncio
async def test_unarchive_session_restores_to_active(tmp_path: Path, backend: SQLiteBackend) -> None:
    manager = SessionManager(sessions_dir=tmp_path / "sessions", storage=backend)
    session = await manager.get_or_create("store:2")
    session.add_message("user", "persist me")
    await manager.save(session)

    assert await manager.archive_session("store:2") is True
    assert await manager.unarchive_session("store:2") is True

    loaded = await backend.load_session("store:2")
    assert loaded is not None
    assert loaded["status"] == "active"

    # 只有解归档成功的会话回到 active;不存在的会话应返回 False。
    assert await manager.unarchive_session("missing:2") is False


@pytest.mark.asyncio
async def test_list_sessions_archived_filter(tmp_path: Path, backend: SQLiteBackend) -> None:
    manager = SessionManager(sessions_dir=tmp_path / "sessions", storage=backend)
    for key in ("f:active", "f:archived"):
        session = await manager.get_or_create(key)
        session.add_message("user", f"hi {key}")
        await manager.save(session)
    await manager.archive_session("f:archived")

    only_archived = await manager.list_sessions_async(archived=True)
    only_active = await manager.list_sessions_async(archived=False)
    all_sessions = await manager.list_sessions_async()

    assert [s["key"] for s in only_archived] == ["f:archived"]
    assert [s["key"] for s in only_active] == ["f:active"]
    assert len(all_sessions) == 2


@pytest.mark.asyncio
async def test_delete_session_removes_from_storage(tmp_path: Path, backend: SQLiteBackend) -> None:
    manager = SessionManager(sessions_dir=tmp_path / "sessions", storage=backend)
    session = await manager.get_or_create("del:1")
    session.add_message("user", "to be deleted")
    await manager.save(session)

    assert await manager.delete_session("del:1") is True
    assert await backend.load_session("del:1") is None
    assert await manager.delete_session("del:1") is False
    # 已归档的会话同样可删除。
    await manager.get_or_create("del:2")
    await manager.archive_session("del:2")
    assert await manager.delete_session("del:2") is True
    assert await backend.load_session("del:2") is None


@pytest.mark.asyncio
async def test_load_missing_session(backend: SQLiteBackend) -> None:
    result = await backend.load_session("nonexistent")
    assert result is None


@pytest.mark.asyncio
async def test_delete_session(backend: SQLiteBackend) -> None:
    await backend.store_session("del:1", {"messages": []})
    assert await backend.delete_session("del:1") is True
    assert await backend.load_session("del:1") is None
    assert await backend.delete_session("del:1") is False


@pytest.mark.asyncio
async def test_store_and_load_memory(backend: SQLiteBackend) -> None:
    data = {"type": "user", "key": "name", "content": "test"}
    await backend.store_memory("m1", data)
    memories = await backend.load_memories("user")
    assert len(memories) == 1
    assert memories[0]["key"] == "name"


@pytest.mark.asyncio
async def test_delete_memory(backend: SQLiteBackend) -> None:
    await backend.store_memory("m2", {"type": "env", "key": "k"})
    assert await backend.delete_memory("m2") is True
    assert await backend.delete_memory("m2") is False


@pytest.mark.asyncio
async def test_store_and_load_task(backend: SQLiteBackend) -> None:
    await backend.store_task("t1", {"status": "pending", "workflow_id": "w1"})
    task = await backend.load_task("t1")
    assert task is not None
    assert task["status"] == "pending"


@pytest.mark.asyncio
async def test_list_tasks_with_filters(backend: SQLiteBackend) -> None:
    await backend.store_task("t1", {"status": "pending", "workflow_id": "w1"})
    await backend.store_task("t2", {"status": "done", "workflow_id": "w1"})
    await backend.store_task("t3", {"status": "pending", "workflow_id": "w2"})

    all_tasks = await backend.list_tasks()
    assert len(all_tasks) == 3

    w1_tasks = await backend.list_tasks(workflow_id="w1")
    assert len(w1_tasks) == 2

    pending = await backend.list_tasks(status="pending")
    assert len(pending) == 2


@pytest.mark.asyncio
async def test_reconnect_after_close(tmp_path: Path) -> None:
    db = SQLiteBackend(tmp_path / "reconnect.db")
    await db.initialize()
    await db.store_session("k", {"messages": []})

    await db._db.close()
    db._db = None

    loaded = await db.load_session("k")
    assert loaded is not None
    await db.close()


@pytest.mark.asyncio
async def test_concurrent_writes(backend: SQLiteBackend) -> None:
    async def write(i: int) -> None:
        await backend.store_session(f"c:{i}", {"messages": [{"i": i}]})

    await asyncio.gather(*(write(i) for i in range(20)))

    for i in range(20):
        loaded = await backend.load_session(f"c:{i}")
        assert loaded is not None


@pytest.mark.asyncio
async def test_file_mode_archive_unarchive_delete_and_filter(tmp_path: Path) -> None:
    """No-storage (file) mode: archival moves files into ``archive/``, so the
    default listing must keep scanning only the main dir (preserving existing
    caller behaviour) while archived=True reads the archive dir."""
    manager = SessionManager(sessions_dir=tmp_path / "sessions")
    for key in ("cli:a", "cli:b"):
        session = await manager.get_or_create(key)
        session.add_message("user", f"hi {key}")
        await manager.save(session)

    # Archive cli:a; the file moves into archive/ without a status rewrite.
    assert await manager.archive_session("cli:a") is True

    only_archived = await manager.list_sessions_async(archived=True)
    only_active = await manager.list_sessions_async(archived=False)
    default_all = await manager.list_sessions_async()

    assert [s["key"] for s in only_archived] == ["cli:a"]
    assert [s["key"] for s in only_active] == ["cli:b"]
    # Default listing must NOT include the archived session (regression guard).
    assert sorted(s["key"] for s in default_all) == ["cli:b"]

    # Unarchive moves it back and it reappears in the active/default listing.
    assert await manager.unarchive_session("cli:a") is True
    assert sorted(s["key"] for s in await manager.list_sessions_async()) == ["cli:a", "cli:b"]

    # Delete removes from whichever location it currently lives in.
    await manager.archive_session("cli:b")
    assert await manager.delete_session("cli:b") is True
    assert [s["key"] for s in await manager.list_sessions_async()] == ["cli:a"]
    assert await manager.delete_session("cli:b") is False
