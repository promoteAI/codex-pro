from __future__ import annotations

from codex_pro.projects import project_id_from_directory


def test_same_directory_always_same_id() -> None:
    a = project_id_from_directory("E:/workspace/foo")
    b = project_id_from_directory("E:/workspace/foo")
    assert a == b


def test_id_has_proj_prefix() -> None:
    pid = project_id_from_directory("E:/workspace/foo")
    assert pid.startswith("proj_")


def test_directory_slug_normalization() -> None:
    pid = project_id_from_directory("E:/workspace/My Project")
    assert pid == project_id_from_directory("e:/workspace/my-project")
