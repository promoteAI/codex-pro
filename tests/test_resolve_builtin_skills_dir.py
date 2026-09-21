"""Tests for codex_pro.agent.embedding_helpers._resolve_builtin_skills_dir."""

from pathlib import Path
from unittest.mock import patch

from codex_pro.agent.embedding_helpers import _resolve_builtin_skills_dir


def test_returns_workspace_skills_when_present(tmp_path: Path):
    """A workspace-local skills dir is returned on its own when no bundled dir exists."""
    ws = tmp_path / "ws"
    (ws / "skills").mkdir(parents=True)

    with patch("codex_pro.agent.embedding_helpers.bundled_skills_dir", return_value=None):
        result = _resolve_builtin_skills_dir(ws, "skills")

    assert result == [ws / "skills"]


def test_appends_bundled_dir_when_both_exist(tmp_path: Path):
    """When the workspace skills dir exists AND bundled skills exist, both are returned."""
    ws = tmp_path / "ws"
    (ws / "skills").mkdir(parents=True)
    bundled = tmp_path / "codex_pro" / "skills"
    bundled.mkdir(parents=True)

    with patch(
        "codex_pro.agent.embedding_helpers.bundled_skills_dir",
        return_value=bundled,
    ):
        result = _resolve_builtin_skills_dir(ws, "skills")

    assert ws / "skills" in result
    assert bundled in result


def test_dedups_when_workspace_skills_is_bundled(tmp_path: Path):
    """A workspace skills dir that IS the bundled dir is not returned twice."""
    bundled = tmp_path / "codex_pro" / "skills"
    bundled.mkdir(parents=True)

    with patch(
        "codex_pro.agent.embedding_helpers.bundled_skills_dir",
        return_value=bundled,
    ):
        result = _resolve_builtin_skills_dir(tmp_path / "codex_pro", "skills")

    assert result == [bundled]


def test_returns_empty_when_nothing_exists(tmp_path: Path):
    """Returns an empty list when neither workspace nor bundled skills dir exists."""
    ws = tmp_path / "ws"
    ws.mkdir(parents=True)

    with patch("codex_pro.agent.embedding_helpers.bundled_skills_dir", return_value=None):
        result = _resolve_builtin_skills_dir(ws, "skills")

    assert result == []
