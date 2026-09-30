from codex_pro.session.manager import Session


def test_session_defaults():
    s = Session(key="cli:xs")
    assert s.type == "interactive"
    assert s.pinned is False
    assert s.parent_session_id == ""
    assert s.forked_from_id == ""
    assert s.session_id != ""
