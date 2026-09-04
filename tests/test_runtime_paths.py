"""Tests for codex_pro.runtime_paths — global path helpers."""

from pathlib import Path
from unittest.mock import patch

from codex_pro.runtime_paths import bundled_skills_dir, default_config_path, codex_home


class TestCodexHome:
    def test_returns_dot_codex_pro_under_home(self):
        result = codex_home()
        assert result == Path.home() / ".codex-pro"


class TestDefaultConfigPath:
    def test_returns_yaml_under_codex_home(self):
        result = default_config_path()
        assert result == Path.home() / ".codex-pro" / "codex-pro.yaml"


class TestBundledSkillsDir:
    def test_returns_path_when_exists(self, tmp_path: Path):
        skills_dir = tmp_path / "_bundled" / "skills"
        skills_dir.mkdir(parents=True)

        fake_module_file = str(tmp_path / "runtime_paths.py")
        with patch("codex_pro.runtime_paths.__file__", fake_module_file):
            result = bundled_skills_dir()
            assert result is not None
            assert result == skills_dir

    def test_returns_none_when_no_directory_exists(self, tmp_path: Path):
        fake_module_file = str(tmp_path / "runtime_paths.py")
        with patch("codex_pro.runtime_paths.__file__", fake_module_file):
            result = bundled_skills_dir()
            assert result is None
