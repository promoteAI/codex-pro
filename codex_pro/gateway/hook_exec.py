"""Runtime execution seam for user-configured lifecycle hooks.

The dashboard-facing ``HookStore`` (``codex_pro/gateway/api/hooks.py``) only
stores and serves hook *configurations* — it never runs them. This module is the
runtime that turns a stored ``SessionStart`` hook into an action when a new
session is first created (see ``GatewayServer._reset_session_if_needed``).

Two run modes are honored, mirroring ``RUN_MODES`` in the API module:

- ``process``: spawn ``command`` as a shell subprocess asynchronously, with a
  hard timeout. Failures are logged and never block or fail the session's
  main flow. This is fire-and-forget: the caller schedules the task, does not
  await it, and the session proceeds regardless of the hook's outcome.
- ``prompt``: record ``command`` text on the session as a session-start prompt
  (``session.metadata["session_start_prompt"]``). The agent's ``ContextStage``
  folds it into the system prompt of the session's turns, so it genuinely enters
  the model's context rather than merely being persisted.

Limitations worth stating plainly:

- ``process`` hooks run on whatever machine the gateway runs on, with the
  gateway's own identity, and depend on the platform shell. They are admin-grade
  configuration (matching the admin-tier guard on hook mutations) and are not
  sandboxed here.
- ``prompt`` injection is a session-scoped system-prompt preamble. It applies to
  every turn of the session, not only the very first, and is only read by the
  in-process agent's ``ContextStage``. A gateway deployment that dispatches the
  agent loop out-of-process must propagate ``session_start_prompt`` itself.
"""

from __future__ import annotations

import asyncio
import sys
from typing import TYPE_CHECKING, Any

from loguru import logger

if TYPE_CHECKING:
    from codex_pro.session.manager import Session

#: How long a session-start ``process`` hook may run before it is killed.
_PROCESS_HOOK_TIMEOUT_SECONDS = 10.0

#: Session metadata key holding the accumulated session-start prompt text.
SESSION_START_PROMPT_KEY = "session_start_prompt"


def collect_session_start_hooks(store: Any) -> list[dict[str, Any]]:
    """Return enabled ``SessionStart`` hooks from a ``HookStore``."""
    return [
        hook
        for hook in store.list_all()
        if hook.get("event") == "SessionStart" and bool(hook.get("enabled", True))
    ]


async def _run_process_hook(command: str) -> None:
    """Run a ``process`` hook's command as a shell subprocess with a timeout.

    Never raises: any failure (spawn error, non-zero exit, timeout, kill) is
    logged and swallowed so the session flow is never blocked or failed by a
    misbehaving hook.
    """
    kwargs: dict[str, Any] = {}
    if sys.platform != "win32":
        # Own process group so a timeout kill does not take down the gateway's
        # own process tree. Windows has no os.setsid equivalent here, so the
        # child is left in the gateway's group on win32 (acceptable: it is
        # already fire-and-forget from the session flow).
        kwargs["start_new_session"] = True
    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            **kwargs,
        )
    except Exception as e:  # noqa: BLE001 — spawn failure must not propagate
        logger.warning("SessionStart process hook could not start ({}): {}", e, command)
        return

    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=_PROCESS_HOOK_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        try:
            proc.kill()
        except ProcessLookupError:
            pass
        await proc.wait()
        logger.warning(
            "SessionStart process hook timed out after {}s: {}",
            _PROCESS_HOOK_TIMEOUT_SECONDS,
            command,
        )
        return

    if proc.returncode != 0:
        detail = stderr.decode(errors="replace").strip() or stdout.decode(errors="replace").strip()
        logger.warning(
            "SessionStart process hook exited {} ({}): {}",
            proc.returncode,
            command,
            detail[:400],
        )
    else:
        logger.info("SessionStart process hook ran: {}", command)


async def _inject_session_start_prompt(
    server: Any,
    session: Session,
    prompts: list[str],
) -> None:
    """Accumulate ``prompt`` hooks onto the session for the agent to read."""
    existing = session.metadata.get(SESSION_START_PROMPT_KEY, "") or ""
    combined = "\n\n".join(part for part in (existing, "\n\n".join(prompts)) if part)
    session.metadata[SESSION_START_PROMPT_KEY] = combined

    save = getattr(getattr(server, "session_manager", None), "save", None)
    if not callable(save):
        logger.info("No session manager to persist session-start prompt for {}", session.key)
        return
    try:
        await save(session)
    except Exception as e:  # noqa: BLE001 — persistence failure must not block
        logger.warning("Failed to persist session-start prompt for {}: {}", session.key, e)


async def execute_session_start(server: Any, session: Session) -> None:
    """Run every enabled ``SessionStart`` hook for a newly created session.

    Called fire-and-forget by the gateway after the session is first created.
    The function is intentionally self-contained and never raises, so a task
    wrapping it cannot take down the request path even on exceptional hooks.
    """
    from codex_pro.gateway.api.hooks import HookStore

    try:
        store = HookStore(server._workspace)
    except Exception:  # noqa: BLE001
        logger.warning("SessionStart hooks skipped: hook store unavailable")
        return

    hooks = collect_session_start_hooks(store)
    if not hooks:
        return

    process_commands: list[str] = []
    prompts: list[str] = []
    for hook in hooks:
        command = str(hook.get("command", "") or "").strip()
        if not command:
            continue
        if hook.get("run_mode") == "prompt":
            prompts.append(command)
        else:
            process_commands.append(command)

    if prompts:
        await _inject_session_start_prompt(server, session, prompts)

    # Run process hooks concurrently so multiple hooks do not serialize behind
    # one another; each is individually bounded by its own timeout.
    if process_commands:
        await asyncio.gather(
            *(_run_process_hook(cmd) for cmd in process_commands),
            return_exceptions=True,
        )


def schedule_session_start(server: Any, session: Session) -> None:
    """Schedule ``execute_session_start`` as a fire-and-forget background task.

    Lightweight and sync (no ``await``) so the gateway's reset path can hand off
    hook execution without blocking or being blocked by it. The wrapped coroutine
    never raises, so the task does not surface an unhandled exception.
    """
    task = asyncio.get_running_loop().create_task(execute_session_start(server, session))
    task.add_done_callback(_log_task_exception)


def _log_task_exception(task: asyncio.Task[Any]) -> None:
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.error("SessionStart hook task failed: {}", exc)
