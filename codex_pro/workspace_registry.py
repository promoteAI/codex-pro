"""Registry of live workspace instances within one gateway process."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class WorkspaceEntry:
    workspace_key: str
    workspace_path: str
    config: Any = None
    storage: Any = None
    agent: Any = None
    metadata: dict[str, Any] = field(default_factory=dict)


class WorkspaceRegistry:
    """Hold one WorkspaceEntry per active workspace.

    A gateway process may serve multiple worktrees/workspaces. Each entry owns
    its own storage backend, agent loop, and projects container. The registry is
    the composition root's index: ``get(key)`` routes a request to the right
    instance, ``list()`` enumerates them for the frontend.
    """

    def __init__(self) -> None:
        self._entries: dict[str, WorkspaceEntry] = {}

    def register(
        self,
        key: str,
        workspace_path: str,
        *,
        config: Any = None,
        storage: Any = None,
        agent: Any = None,
        metadata: dict[str, Any] | None = None,
    ) -> WorkspaceEntry:
        entry = WorkspaceEntry(
            workspace_key=key,
            workspace_path=workspace_path,
            config=config,
            storage=storage,
            agent=agent,
            metadata=metadata or {},
        )
        self._entries[key] = entry
        return entry

    def get(self, key: str) -> WorkspaceEntry | None:
        return self._entries.get(key)

    def list(self) -> list[WorkspaceEntry]:
        return list(self._entries.values())

    async def close_all(self) -> None:
        for entry in self._entries.values():
            if entry.storage is not None and hasattr(entry.storage, "close"):
                await entry.storage.close()
        self._entries.clear()
