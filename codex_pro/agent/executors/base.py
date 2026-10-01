"""Execution environments — isolated runtimes for agent task execution.

Supports local, sandbox, container, and remote execution with
command isolation, filesystem boundaries, network control, credential injection, and audit.
"""

from __future__ import annotations

import asyncio
import hashlib
import os
import shutil
import sys
import tempfile
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from loguru import logger

from codex_pro.agent.proc_lifecycle import (
    communicate_owned,
    spawn_shell,
)
from codex_pro.security.guards import command_uses_network


def prepend_interpreter_bin(env: dict[str, str]) -> dict[str, str]:
    """Put the directory of ``sys.executable`` ahead on PATH.

    A skill script written as ``python3 scripts/foo.py`` inherits the shell's
    PATH, not ours. When the service is started by launchd or systemd, that
    PATH usually does NOT contain the venv ``bin`` the
    script's deps were installed into — and ``python3`` resolves to the
    system interpreter, which has none of them. The skill crashes on the
    first import.

    Putting ``sys.executable``'s directory ahead makes ``python3`` resolve to
    the *same* interpreter the agent itself runs under, and therefore to the
    same venv. We never replace PATH outright — any project-specific dirs the
    operator arranged survive, just with the venv bin in front so it wins the
    first match.
    """
    exe_dir = os.path.dirname(sys.executable) if sys.executable else ""
    if not exe_dir:
        return env
    existing = env.get("PATH", "/usr/bin:/bin")
    parts = [p for p in existing.split(os.pathsep) if p]
    # Rebuild rather than "prepend only when absent". Testing for absence left
    # the goal unmet whenever the directory was already on PATH but *behind* a
    # system Python or a wrapper: `python3` then resolved to the wrong
    # interpreter, which is the exact failure this function exists to prevent.
    # Moving it to the front is idempotent and keeps every other entry's order.
    parts = [p for p in parts if p != exe_dir]
    env["PATH"] = os.pathsep.join([exe_dir, *parts])
    return env


@dataclass
class ExecRequest:
    command: str
    cwd: str = ""
    env: dict[str, str] = field(default_factory=dict)
    timeout: int = 30
    stdin: str = ""
    credentials: dict[str, str] = field(default_factory=dict)
    # The execution root for this call — the session workspace (from
    # ``session_workspace()``). ``cwd`` may be this root or a subpath of it.
    # ``SandboxExecutor`` uses it to map a workspace that lives *outside* the
    # gateway's global workspace into the sandbox; ``LocalExecutor`` ignores it
    # (it already runs at ``cwd``). Defaults to empty so existing callers keep
    # working unchanged.
    workspace: str = ""


@dataclass
class ExecResponse:
    success: bool = True
    stdout: str = ""
    stderr: str = ""
    return_code: int = 0
    duration_ms: int = 0
    executor: str = ""
    audit_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])


class BaseExecutor(ABC):
    """Abstract execution environment."""

    name: str = "base"

    @abstractmethod
    async def execute(self, request: ExecRequest) -> ExecResponse:
        """Execute a command in this environment."""

    @abstractmethod
    async def setup(self) -> None:
        """Initialize the execution environment."""

    @abstractmethod
    async def teardown(self) -> None:
        """Clean up the execution environment."""

    def inject_credentials(self, env: dict[str, str], credentials: dict[str, str]) -> dict[str, str]:
        merged = dict(env)
        for key, value in credentials.items():
            merged[key] = value
        return merged


