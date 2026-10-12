"""LocalExecutor / SandboxExecutor 执行主流程测试。

直接驱动执行器跑真实子进程，覆盖成功/失败/超时/网络策略/凭证注入，
以及 sandbox 的隔离目录复制与路径解析。类 Unix 环境下运行。"""
from __future__ import annotations

import asyncio
import os
import signal
import sys
from pathlib import Path

import pytest

from codex_pro.agent.executors.base import (
    BaseExecutor,
    ExecRequest,
    ExecResponse,
    LocalExecutor,
    SandboxExecutor,
)

pytestmark = pytest.mark.skipif(
    sys.platform == "win32", reason="shell 子进程语义按类 Unix 假设编写"
)


async def _assert_pid_gone(pid: int) -> None:
    for _ in range(50):
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return
        await asyncio.sleep(0.05)
    pytest.fail(f"background process {pid} survived executor completion")


# ---------------------------------------------------------------------------
# BaseExecutor.inject_credentials
# ---------------------------------------------------------------------------

def test_inject_credentials_merges_without_mutating_source():
    class _Dummy(BaseExecutor):
        async def execute(self, request):  # pragma: no cover - 抽象占位
            ...

        async def setup(self):  # pragma: no cover
            ...

        async def teardown(self):  # pragma: no cover
            ...

    base_env = {"A": "1"}
    merged = _Dummy().inject_credentials(base_env, {"SECRET": "xyz", "A": "override"})
    assert merged == {"A": "override", "SECRET": "xyz"}
    # 源 env 不被就地修改
    assert base_env == {"A": "1"}


# ---------------------------------------------------------------------------
# LocalExecutor
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_local_executor_runs_command_and_captures_stdout(tmp_path: Path):
    ex = LocalExecutor(workspace=str(tmp_path))
    await ex.setup()
    resp = await ex.execute(ExecRequest(command="codex hello-codex"))
    assert isinstance(resp, ExecResponse)
    assert resp.success is True
    assert resp.return_code == 0
    assert "hello-codex" in resp.stdout
    assert resp.executor == "local"
    assert resp.duration_ms >= 0
    await ex.teardown()


@pytest.mark.asyncio
async def test_local_executor_nonzero_exit_marks_failure(tmp_path: Path):
    ex = LocalExecutor(workspace=str(tmp_path))
    await ex.setup()
    resp = await ex.execute(ExecRequest(command="exit 3"))
    assert resp.success is False
    assert resp.return_code == 3
    await ex.teardown()


@pytest.mark.asyncio
async def test_local_executor_default_cwd_is_workspace(tmp_path: Path):
    ex = LocalExecutor(workspace=str(tmp_path))
    await ex.setup()
    resp = await ex.execute(ExecRequest(command="pwd"))
    assert str(tmp_path) in resp.stdout
    await ex.teardown()


@pytest.mark.asyncio
async def test_local_executor_reads_stdin(tmp_path: Path):
    ex = LocalExecutor(workspace=str(tmp_path))
    await ex.setup()
    resp = await ex.execute(ExecRequest(command="cat", stdin="piped-input"))
    assert "piped-input" in resp.stdout
    await ex.teardown()


@pytest.mark.asyncio
async def test_local_executor_injects_credentials_into_env(tmp_path: Path):
    ex = LocalExecutor(workspace=str(tmp_path))
    await ex.setup()
    resp = await ex.execute(
        ExecRequest(command="codex $MY_TOKEN", credentials={"MY_TOKEN": "s3cr3t"})
    )
    assert "s3cr3t" in resp.stdout
    await ex.teardown()


@pytest.mark.asyncio
async def test_local_executor_timeout_returns_error(tmp_path: Path):
    ex = LocalExecutor(workspace=str(tmp_path))
    await ex.setup()
    resp = await ex.execute(ExecRequest(command="sleep 5", timeout=1))
    assert resp.success is False
    assert resp.return_code == -1
    assert "Timeout" in resp.stderr
    await ex.teardown()


@pytest.mark.asyncio
async def test_local_executor_network_deny_blocks_networked_command(tmp_path: Path):
    ex = LocalExecutor(workspace=str(tmp_path), network_policy="deny")
    await ex.setup()
    resp = await ex.execute(ExecRequest(command="curl https://example.com"))
    assert resp.success is False
    assert "Network access is denied" in resp.stderr
    assert resp.return_code == -1
    await ex.teardown()


@pytest.mark.asyncio
async def test_local_executor_exec_failure_captured_as_stderr(tmp_path: Path, monkeypatch):
    ex = LocalExecutor(workspace=str(tmp_path))
    await ex.setup()

    async def _boom(*a, **k):
        raise OSError("spawn failed")

    monkeypatch.setattr("codex_pro.agent.executors.base.spawn_shell", _boom)
    resp = await ex.execute(ExecRequest(command="codex hi"))
    assert resp.success is False
    assert resp.return_code == -1
    assert "spawn failed" in resp.stderr
    await ex.teardown()


