from datetime import datetime
from pathlib import Path

from codex_pro.storage.history import append_history, load_history, message_history_path


def test_message_history_path_buckets_by_date(tmp_path: Path) -> None:
    p = message_history_path(tmp_path, "cli:abc", datetime(2026, 1, 15))
    assert p.parent.name == "15"
    assert p.parent.parent.name == "01"
    assert p.parent.parent.parent.name == "2026"


def test_append_and_load_history_roundtrip(tmp_path: Path) -> None:
    d = datetime(2026, 1, 15, 10, 0)
    append_history(tmp_path, "cli:abc", d, [{"role": "user", "content": "hi"}])
    msgs = load_history(tmp_path, "cli:abc")
    assert len(msgs) == 1
    assert msgs[0]["content"] == "hi"


def test_load_history_aggregates_across_dates(tmp_path: Path) -> None:
    append_history(tmp_path, "cli:abc", datetime(2026, 1, 15, 10), [{"role": "user", "content": "a"}])
    append_history(tmp_path, "cli:abc", datetime(2026, 1, 16, 10), [{"role": "assistant", "content": "b"}])
    msgs = load_history(tmp_path, "cli:abc")
    assert [m["content"] for m in msgs] == ["a", "b"]
