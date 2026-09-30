"""Deterministic project identity derived from a directory path."""
from __future__ import annotations

import re

_MAX_SLUG = 80


def project_id_from_directory(directory: str) -> str:
    """Return a stable ``proj_<slug>`` id for a directory path.

    The same directory always yields the same id (mirrors ZCode's
    ``projectIdFromDirectory``): lowercase, non-alphanumerics collapse to ``-``,
    truncated, then prefixed with ``proj_``.
    """
    real = directory.strip()
    slug = re.sub(r"[^a-z0-9]+", "-", real.lower()).strip("-")
    if not slug:
        slug = "root"
    slug = slug[:_MAX_SLUG]
    return f"proj_{slug}"