class LocalExecutor(BaseExecutor):
    """Execute commands directly on the host."""

    name = "local"

    def __init__(self, workspace: str, network_policy: str = "allow"):
        self._workspace = workspace
        self._network_policy = network_policy

    async def setup(self) -> None:
        Path(self._workspace).mkdir(parents=True, exist_ok=True)

    async def teardown(self) -> None:
        pass

    async def execute(self, request: ExecRequest) -> ExecResponse:
        if self._network_policy == "deny" and command_uses_network(request.command):
            return ExecResponse(success=False, stderr="Network access is denied by execution policy", return_code=-1, executor=self.name)
        cwd = request.cwd or self._workspace
        env = prepend_interpreter_bin(dict(os.environ))
        env = self.inject_credentials(env, request.credentials)
        env.update(request.env)
        start = datetime.now()

        try:
            proc = await spawn_shell(
                request.command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                stdin=asyncio.subprocess.PIPE if request.stdin else None,
                cwd=cwd,
                env=env,
            )
            stdout, stderr = await communicate_owned(
                proc,
                request.stdin.encode() if request.stdin else None,
                timeout=request.timeout,
            )
            duration = int((datetime.now() - start).total_seconds() * 1000)
            return ExecResponse(
                success=proc.returncode == 0,
                stdout=stdout.decode(errors="replace"),
                stderr=stderr.decode(errors="replace"),
                return_code=proc.returncode or 0,
                duration_ms=duration,
                executor=self.name,
            )
        except asyncio.CancelledError:
            raise
        except asyncio.TimeoutError:
            return ExecResponse(success=False, stderr=f"Timeout after {request.timeout}s", return_code=-1, executor=self.name)
        except Exception as e:
            return ExecResponse(success=False, stderr=str(e), return_code=-1, executor=self.name)


