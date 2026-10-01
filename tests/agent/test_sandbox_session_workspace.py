"""SandboxExecutor must run commands in the session workspace, not redirect them.

Regression: ShellTool resolves the per-turn workspace via ``session_workspace()``
and passes it as ``cwd``. But ``SandboxExecutor._resolve_cwd`` only remapped paths
that lie *under* the gateway's global workspace (its ``_source_workspace``). A
session workspace that lives outside the global workspace (a no-project
isolation dir, or any project dir outside the global root) was rejected by
``relative_to`` and silently redirected to the sandbox's base ``workspace`` dir —
so multi-turn commands ran in the sandbox, not the session workspace.

The fix: pass the session workspace through ``ExecRequest.workspace`` and give
``SandboxExecutor`` a workspace mirror mapping that copies the *execution root*
(session workspace) into the sandbox and translates the requested ``cwd`` against
that mirror. The gateway's global workspace is no longer pre-copied into the
sandbox at setup, so the sandbox never carries the global tree (or its state
files such as ``agent.lock``) unless a command actually works there.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from codex_pro.agent.executors.base import ExecRequest, SandboxExecutor
from codex_pro.gateway.session_context import clear_session_vars, set_session_vars


@pytest.mark.asyncio
async def test_sandbox_setup_does_not_precopy_global_workspace() -> None:
    """The sandbox must not eagerly copy the global workspace into its base dir.

    Previously ``setup()`` copied ``_source_workspace`` (the gateway's global
    workspace) into ``_workdir`` — pulling in state files like ``agent.lock``
    that the live gateway holds, and exposing the entire global tree inside the
    sandbox. Now only a workspace the command actually runs against is copied
    (lazily, into ``workspaces/<hash>``).
    """
    global_ws = Path(tempfile.mkdtemp(prefix="gws_"))
    (global_ws / "global_marker.txt").write_text("global", encoding="utf-8")
    (global_ws / "data").mkdir()
    (global_ws / "data" / "agent.lock").write_text("locked", encoding="utf-8")

    ex = SandboxExecutor("/tmp/codex-pro-sandbox", network_policy="allow", workspace=str(global_ws))
    await ex.setup()
    try:
        assert ex._workdir is not None
        # The base workspace starts empty: no global files, no agent.lock.
        assert (ex._workdir / "global_marker.txt").exists() is False
        assert (ex._workdir / "data" / "agent.lock").exists() is False
    finally:
        await ex.teardown()


@pytest.mark.asyncio
async def test_sandbox_runs_in_session_workspace_mirror() -> None:
    """Commands run in the session-workspace mirror, with its files visible."""
    global_ws = Path(tempfile.mkdtemp(prefix="gws_"))
    sess_ws = Path(tempfile.mkdtemp(prefix="sws_"))  # outside the global workspace
    (sess_ws / "probe.txt").write_text("session marker", encoding="utf-8")

    ex = SandboxExecutor("/tmp/codex-pro-sandbox", network_policy="allow", workspace=str(global_ws))
    await ex.setup()
    try:
        tokens = set_session_vars(workspace=str(sess_ws))
        try:
            # ShellTool passes the session workspace as both the requested cwd
            # and the ExecRequest.workspace execution root. Read a file that only
            # exists in the session workspace: if the sandbox redirected the cwd
            # to its base workspace, the file would be absent and the command
            # would fail with "no such file".
            resp = await ex.execute(ExecRequest(
                command="cat probe.txt", cwd=str(sess_ws), workspace=str(sess_ws), timeout=10,
            ))
        finally:
            clear_session_vars(tokens)
        assert resp.return_code == 0, resp.stderr
        assert resp.stdout.strip() == "session marker", resp.stdout
    finally:
        await ex.teardown()
