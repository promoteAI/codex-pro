"""Runtime worker profile store — JSON-backed, user-editable.

Worker profiles (sub-agent templates usable by ``delegate_task``) have two
sources:

1. **Config profiles** — the ``multi_agent.worker_profiles`` block in the YAML
   config (or the packaged ``default.yaml``). These are the bootstrap templates
   baked in at startup.
2. **Runtime profiles** — user-created records managed from the dashboard's
   "Add agent" menu. These live in a JSON file under the workspace runtime dir,
   just like user hooks (``.codex-pro/hooks.json``).

This module is the persistence half of the runtime source. The ``WorkerRegistry``
merges both sources on every delegation (see ``registry.reload``), so a profile
created here becomes visible to ``delegate_task`` without a restart. The store
only persists and serves records — it does not execute anything.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from codex_pro.agent.multi_agent.models import WorkerProfile

# Fields we accept for a worker profile. Subset of ``WorkerProfile`` fields;
# ``provider`` is accepted for completeness but is not consumed by the worker
# executor (only ``model``/``temperature``/``max_tokens``/``max_iterations``/
# ``instructions`` flow through ``WorkerExecutor.run``).
PROFILE_FIELDS = (
    "id",
    "name",
    "description",
    "instructions",
    "default_tools",
    "model",
    "provider",
    "max_iterations",
    "max_tokens",
    "temperature",
)


def profile_to_dict(profile: WorkerProfile) -> dict[str, Any]:
    """Convert a ``WorkerProfile`` into the store's JSON shape."""
    return {
        "id": profile.id,
        "name": profile.name,
        "description": profile.description,
        "instructions": profile.instructions,
        "default_tools": list(profile.default_tools),
        "model": profile.model,
        "provider": profile.provider,
        "max_iterations": profile.max_iterations,
        "max_tokens": profile.max_tokens,
        "temperature": profile.temperature,
    }


def profile_from_dict(record: dict[str, Any]) -> WorkerProfile:
    """Build a ``WorkerProfile`` from a store record (missing fields defaulted).

    Mirrors ``WorkerRegistry.from_config``'s mapping so config and runtime
    records normalise to the same model.
    """
    return WorkerProfile(
        id=str(record.get("id", "")),
        name=str(record.get("name", "") or record.get("id", "")),
        description=str(record.get("description", "")),
        instructions=str(record.get("instructions", "")),
        default_tools=tuple(record.get("default_tools") or ()),
        model=str(record.get("model", "")),
        provider=str(record.get("provider", "")),
        max_iterations=int(record.get("max_iterations", 12)),
        max_tokens=int(record.get("max_tokens", 8192)),
        temperature=float(record.get("temperature", 0.4)),
    )


class WorkerProfileStore:
    """JSON-backed store for runtime worker profiles.

    Lays the records in ``<workspace>/.codex-pro/worker_profiles.json`` — the
    same workspace runtime dir the gateway uses for hooks and its endpoint file.
    Writes are atomic (temp file + ``os.replace``).
    """

    def __init__(self, workspace: Path):
        self._path = Path(workspace) / ".codex-pro" / "worker_profiles.json"

    def _load(self) -> list[dict[str, Any]]:
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return []
        except (OSError, ValueError):
            # Corrupt file should not take the API down; treat as empty.
            return []
        if not isinstance(data, list):
            return []
        return [d for d in data if isinstance(d, dict)]

    def _save(self, records: list[dict[str, Any]]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(".json.tmp")
        tmp.write_text(
            json.dumps(records, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(tmp, self._path)

    def list_records(self) -> list[dict[str, Any]]:
        return self._load()

    def get_record(self, profile_id: str) -> dict[str, Any] | None:
        for r in self._load():
            if r.get("id") == profile_id:
                return r
        return None

    def create(self, record: dict[str, Any]) -> dict[str, Any]:
        records = self._load()
        records.append(record)
        self._save(records)
        return record

    def upsert(self, profile_id: str, record: dict[str, Any]) -> dict[str, Any] | None:
        """Insert or replace the record with ``profile_id``. Returns the record."""
        records = self._load()
        for i, r in enumerate(records):
            if r.get("id") == profile_id:
                records[i] = {**r, **record}
                self._save(records)
                return records[i]
        records.append(record)
        self._save(records)
        return record

    def delete(self, profile_id: str) -> bool:
        records = self._load()
        new_records = [r for r in records if r.get("id") != profile_id]
        if len(new_records) == len(records):
            return False
        self._save(new_records)
        return True

    def list_profiles(self) -> list[WorkerProfile]:
        """Return all runtime profiles as models."""
        return [profile_from_dict(r) for r in self._load()]
