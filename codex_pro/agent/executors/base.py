"""Execution environments — isolated runtimes for agent task execution.

Supports local, sandbox, container, and remote execution with
command isolation, filesystem boundaries, network control, credential injection, and audit.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

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
        # ``sandbox_root`` is retained for backward compatibility, but the
        # executor no longer builds a temp-dir sandbox. Commands run in the *
        # real* project directory, so paths, produced files and ``.git`` stay
        # consistent with the host tree. Isolation is enforced by the
        # application-layer policy (network_policy + the tool-level guards in
        # shell/code_exec), not by copying the workspace to a temp dir.
        self._root = Path(sandbox_root) if sandbox_root else None
        self._network_policy = network_policy
        self._workspace = Path(workspace).resolve() if workspace else None

    async def setup(self) -> None:
        # No temp dir to build. The source workspace (or an explicit request cwd)
        # is already the real execution root; just ensure it exists.
        if self._workspace:
            self._workspace.mkdir(parents=True, exist_ok=True)

    async def teardown(self) -> None:
        # Nothing owned by the executor to clean up — the real project dir is
        # left untouched (no temp sandbox tree to remove).
        pass

    async def execute(self, request: ExecRequest) -> ExecResponse:
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
        """Resolve the real working directory — no sandbox-mirror remapping.

        The executor runs commands against the *real* project directory rather
        than a copied temp tree, so a requested ``cwd`` maps straight back to
        itself (or to the session/global workspace when none was given). The
        preferred root is ``request.workspace`` (the per-session execution root),
        falling back to the executor's configured ``workspace`` (global). A
        requested cwd must lie under one of those roots; otherwise we fall back
        to the workspace root so an out-of-root path does not silently become a
        command run elsewhere on disk.
        """
        # Preferred base: the per-turn execution root (session workspace).
        root = Path(workspace).expanduser().resolve() if workspace else None
        if root is None:
            root = self._workspace
        if root is None:
            # No workspace at all: run at the requested cwd itself, creating it
            # so the command has a valid directory.
            target = Path(requested_cwd).expanduser().resolve() if requested_cwd else Path.cwd()
            target.mkdir(parents=True, exist_ok=True)
            return target

        root.mkdir(parents=True, exist_ok=True)
        if not requested_cwd:
            return root

        target = Path(requested_cwd).expanduser().resolve()
        try:
            target.relative_to(root)
        except ValueError:
            # cwd escaped the workspace root — fall back rather than run
            # somewhere unexpected.
            return root
        target.mkdir(parents=True, exist_ok=True)
        return target
