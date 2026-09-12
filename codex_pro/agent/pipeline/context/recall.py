"""Recall-side helpers for ContextStage (dedup against frozen snapshots)."""

from __future__ import annotations


def filter_recall_by_snapshot(scored, snapshot_ids):
    """Drop scored memory entries whose id already entered the frozen snapshot.

    Defensive: entries without an id, or a falsy snapshot_ids, are kept as-is.
    """
    if not snapshot_ids:
        return scored
    return [
        (r, s) for (r, s) in scored
        if getattr(r, "id", None) not in snapshot_ids
    ]
