"""Tool execution honours the per-message workspace override.

A message may carry a project directory (set via ``set_session_vars(workspace=...)``
in the agent's inbound handler). Tools that resolve paths / set cwd against a
workspace must use that override instead of the global ``self._workspace`` for
the duration of the turn, and fall back to the global workspace when it is unset.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from codex_pro.agent.tools.filesystem import ReadFileTool, WriteFileTool
from codex_pro.agent.tools.shell import ShellTool
from codex_pro.gateway.session_context import clear_session_vars, set_session_vars


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


@pytest.mark.asyncio
async def test_read_file_resolves_relative_path_against_session_workspace():
    with tempfile.TemporaryDirectory() as global_ws, tempfile.TemporaryDirectory() as proj_ws:
        _write(Path(global_ws) / "g.txt", "global")
        _write(Path(proj_ws) / "p.txt", "project")

        tool = ReadFileTool(workspace=global_ws)
        # No override -> global workspace
        res = await tool.execute({"path": "g.txt"})
        assert res.success and res.output == "1\tglobal"

        # With per-message workspace override -> project directory
        tokens = set_session_vars(workspace=proj_ws)
        try:
            res = await tool.execute({"path": "p.txt"})
            assert res.success and res.output == "1\tproject"
            # Global file is no longer at the resolved root
            res = await tool.execute({"path": "g.txt"})
            assert not res.success
        finally:
            clear_session_vars(tokens)


@pytest.mark.asyncio
async def test_write_file_writes_into_session_workspace():
    with tempfile.TemporaryDirectory() as global_ws, tempfile.TemporaryDirectory() as proj_ws:
        tool = WriteFileTool(workspace=global_ws)
        tokens = set_session_vars(workspace=proj_ws)
        try:
            res = await tool.execute({"path": "out.txt", "content": "hi"})
            assert res.success
            assert (Path(proj_ws) / "out.txt").read_text() == "hi"
            assert not (Path(global_ws) / "out.txt").exists()
        finally:
            clear_session_vars(tokens)


@pytest.mark.asyncio
async def test_shell_default_cwd_and_workspace_env_use_session_workspace():
    """With no explicit cwd param, the exec tool's default cwd and WORKSPACE env
    point at the session workspace, not the global one."""
    captured: dict[str, object] = {}

    class _FakeExecutor:
        async def execute(self, request):
            captured["cwd"] = request.cwd
            captured["env"] = request.env
            from codex_pro.agent.executors.base import ExecResponse
            return ExecResponse(success=True, stdout="", stderr="", return_code=0, executor="fake")

    with tempfile.TemporaryDirectory() as global_ws, tempfile.TemporaryDirectory() as proj_ws:
        tool = ShellTool(workspace=global_ws, executor=_FakeExecutor())
        tokens = set_session_vars(workspace=proj_ws)
        try:
            res = await tool.execute({"command": "echo hi"})
            assert res.success
            assert captured["cwd"] == str(Path(proj_ws).resolve())
            assert captured["env"]["WORKSPACE"] == str(Path(proj_ws).resolve())
        finally:
            clear_session_vars(tokens)


@pytest.mark.asyncio
async def test_tools_fall_back_to_global_workspace_when_override_unset():
    with tempfile.TemporaryDirectory() as global_ws, tempfile.TemporaryDirectory() as proj_ws:
        _write(Path(global_ws) / "x.txt", "global")
        _write(Path(proj_ws) / "x.txt", "project")
        tool = ReadFileTool(workspace=global_ws)
        # No override -> global wins even though a project dir exists elsewhere.
        res = await tool.execute({"path": "x.txt"})
        assert res.success and res.output == "1\tglobal"
