"""Real pseudo-terminal process management.

``PtyProcess`` owns an interactive subprocess bound to a real OS pseudo-terminal
(``openpty`` on POSIX, ConPTY via ``pywinpty`` on Windows). It is the backend
half of the ``/ws/term`` terminal: raw bytes read from the PTY master are
forwarded to the browser for ``xterm.js`` to emulate, and bytes written by the
browser are delivered to the PTY slave as the child's stdin.

The plumbing mirrors ``codex_pro/agent/proc_lifecycle.py``: the child is started
as its own session leader so every descendant (pipelines, backgrounded jobs)
shares one process group, and termination kills that group as a unit rather than
only the direct child.

Only the ``local`` execution environment is supported in v1.
"""

from __future__ import annotations

import asyncio
import os
import signal
import struct
import subprocess
import threading
from typing import Any, Callable

from loguru import logger

_POSIX = os.name == "posix"

# Sentinel used in place of SIGKILL on platforms that lack it (Windows).
_SIGKILL = getattr(signal, "SIGKILL", 999)

_DEFAULT_COLS = 80
_DEFAULT_ROWS = 24


def _default_shell() -> str:
    """Pick a default interactive shell for the current host."""
    if _POSIX:
        return os.environ.get("SHELL") or "/bin/sh"
    return os.environ.get("COMSPEC") or "cmd.exe"


def _windows_input_normalize(data: bytes) -> bytes:
    """Normalize terminal input for ConPTY.

    ``\n`` becomes ``\r\n`` and backspace (``0x08``) becomes DEL (``0x7f``), the
    same translation ConPTY expects from a real console. ``\r\n`` and a lone
    ``\r`` are left untouched so a CRLF pair is not doubled.
    """
    out = bytearray()
    i = 0
    while i < len(data):
        b = data[i]
        if b == 0x0A:  # \n
            if i > 0 and data[i - 1] == 0x0D:
                # CRLF already; keep as-is
                out.append(b)
            else:
                out.extend(b"\r\n")
        elif b == 0x08:  # backspace
            out.append(0x7F)
        else:
            out.append(b)
        i += 1
    return bytes(out)


class _WindowsProcess:
    """Thin subprocess-shaped adapter over a ``pywinpty.PtyProcess``.

    pywinpty's ``PtyProcess`` already spawns the child; this wrapper gives the
    rest of ``PtyProcess`` the ``poll``/``wait``/``returncode`` surface it uses
    uniformly across platforms, and maps Ctrl-C onto ``sendintr`` so a shell's
    SIGINT behaves like a real console interrupt.
    """

    def __init__(self, pty: object) -> None:
        self._pty = pty
        self._rc: int | None = None

    @property
    def pid(self) -> int | None:
        return getattr(self._pty, "pid", None)

    @property
    def stdin(self) -> None:
        return None

    def poll(self) -> int | None:
        if self._pty.isalive() or self._rc is not None:
            return self._rc
        self._rc = int(getattr(self._pty, "exitstatus", 0) or 0)
        return self._rc

    @property
    def returncode(self) -> int | None:
        return self.poll()

    def wait(self, timeout: float | None = None) -> int:
        self._pty.wait()
        self._rc = int(getattr(self._pty, "exitstatus", 0) or 0)
        return self._rc

    def kill(self) -> None:
        self._pty.kill(9)

    def terminate(self) -> None:
        self._pty.kill(signal.SIGTERM)

    def send_signal(self, sig: int) -> None:
        if sig == signal.SIGINT:
            self._pty.sendintr()
        else:
            self._pty.kill(sig)


