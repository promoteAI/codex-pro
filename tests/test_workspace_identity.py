from codex_pro.workspace_identity import derive_workspace_key, normalize_workspace_identity


def test_identity_taken_when_present():
    assert derive_workspace_key("/ws/foo", "remote:ssh:host") == "remote:ssh:host"


def test_identity_falls_back_to_path():
    assert derive_workspace_key("/ws/foo", "") == "/ws/foo"
    assert derive_workspace_key("/ws/foo", None) == "/ws/foo"


def test_identity_is_trimmed():
    assert derive_workspace_key("/ws/foo", "  remote:ssh:host  ") == "remote:ssh:host"
    assert derive_workspace_key("/ws/foo", "   ") == "/ws/foo"


def test_normalize_empty_to_blank():
    assert normalize_workspace_identity("  ") == ""
    assert normalize_workspace_identity(None) == ""
