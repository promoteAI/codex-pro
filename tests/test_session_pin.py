import pytest


@pytest.mark.asyncio
async def test_pin_and_list_filter(tmp_path):
    from codex_pro.session.manager import SessionManager

    mgr = SessionManager(tmp_path)
    s = await mgr.get_or_create("cli:pinme")
    assert await mgr.pin_session("cli:pinme") is True
    assert (await mgr.get("cli:pinme")).pinned is True
    pinned = [x for x in mgr.list_sessions() if x["pinned"]]
    assert any(x["key"] == "cli:pinme" for x in pinned)


@pytest.mark.asyncio
async def test_unpin_session(tmp_path):
    from codex_pro.session.manager import SessionManager

    mgr = SessionManager(tmp_path)
    await mgr.get_or_create("cli:pinme")
    assert await mgr.pin_session("cli:pinme") is True
    assert await mgr.unpin_session("cli:pinme") is True
    assert (await mgr.get("cli:pinme")).pinned is False


@pytest.mark.asyncio
async def test_unpin_missing_session_returns_false(tmp_path):
    from codex_pro.session.manager import SessionManager

    mgr = SessionManager(tmp_path)
    assert await mgr.unpin_session("cli:nope") is False