class PtyProcess:
    """A subprocess attached to a real pseudo-terminal.

    A logical, connect-local id (``term_<n>``) is assigned by the owning
    ``TerminalWebSocket``; the OS pid is an implementation detail.
    """

    def __init__(
        self,
        *,
        shell: str = "",
        cwd: str = "",
        cols: int = _DEFAULT_COLS,
        rows: int = _DEFAULT_ROWS,
        env: dict[str, str] | None = None,
        on_read: Callable[[bytes], None] | None = None,
    ) -> None:
        self._shell = shell or _default_shell()
        self._cwd = cwd
        self._cols = cols or _DEFAULT_COLS
        self._rows = rows or _DEFAULT_ROWS
        self._env = dict(env) if env else {}
        self._on_read = on_read

        self._proc: Any = None
        self._master_fd: int | None = None
        self._slave_fd: int | None = None
        self._close_slave: Callable[[], None] | None = None
        self._win_conpty: object | None = None
        self._win_queue: asyncio.Queue[bytes | None] | None = None

        self._reader_task: asyncio.Task[None] | None = None
        self._exit_code: int | None = None
        self._started = False
        self._closed = False

    # ── Lifecycle ──────────────────────────────────────────────────────────

    def set_on_read(self, on_read: Callable[[bytes], None]) -> None:
        """Attach the callback that receives raw PTY output chunks.

        ``on_read`` is invoked with each chunk as it is read, and with ``b""``
        once the stream reaches EOF. It may be a plain callable (tests) or an
        ``async def`` (the WebSocket owner); an awaited coroutine result is
        awaited by the pump so a frame is not silently dropped.
        """
        self._on_read = on_read

    async def start(self) -> None:
        """Create the PTY and spawn the child as its controlling terminal."""
        if self._started:
            return
        self._started = True

        if _POSIX:
            self._start_posix()
            self._proc = self._spawn_child()
        else:
            await self._start_windows()

        await self._set_winsize(self._cols, self._rows)

        # Kick off the reader that pumps PTY master -> on_read callback.
        self._reader_task = asyncio.create_task(self._pump())

        logger.info(
            "pty started pid={} shell={} cwd={} cols={} rows={}",
            self.pid, self._shell, self._cwd, self._cols, self._rows,
        )

    def _spawn_child(self) -> subprocess.Popen:
        """Spawn a POSIX shell attached to the PTY slave."""
        assert self._slave_fd is not None, "_start_posix must run first"
        return subprocess.Popen(
            self._shell.split() or [self._shell],
            stdin=self._slave_fd,
            stdout=self._slave_fd,
            stderr=self._slave_fd,
            cwd=self._cwd or None,
            start_new_session=True,
            preexec_fn=self._make_setsid_ctty(),
            close_fds=True,
            env=self._env or None,
        )

    def _start_posix(self) -> None:
        """Open a real PTY pair and mark the child as session leader."""
        import fcntl
        import termios

        master, slave = os.openpty()
        self._master_fd = master
        self._slave_fd = slave

        # Make the slave the controlling terminal of the child's new session.
        try:
            fcntl.ioctl(slave, termios.TIOCSCTTY, 0)
        except OSError:
            pass

        self._close_slave = lambda: os.close(slave)

    async def _start_windows(self) -> None:
        """Create a ConPTY pseudoconsole via ``pywinpty`` (optional dependency).

        pywinpty's ``PtyProcess`` spawns the child itself, so unlike the POSIX
        path there is no separate ``Popen``. A background thread pumps the pty
        output into an asyncio queue.

        The child's output is read from ``PtyProcess.fileobj`` — the raw byte
        socket that pywinpty's own internal reader thread feeds. Reading it
        directly (rather than calling ``PtyProcess.read()``) matters on two
        counts: ``PtyProcess.read()`` decodes the stream as UTF-8 and, on
        seeing a non-UTF-8 byte, loops appending one byte at a time until it
        forms a whole codepoint — a loop that can block forever on real cmd.exe
        output (GBK mangled into UTF-8) and silently starve the terminal. And
        the bytes on ``fileobj`` are already valid UTF-8 (pywinpty re-encodes
        the correctly-decoded Unicode before sending), so forwarding them
        verbatim keeps CJK intact for the browser's xterm.js instead of mangling
        it a second time. ``fileobj`` is put into non-blocking mode and polled
        at a high rate because a blocking ``recv`` just hangs the reader thread
        on a quiet shell.
        """
        try:
            import winpty
        except ImportError as e:  # pragma: no cover - optional
            raise RuntimeError(
                "Windows terminal support requires `pywinpty`; install the "
                "`terminal` extra (pip install -e '.[terminal]')"
            ) from e

        pty = winpty.PtyProcess.spawn(
            self._shell,
            cwd=self._cwd or None,
            env=self._env or None,
            dimensions=(self._rows, self._cols),
        )
        self._win_conpty = pty
        self._proc = _WindowsProcess(pty)

        queue: asyncio.Queue[bytes | None] = asyncio.Queue()
        self._win_queue = queue
        loop = asyncio.get_running_loop()

        # The raw byte channel pywinpty's internal reader thread writes into;
        # switch it to non-blocking so the poll loop below never blocks.
        fileobj = pty.fileobj
        fileobj.setblocking(False)

        def _reader() -> None:
            import time

            while True:
                try:
                    data = fileobj.recv(4096)
                except BlockingIOError:
                    # Nothing pending right now — retry without blocking the
                    # asyncio loop (the callback is queued, not awaited).
                    time.sleep(0.002)
                    continue
                except Exception:
                    loop.call_soon_threadsafe(queue.put_nowait, None)
                    break
                if data is None:
                    time.sleep(0.002)
                    continue
                if data == b"":
                    loop.call_soon_threadsafe(queue.put_nowait, None)
                    break
                loop.call_soon_threadsafe(queue.put_nowait, data)

        threading.Thread(target=_reader, daemon=True, name="codex-pro-term-reader").start()

    def _make_setsid_ctty(self) -> Callable[[], None]:
        """Return a ``preexec_fn`` that makes the slave the controlling tty."""
        slave_fd = self._slave_fd

        def _preexec() -> None:
            try:
                import fcntl
                import termios

                fcntl.ioctl(slave_fd, termios.TIOCSCTTY, 0)
            except Exception:
                pass

        return _preexec

    # ── PTY I/O ────────────────────────────────────────────────────────────

    async def _pump(self) -> None:
        """Read the PTY master and push chunks to ``on_read`` until EOF."""
        try:
            while True:
                chunk = await self._read_chunk()
                if chunk is None:
                    break
                if chunk:
                    if self._on_read is not None:
                        await self._emit(chunk)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # pragma: no cover - defensive
            logger.warning("pty pump failed for pid {}: {}", self.pid, e)
        finally:
            # Notify downstream of EOF (closed stream).
            if self._on_read is not None:
                try:
                    await self._emit(b"")
                except Exception:  # pragma: no cover - defensive
                    pass

    async def _emit(self, chunk: bytes) -> None:
        """Deliver one chunk to the ``on_read`` callback, awaiting it if async.

        The callback is documented as a plain callable, but the WebSocket owner
        registers an ``async def`` that sends a frame. A sync call would hand it
        back a coroutine that is never awaited — the frame is silently dropped
        and the terminal appears dead. Await a coroutine result when one is
        returned so both sync (tests) and async (WebSocket) callbacks work.
        """
        result = self._on_read(chunk)
        if asyncio.iscoroutine(result):
            await result

    async def _read_chunk(self, max_bytes: int = 4096) -> bytes | None:
        """Read up to ``max_bytes`` from the PTY, or None on EOF."""
        if _POSIX:
            assert self._master_fd is not None
            try:
                return await asyncio.to_thread(os.read, self._master_fd, max_bytes)
            except OSError:
                return None
        assert self._win_queue is not None
        return await self._win_queue.get()

    async def write(self, data: bytes) -> None:
        """Write bytes to the child's stdin through the PTY master."""
        if self._closed or self._proc is None or self._proc.poll() is not None:
            return
        payload = _windows_input_normalize(data) if not _POSIX else data
        if _POSIX:
            assert self._master_fd is not None
            try:
                await asyncio.to_thread(os.write, self._master_fd, payload)
            except OSError:
                return
        else:
            assert self._win_conpty is not None
            try:
                await asyncio.to_thread(
                    self._win_conpty.write, payload.decode("utf-8", errors="replace"),
                )
            except Exception:
                return

    async def _set_winsize(self, cols: int, rows: int) -> None:
        """Set the PTY terminal window size."""
        if _POSIX:
            import fcntl
            import termios

            if self._master_fd is None:
                return
            try:
                await asyncio.to_thread(
                    fcntl.ioctl,
                    self._master_fd,
                    termios.TIOCSWINSZ,
                    struct.pack("HHHH", rows, cols, 0, 0),
                )
            except OSError:
                return
        else:
            if self._win_conpty is None:
                return
            try:
                await asyncio.to_thread(self._win_conpty.setwinsize, rows, cols)
            except Exception:
                return

    async def resize(self, cols: int, rows: int) -> None:
        """Resize the PTY window and push the new size to the child."""
        if self._closed:
            return
        self._cols = cols or self._cols
        self._rows = rows or self._rows
        await self._set_winsize(self._cols, self._rows)

    # ── Teardown ───────────────────────────────────────────────────────────

    async def terminate(self, grace: float = 5.0) -> None:
        """Kill the process and its whole group, then close the PTY."""
        if self._closed:
            return
        self._closed = True

        proc = self._proc
        if proc is not None and proc.poll() is None:
            self._signal_group(proc, signal.SIGHUP if _POSIX else signal.SIGTERM)
            try:
                await asyncio.wait_for(asyncio.to_thread(proc.wait), timeout=grace)
            except (asyncio.TimeoutError, OSError):
                self._signal_group(proc, _SIGKILL)
                try:
                    await asyncio.to_thread(proc.wait)
                except Exception:  # pragma: no cover - defensive
                    pass

        if self._reader_task is not None:
            self._reader_task.cancel()
            await asyncio.gather(self._reader_task, return_exceptions=True)
            self._reader_task = None

        self._close_pty()

    async def wait(self) -> int:
        """Wait for the child to exit and return its exit code."""
        proc = self._proc
        if proc is None:
            return -1
        if proc.poll() is None:
            try:
                await asyncio.to_thread(proc.wait)
            except OSError:
                return -1
        self._exit_code = proc.returncode
        self._close_pty()
        return self._exit_code if self._exit_code is not None else -1

    def _close_pty(self) -> None:
        if _POSIX:
            if self._slave_fd is not None and self._close_slave is not None:
                try:
                    self._close_slave()
                except OSError:
                    pass
            if self._master_fd is not None:
                try:
                    os.close(self._master_fd)
                except OSError:
                    pass
            self._master_fd = None
            self._slave_fd = None
        else:
            if self._win_conpty is not None:
                try:
                    self._win_conpty.close()
                except Exception:  # pragma: no cover - defensive
                    pass
            self._win_conpty = None

    def _signal_group(self, proc: Any, sig: int) -> None:
        """Signal the child's process group, falling back to the child alone."""
        pid = getattr(proc, "pid", None)
        if not isinstance(pid, int) or pid <= 0:
            proc.terminate()
            return
        if _POSIX:
            try:
                pgid = os.getpgid(pid)
            except OSError:
                pgid = pid
            if pgid == pid:
                try:
                    os.killpg(pgid, sig)
                    return
                except OSError:
                    pass
            try:
                proc.send_signal(sig)
                return
            except OSError:
                return
        try:
            if sig == _SIGKILL:
                proc.kill()
            else:
                proc.terminate()
        except OSError:
            pass

    # ── Introspection ──────────────────────────────────────────────────────

    @property
    def pid(self) -> int | None:
        return getattr(self._proc, "pid", None) if self._proc else None

    @property
    def exit_code(self) -> int | None:
        if self._exit_code is not None:
            return self._exit_code
        if self._proc is not None:
            return self._proc.returncode
        return None

    @property
    def running(self) -> bool:
        return self._proc is not None and self._proc.poll() is None
