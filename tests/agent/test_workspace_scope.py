"""Unit tests for workspace scope resolution and validation.

``validate_project_workspace`` gates a claimed project directory from an
inbound message. It must accept any existing real directory (projects may live
outside the global workspace) while rejecting non-directories and system
pseudo-filesystems.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from codex_pro.agent.workspace_scope import validate_project_workspace, session_workspace


def test_accepts_existing_directory_beside_global_workspace():
    with tempfile.TemporaryDirectory() as global_ws, tempfile.TemporaryDirectory() as proj:
        # Project lives OUTSIDE the global workspace — allowed.
        result = validate_project_workspace(proj, global_ws)
        assert result == str(Path(proj).resolve())


def test_rejects_nonexistent_path():
    with tempfile.TemporaryDirectory() as global_ws:
        with pytest.raises(ValueError):
            validate_project_workspace(str(Path(global_ws) / "missing"), global_ws)


def test_rejects_file_not_directory():
    with tempfile.TemporaryDirectory() as global_ws:
        f = Path(global_ws) / "a.txt"
        f.write_text("x")
        with pytest.raises(ValueError):
            validate_project_workspace(str(f), global_ws)


def test_rejects_system_pseudo_filesystems():
    # /proc and /sys are cwd-restricted regardless of existence.
    with pytest.raises(ValueError):
        validate_project_workspace("/proc", "/tmp")


def test_rejects_empty_and_bad_paths():
    with tempfile.TemporaryDirectory() as global_ws:
        for bad in ["", "   ", "\x00"]:
            with pytest.raises(ValueError):
                validate_project_workspace(bad, global_ws)


def test_session_workspace_falls_back_to_global():
    from codex_pro.gateway.session_context import clear_session_vars

    with tempfile.TemporaryDirectory() as global_ws, tempfile.TemporaryDirectory() as proj:
        # No override -> global
        assert session_workspace(global_ws) == global_ws

        # With an override set -> it wins
        from codex_pro.gateway.session_context import set_session_vars
        tokens = set_session_vars(workspace=proj)
        try:
            assert session_workspace(global_ws) == proj
        finally:
            clear_session_vars(tokens)
        # After clearing -> global again
        assert session_workspace(global_ws) == global_ws
