from codex_pro.session.manager import Session


def test_session_defaults():
    s = Session(key="cli:xs")
    assert s.type == "interactive"
    assert s.pinned is False
    assert s.parent_session_id == ""
    assert s.forked_from_id == ""
    assert s.session_id != ""


import pytest


@pytest.mark.asyncio
async def test_get_or_create_sets_session_id(tmp_path):
    from codex_pro.session.manager import SessionManager

    mgr = SessionManager(tmp_path)
    s = await mgr.get_or_create("cli:abc")
    assert s.session_id != ""
    s2 = await mgr.get_or_create("cli:abc")
    assert s2.session_id == s.session_id


@pytest.mark.asyncio
async def test_load_preserves_persisted_session_fields(tmp_path):
    from codex_pro.session.manager import SessionManager

    mgr = SessionManager(tmp_path)
    s = await mgr.get_or_create("cli:abc")
    s.type = "temporary"
    s.pinned = True
    s.parent_session_id = "parent-x"
    s.forked_from_id = "parent-x"
    await mgr.save(s)
    # 强制冷加载：清空 cache，让 get 真正从磁盘重建。
    mgr._cache.clear()
    loaded = await mgr.get("cli:abc")
    assert loaded.type == "temporary"
    assert loaded.pinned is True
    assert loaded.parent_session_id == "parent-x"
    assert loaded.forked_from_id == "parent-x"
