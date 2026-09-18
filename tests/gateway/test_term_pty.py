# tests/gateway/test_term_pty.py
"""Tests for the real pseudo-terminal layer (codex_pro/gateway/term/pty.py)."""

import os
import pytest

from codex_pro.gateway.term.pty import _default_shell, _windows_input_normalize

_POSIX = os.name == "posix"


class TestWindowsInputNormalize:
    def test_newline_becomes_crlf(self):
        assert _windows_input_normalize(b"a\nb") == b"a\r\nb"

    def test_crlf_not_doubled(self):
        assert _windows_input_normalize(b"a\r\nb") == b"a\r\nb"

    def test_lone_cr_untouched(self):
        assert _windows_input_normalize(b"a\rb") == b"a\rb"

    def test_backspace_becomes_del(self):
        assert _windows_input_normalize(b"a\x08b") == b"a\x7fb"

    def test_plain_passthrough(self):
        assert _windows_input_normalize(b"hello") == b"hello"


class TestDefaultShell:
    def test_returns_nonempty(self):
        assert _default_shell()


@pytest.mark.skipif(not _POSIX, reason="posix PTY required")
class TestPosixPty:
    """Real os.openpty tests — skipped on Windows."""

    @pytest.mark.asyncio
    async def test_echo_output(self):
        from codex_pro.gateway.term.pty import PtyProcess

        collected: list[bytes] = []
        pty = PtyProcess(shell="/bin/sh", cwd="/tmp", on_read=collected.append)
        await pty.start()
        await pty.write(b"echo hello\n")
        await asyncio_sleep(0.3)
        await pty.terminate()

        combined = b"".join(collected)
        assert b"hello" in combined

    @pytest.mark.asyncio
    async def test_terminate_kills_process_group(self):
        from codex_pro.gateway.term.pty import PtyProcess

        pty = PtyProcess(shell="/bin/sh", cwd="/tmp")
        await pty.start()
        # Background a long job so a child outlives the leading shell command.
        await pty.write(b"sleep 300 &\n")
        await asyncio_sleep(0.2)
        pid = pty.pid
        assert pid is not None
        await pty.terminate()

        # The process group should be gone.
        import signal
        with pytest.raises(ProcessLookupError):
            os.killpg(os.getpgid(pid), 0)


@pytest.mark.skipif(_POSIX, reason="conpty is windows-only")
class TestConPTYPty:
    """Real ConPTY tests for the Windows backend.

    These are the tests that would have caught the original hang: pywinpty's
    high-level ``PtyProcess.read()`` decodes the stream as UTF-8 and loops
    byte-by-byte on any non-UTF-8 byte, which can block forever on real cmd.exe
    and starve the terminal. The Windows reader instead polls the raw
    ``fileobj`` socket, so a spawned cmd must echo its command output back.
    """

    @pytest.mark.asyncio
    async def test_cmd_echoes_output(self):
        from codex_pro.gateway.term.pty import PtyProcess

        collected: list[bytes] = []
        pty = PtyProcess(
            shell="cmd.exe", cwd=os.getcwd(), cols=80, rows=24,
            on_read=collected.append,
        )
        await pty.start()
        # Let cmd's banner and prompt settle before sending input.
        await asyncio_sleep(1.5)
        collected.clear()

        await pty.write(b"echo hello_conpty\n")
        await asyncio_sleep(2.0)
        await pty.terminate()

        combined = b"".join(collected)
        assert b"hello_conpty" in combined


async def asyncio_sleep(seconds):
    import asyncio

    await asyncio.sleep(seconds)
