from codex_pro.workspace_registry import WorkspaceRegistry


def test_register_and_get_workspace():
    reg = WorkspaceRegistry()
    reg.register("ws1", "/p/ws1", config=object(), storage=object(), agent=object())
    entry = reg.get("ws1")
    assert entry is not None
    assert entry.workspace_path == "/p/ws1"
    assert entry.workspace_key == "ws1"


def test_list_returns_all():
    reg = WorkspaceRegistry()
    reg.register("a", "/x", config=None, storage=None, agent=None)
    reg.register("b", "/y", config=None, storage=None, agent=None)
    assert {w.workspace_key for w in reg.list()} == {"a", "b"}


def test_unknown_key_is_none():
    reg = WorkspaceRegistry()
    assert reg.get("missing") is None


import pytest


@pytest.mark.asyncio
async def test_close_all_closes_storage():
    class _S:
        def __init__(self):
            self.closed = False

        async def close(self):
            self.closed = True

    reg = WorkspaceRegistry()
    storage = _S()
    reg.register("a", "/x", storage=storage)
    await reg.close_all()
    assert storage.closed is True
    assert reg.list() == []
