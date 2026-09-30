"""Workspace identity and workspaceKey derivation (ZCode dual-key model)."""
from __future__ import annotations


def normalize_workspace_identity(identity: str | None) -> str:
    """Trim a workspace identity; empty/None collapse to ``""``."""
    if not identity:
        return ""
    return identity.strip()


def derive_workspace_key(workspace_path: str, workspace_identity: str | None = None) -> str:
    """Return the workspaceKey: ``identity?.trim() || path``.

    identity is the stable isolation key (e.g. ``remote:ssh:host:port:user:path``)
    used to separate two sessions that happen to share a path across hosts. When
    identity is empty (local), the path alone is the key.
    """
    identity = normalize_workspace_identity(workspace_identity)
    return identity if identity else workspace_path
