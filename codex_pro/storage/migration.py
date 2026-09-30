"""Copy-only migration of legacy SQLite session records to the layered storage.

Phase 4 separates message history (bucketed JSONL) from session metadata
(SQLite). This migration copies each legacy session's ``messages`` into the
history layer WITHOUT deleting the original ``data`` row, so nothing is lost if
the process is interrupted or the layered read path is not yet in production.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from loguru import logger

from codex_pro.storage.history import append_history


async def migrate_legacy_sessions(storage: Any, sessions_dir: Path) -> int:
    """Copy every session's messages into the history layer.

    Returns the number of sessions migrated. Each session that already has its
    messages in the history layer is skipped (idempotent). The original
    ``data`` row is left intact.
    """
    if storage is None or not hasattr(storage, "list_sessions"):
        return 0
    sessions = await storage.list_sessions()
    migrated = 0
    for session in sessions:
        key = session.get("key")
        if not key:
            continue
        # The history layer already has this session's messages? Skip.
        history_path = _first_history_path(sessions_dir, key)
        if history_path is not None and history_path.exists() and history_path.stat().st_size > 0:
            continue
        try:
            data = await storage.load_session(key)
        except Exception:  # noqa: BLE001 — a single corrupt row must not abort migrate
            logger.warning("Skipping unreadable session {} during migration", key)
            continue
        if not data:
            continue
        messages = data.get("messages", [])
        if not isinstance(messages, list) or not messages:
            continue
        try:
            now = datetime.now()
            append_history(sessions_dir, key, now, messages)
            migrated += 1
        except Exception as e:  # noqa: BLE001
            logger.warning("Failed to migrate messages for session {}: {}", key, e)
    return migrated


def _first_history_path(sessions_dir: Path, key: str) -> Path | None:
    """Return an existing history file for ``key`` across date buckets, if any."""
    from urllib.parse import quote

    safe = quote(key, safe="")
    if not sessions_dir.exists():
        return None
    for year in sessions_dir.iterdir():
        if not year.is_dir() or not year.name.isdigit():
            continue
        for month in year.iterdir():
            if not month.is_dir():
                continue
            for day in month.iterdir():
                p = day / f"{safe}.jsonl"
                if p.exists():
                    return p
    return None