@pytest.mark.asyncio
@pytest.mark.parametrize("executor_kind", ["local", "sandbox"])
async def test_one_shot_executor_success_reaps_detached_background_work(
    tmp_path: Path, executor_kind: str,
):
    if executor_kind == "local":
        ex = LocalExecutor(workspace=str(tmp_path))
    else:
        ex = SandboxExecutor(sandbox_root=str(tmp_path / "sandbox-root"))
    child_pid = 0
    await ex.setup()
    try:
        response = await ex.execute(ExecRequest(
            command="sleep 90 >/dev/null 2>&1 & codex $!",
            timeout=5,
        ))
        assert response.success, response.stderr
        child_pid = int(response.stdout.strip())
        await _assert_pid_gone(child_pid)
    finally:
        await ex.teardown()
        if child_pid:
            try:
                os.kill(child_pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


# ---------------------------------------------------------------------------
# SandboxExecutor
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_sandbox_runs_in_real_workspace_with_git_available(tmp_path: Path):
    """Cleanup: the sandbox no longer copies the workspace to a temp dir.

    Commands run against the *real* project directory, so the source tree (and
    its ``.git``) must be visible as-is — not filtered out by copy ignore rules.
    """
    src = tmp_path / "src"
    (src / ".git").mkdir(parents=True)
    (src / ".git" / "config").write_text("should-stay")
    (src / "keep.txt").write_text("copied")

    ex = SandboxExecutor(sandbox_root=str(tmp_path / "sbroot"), workspace=str(src))
    await ex.setup()
    try:
        resp = await ex.execute(ExecRequest(command="ls -a"))
        assert "keep.txt" in resp.stdout
        assert ".git" in resp.stdout
        # cwd is the real project dir, not a temp mirror
        pwd = await ex.execute(ExecRequest(command="pwd"))
        assert str(src) in pwd.stdout
    finally:
        await ex.teardown()


@pytest.mark.asyncio
async def test_sandbox_execute_lazy_setup_when_not_initialized(tmp_path: Path):
    ex = SandboxExecutor(sandbox_root=str(tmp_path / "root"))
    # 未显式 setup，execute 应自行初始化（在这里 setup 是幂等的空操作）
    resp = await ex.execute(ExecRequest(command="codex lazy"))
    assert resp.success is True
    assert "lazy" in resp.stdout
    assert resp.executor == "sandbox"
    await ex.teardown()


@pytest.mark.asyncio
async def test_sandbox_network_deny_blocks(tmp_path: Path):
    ex = SandboxExecutor(sandbox_root=str(tmp_path / "root"), network_policy="deny")
    await ex.setup()
    resp = await ex.execute(ExecRequest(command="wget http://example.com"))
    assert resp.success is False
    assert "Network access is denied" in resp.stderr
    await ex.teardown()


@pytest.mark.asyncio
async def test_sandbox_teardown_leaves_real_workspace_intact(tmp_path: Path):
    """Cleanup: teardown no longer deletes anything — the real project dir is
    owned by the user, not the executor. It must survive a setup+teardown cycle."""
    src = tmp_path / "src"
    src.mkdir()
    (src / "keep.txt").write_text("precious")

    ex = SandboxExecutor(sandbox_root=str(tmp_path / "root"), workspace=str(src))
    await ex.setup()
    await ex.teardown()
    assert src.exists()
    assert (src / "keep.txt").read_text() == "precious"


@pytest.mark.asyncio
async def test_sandbox_timeout_returns_error(tmp_path: Path):
    ex = SandboxExecutor(sandbox_root=str(tmp_path / "root"))
    await ex.setup()
    resp = await ex.execute(ExecRequest(command="sleep 5", timeout=1))
    assert resp.success is False
    assert "Timeout" in resp.stderr
    await ex.teardown()


@pytest.mark.asyncio
async def test_sandbox_resolve_cwd_real_path_within_workspace(tmp_path: Path):
    """Cleanup: cwd resolves to the real directory under the workspace root."""
    src = tmp_path / "src"
    (src / "sub").mkdir(parents=True)
    ex = SandboxExecutor(sandbox_root=str(tmp_path / "root"), workspace=str(src))
    resolved = await ex._resolve_cwd(str(src / "sub"), str(src))
    assert resolved == (src / "sub").resolve()
    assert resolved.exists()


@pytest.mark.asyncio
async def test_sandbox_resolve_cwd_falls_back_to_workspace_for_outside_path(tmp_path: Path):
    src = tmp_path / "src"
    src.mkdir()
    ex = SandboxExecutor(sandbox_root=str(tmp_path / "root"), workspace=str(src))
    outside = str(tmp_path / "elsewhere")
    resolved = await ex._resolve_cwd(outside, str(src))
    # cwd escaped the workspace root -> fall back to the workspace root
    assert resolved == src.resolve()


@pytest.mark.asyncio
async def test_sandbox_resolve_cwd_no_requested_returns_workspace(tmp_path: Path):
    src = tmp_path / "src"
    src.mkdir()
    ex = SandboxExecutor(sandbox_root=str(tmp_path / "root"), workspace=str(src))
    resolved = await ex._resolve_cwd("", str(src))
    assert resolved == src.resolve()