class SandboxExecutor(BaseExecutor):
    """Execute commands in an isolated temp directory with restricted filesystem access."""

    name = "sandbox"

    def __init__(
        self,
        sandbox_root: str = "/tmp/codex-pro-sandbox",
        network_policy: str = "deny",
        workspace: str = "",
    ):
        self._root = Path(sandbox_root)
        self._network_policy = network_policy
        self._source_workspace = Path(workspace).resolve() if workspace else None
        self._sandbox_dir: Path | None = None
        self._workdir: Path | None = None
        # Extra workspace roots (session workspaces) that live outside the global
        # workspace. Each is copied into the sandbox once, and its sandbox mirror
        # is tracked so ``_resolve_cwd`` can map a request's cwd into it. Keyed by
        # resolved source path so a repeated request on the same session reuses
        # the mirror instead of re-copying.
        self._extra_roots: dict[Path, Path] = {}

    def _ignore_patterns(self) -> tuple[str, ...]:
        return (
            ".git",
            "__pycache__",
            ".pytest_cache",
            ".ruff_cache",
            ".venv",
            "node_modules",
            "data/logs",
            # Bundled runtime dirs are hundreds of MB and never needed inside
            # the sandbox; copying them synchronously froze the event loop.
            "runtime",
            "python",
        )

    async def _copy_into_sandbox(self, source: Path, target: Path) -> None:
        """Copy ``source`` tree into ``target`` off-loop, mirroring setup()."""
        ignore = shutil.ignore_patterns(*self._ignore_patterns())
        if source.exists():
            await asyncio.to_thread(
                shutil.copytree,
                source,
                target,
                dirs_exist_ok=True,
                ignore=ignore,
            )
        else:
            target.mkdir(parents=True, exist_ok=True)

    async def _ensure_extra_root(self, source: Path) -> Path:
        """Return the sandbox mirror for ``source``, copying it in on first use.

        The mirror lives under ``<sandbox>/workspace/workspaces/<hash>/`` so
        distinct workspaces (per-session, per-project, or the global fallback)
        stay isolated within the sandbox, and nothing is copied eagerly at setup.
        """
        source = source.resolve()
        existing = self._extra_roots.get(source)
        if existing is not None:
            return existing
        digest = hashlib.sha256(str(source).encode("utf-8")).hexdigest()[:16]
        mirror = self._workdir / "workspaces" / digest if self._workdir else self._sandbox_dir / "workspaces" / digest
        await self._copy_into_sandbox(source, mirror)
        self._extra_roots[source] = mirror
        return mirror

    async def setup(self) -> None:
        self._root.mkdir(parents=True, exist_ok=True)
        self._sandbox_dir = Path(tempfile.mkdtemp(dir=self._root, prefix="sandbox_"))
        self._workdir = self._sandbox_dir / "workspace"
        # 不再把全局工作区复制进沙箱作为基础执行根。沙箱以「本次执行的会话工作区」
        # 为根(见 _resolve_cwd / _ensure_extra_root)：首次用到某工作区时才把它拷贝进
        # ``workspaces/<hash>`` 镜像。这样沙箱里不会出现全局工作区（及其中被主进程
        # 锁定的 agent.lock 等状态文件），也不会把无关的全局目录带进来。
        self._workdir.mkdir(parents=True, exist_ok=True)
        logger.info("Sandbox created at {}", self._sandbox_dir)

    async def teardown(self) -> None:
        if self._sandbox_dir and self._sandbox_dir.exists():
            await asyncio.to_thread(shutil.rmtree, self._sandbox_dir, ignore_errors=True)

    async def execute(self, request: ExecRequest) -> ExecResponse:
        if not self._sandbox_dir:
            await self.setup()
        if self._network_policy == "deny" and command_uses_network(request.command):
            return ExecResponse(success=False, stderr="Network access is denied by execution policy", return_code=-1, executor=self.name)
        cwd = str(await self._resolve_cwd(request.cwd, request.workspace))
        env = self.inject_credentials({"HOME": cwd, "TMPDIR": cwd}, request.credentials)
        env.update(request.env)
        env["PATH"] = prepend_interpreter_bin(dict(os.environ))["PATH"]

        start = datetime.now()
        try:
            proc = await spawn_shell(
                request.command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                stdin=asyncio.subprocess.PIPE if request.stdin else None,
                cwd=cwd,
                env=env,
            )
            stdout, stderr = await communicate_owned(
                proc,
                request.stdin.encode() if request.stdin else None,
                timeout=request.timeout,
            )
            duration = int((datetime.now() - start).total_seconds() * 1000)
            return ExecResponse(
                success=proc.returncode == 0,
                stdout=stdout.decode(errors="replace"),
                stderr=stderr.decode(errors="replace"),
                return_code=proc.returncode or 0,
                duration_ms=duration,
                executor=self.name,
            )
        except asyncio.CancelledError:
            raise
        except asyncio.TimeoutError:
            return ExecResponse(success=False, stderr=f"Timeout after {request.timeout}s", return_code=-1, executor=self.name)
        except Exception as e:
            return ExecResponse(success=False, stderr=str(e), return_code=-1, executor=self.name)

    async def _resolve_cwd(self, requested_cwd: str, workspace: str = "") -> Path:
        if not self._workdir:
            assert self._sandbox_dir
            return self._sandbox_dir
        if not requested_cwd:
            return self._workdir

        resolve = Path(requested_cwd).expanduser().resolve()

        # The execution root is the *session workspace* (a per-session isolation
        # dir or a project dir), never the gateway's global workspace. Take that
        # workspace's sandbox mirror as the mapping base and translate the
        # requested cwd relative to it. The global workspace is no longer copied
        # into the sandbox at setup, so an out-of-root cwd falls back only when
        # it genuinely has no workspace mapping.
        if workspace:
            ws_root = Path(workspace).expanduser().resolve()
            mirror = await self._ensure_extra_root(ws_root)
            try:
                rel = resolve.relative_to(ws_root)
                target = (mirror / rel).resolve()
                target.relative_to(self._workdir)
                target.mkdir(parents=True, exist_ok=True)
                return target
            except ValueError:
                pass  # cwd outside the workspace root; fall through

        # No workspace override, or cwd escaped it: fall back to the global
        # workspace, lazily copied into its own mirror so the sandbox never
        # carries the global tree unless a command actually needs it.
        if not self._source_workspace:
            return self._workdir
        mirror = await self._ensure_extra_root(self._source_workspace)
        try:
            rel = resolve.relative_to(self._source_workspace)
            target = (mirror / rel).resolve()
            target.relative_to(self._workdir)
            target.mkdir(parents=True, exist_ok=True)
            return target
        except ValueError:
            return self._workdir
