import pytest


@pytest.mark.asyncio
async def test_fork_creates_new_session_with_parent(tmp_path):
    from codex_pro.session.manager import SessionManager

    mgr = SessionManager(tmp_path)
    parent = await mgr.get_or_create("cli:p1")
    parent.add_message("user", "hi")
    await mgr.save(parent)

    child = await mgr.fork_session("cli:p1")
    assert child.key == "cli:p1:fork"
    assert child.session_id != parent.session_id
    assert child.forked_from_id == parent.session_id
    assert child.parent_session_id == parent.session_id
    assert len(child.messages) == 1


@pytest.mark.asyncio
async def test_fork_missing_parent_raises(tmp_path):
    from codex_pro.session.manager import SessionManager

    mgr = SessionManager(tmp_path)
    with pytest.raises(KeyError):
        await mgr.fork_session("cli:nope")
