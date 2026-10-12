"""SandboxExecutor must run commands in the session workspace, not redirect them.

Regression: ShellTool resolves the per-turn workspace via ``session_workspace()``
and passes it as ``cwd``. The executor must run against the *real* session
workspace directory (so paths, produced files and ``.git`` stay consistent with
the host tree), never a copied temp mirror — and never the gateway's global
workspace either.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from codex_pro.agent.executors.base import ExecRequest, SandboxExecutor
from codex_pro.gateway.session_context import clear_session_vars, set_session_vars


@pytest.mark.asyncio
async def test_sandbox_runs_in_real_session_workspace() -> None:
    """Commands run in the real session workspace, with its files visible."""
    global_ws = Path(tempfile.mkdtemp(prefix="gws_"))
    sess_ws = Path(tempfile.mkdtemp(prefix="sws_"))  # outside the global workspace
    (sess_ws / "probe.txt").write_text("session marker", encoding="utf-8")

    ex = SandboxExecutor("/tmp/codex-pro-sandbox", network_policy="allow", workspace=str(global_ws))
    await ex.setup()
    try:
        tokens = set_session_vars(workspace=str(sess_ws))
        try:
            # The session workspace is the execution root. Read a file that only
            # exists there: if the executor redirected the cwd to its base
            # workspace, the file would be absent and the command would fail.
            resp = await ex.execute(ExecRequest(
                command="cat probe.txt", cwd=str(sess_ws), workspace=str(sess_ws), timeout=10,
            ))
            # The command must run against the real session dir, so a written
            # file lands back in the host workspace — not a temp mirror.
            write = await ex.execute(ExecRequest(
                command="echo written > produced.txt", cwd=str(sess_ws), workspace=str(sess_ws), timeout=10,
            ))
        finally:
            clear_session_vars(tokens)
        assert resp.return_code == 0, resp.stderr
        assert resp.stdout.strip() == "session marker", resp.stdout
        assert write.return_code == 0, write.stderr
        assert (sess_ws / "produced.txt").read_text().strip() == "written"
    finally:
        await ex.teardown()

