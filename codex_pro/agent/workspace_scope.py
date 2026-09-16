"""Per-message workspace scope — resolves and validates a project directory.

Each inbound message may carry a project directory (``event.metadata["workspace"]``).
A project can be any existing local directory, even outside the gateway's global
workspace. This module validates that a claimed project path is a usable working
root so the tools can safely run against it, and provides the helper tools use
to read the current per-task workspace at execution time.
"""

from __future__ import annotations

from pathlib import Path

from codex_pro.gateway.session_context import get_session_var
from codex_pro.security.path_policy import check_cwd


def validate_project_workspace(project_path: str, global_workspace: str) -> str:
    """Resolve and validate a claimed project directory.

    Returns the resolved absolute path string on success.

    A project may live outside ``global_workspace`` — that is intentional. The
    check guarantees only that the path is a real, existing directory and is not
    a system pseudo-filesystem (``/proc``, ``/sys``). ``global_workspace`` is
    accepted for logging/context but not used to constrain the path, so callers
    that reject a malformed claim can fall back to the global workspace.
    """
    if not project_path or not project_path.strip():
        raise ValueError("empty project workspace path")
    try:
        resolved = Path(project_path).expanduser().resolve()
    except (OSError, ValueError) as e:
        raise ValueError(f"invalid project workspace path: {project_path!r}") from e
    violation = check_cwd(str(resolved))
    if violation:
        raise ValueError(violation)
    if not resolved.is_dir():
        raise ValueError(f"project workspace is not a directory: {resolved}")
    return str(resolved)


def session_workspace(global_workspace: str) -> str:
    """Return the per-task workspace override, or the global workspace fallback.

    Tools call this at execution time instead of reading ``self._workspace``
    directly, so an incoming message that named a project switches the tool's
    working root for that turn only. An empty (unset) override means the caller
    is not in a per-message project scope and should use the global default.
    """
    return get_session_var("workspace") or global_workspace
