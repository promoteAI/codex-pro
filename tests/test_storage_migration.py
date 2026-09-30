import pytest


@pytest.mark.asyncio
async def test_migrate_copies_messages_to_history(tmp_path):
    from codex_pro.storage.sqlite import SQLiteBackend
    from codex_pro.storage.migration import migrate_legacy_sessions
    from codex_pro.storage.history import load_history

    db = SQLiteBackend(tmp_path / "migrate.db")
    await db.initialize()
    try:
        # Seed a legacy session row (messages inside the data JSON).
        data = {
            "messages": [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "yo"}],
            "metadata": {},
            "status": "active",
            "title": "greet",
            "pinned": True,
        }
        await db.store_session("cli:mig", data)

        sessions_dir = tmp_path / "sessions"
        sessions_dir.mkdir()
        migrated = await migrate_legacy_sessions(db, sessions_dir)
        assert migrated == 1
        # Messages should now be in the history layer.
        msgs = load_history(sessions_dir, "cli:mig")
        assert [m["content"] for m in msgs] == ["hi", "yo"]
        # Original data row is preserved (copy-only, no data loss).
        kept = await db.load_session("cli:mig")
        assert kept["messages"][0]["content"] == "hi"
    finally:
        await db.close()


@pytest.mark.asyncio
async def test_migrate_empty_db_returns_zero(tmp_path):
    from codex_pro.storage.sqlite import SQLiteBackend
    from codex_pro.storage.migration import migrate_legacy_sessions

    db = SQLiteBackend(tmp_path / "empty.db")
    await db.initialize()
    try:
        sessions_dir = tmp_path / "sessions"
        sessions_dir.mkdir()
        assert await migrate_legacy_sessions(db, sessions_dir) == 0
    finally:
        await db.close()
