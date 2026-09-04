"""Runtime path helpers for global installs and editable checkouts."""

from __future__ import annotations

from pathlib import Path


def codex_home() -> Path:
    return Path.home() / ".codex-pro"


def default_config_path() -> Path:
    return codex_home() / "codex-pro.yaml"


def bundled_skills_dir() -> Path | None:
    package_root = Path(__file__).resolve().parent
    candidates = [
        package_root / "_bundled" / "skills",
        package_root.parent / "skills",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


# Backward-compat alias for external callers still using the old name.
# New code should import codex_home directly.
codex_home = codex_home
