"""Append-only JSONL message history, bucketed by date (rollout model).

This is the Phase 4 "history layer": messages are appended to per-session
JSONL files under ``YYYY/MM/DD/<key>.jsonl`` (like Codex's rollout files) rather
than being rewritten as one blob. The SQLite backend keeps only queryable
metadata; the message stream lives here.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from urllib.parse import quote


def message_history_path(sessions_dir: Path, key: str, dt: datetime) -> Path:
    """Return the bucketed ``YYYY/MM/DD/<key>.jsonl`` path for a session/message."""
    safe = quote(key, safe="")
    return (
        sessions_dir
        / str(dt.year)
        / f"{dt.month:02d}"
        / f"{dt.day:02d}"
        / f"{safe}.jsonl"
    )


def append_history(sessions_dir: Path, key: str, dt: datetime, messages: list[dict]) -> None:
    """Append ``messages`` to the session's dated history file (create if absent)."""
    path = message_history_path(sessions_dir, key, dt)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        for m in messages:
            f.write(json.dumps(m, ensure_ascii=False) + "\n")


def load_history(sessions_dir: Path, key: str) -> list[dict]:
    """Load all messages for a session, aggregated across dated buckets.

    Scans ``sessions_dir/YYYY/MM/DD/<key>.jsonl`` only — the caller passes the
    sessions directory, so system-state dirs (data/, cache/, etc.) are never
    scanned.
    """
    safe = quote(key, safe="")
    rows: list[dict] = []
    if not sessions_dir.exists():
        return rows
    for year in sorted(sessions_dir.iterdir()):
        if not year.is_dir():
            continue
        for month in sorted(year.iterdir()):
            if not month.is_dir():
                continue
            for day in sorted(month.iterdir()):
                if not day.is_dir():
                    continue
                path = day / f"{safe}.jsonl"
                if path.exists():
                    with open(path, encoding="utf-8") as fh:
                        for line in fh:
                            line = line.strip()
                            if line:
                                rows.append(json.loads(line))
    return rows
