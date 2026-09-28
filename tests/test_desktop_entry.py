# tests/test_desktop_entry.py
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

import pytest

from codex_pro import _desktop_entry, app


def test_desktop_workspace_default():
    """默认 desktop workspace 为 ~/.codex-pro/desktop-workspace（经 codex_home）。"""
    assert _desktop_entry.DESKTOP_WORKSPACE == Path.home() / ".codex-pro" / "desktop-workspace"


def test_main_parses_port_zero_and_loopback(monkeypatch):
    """main() 调用 run_gateway 时强制 port=0、host=127.0.0.1、workspace=desktop。

    直接调用 ``_desktop_entry.main([...])``：main 内部用 ``asyncio.run`` 运行
    ``app.run_gateway``，仅需 monkeypatch ``app.run_gateway`` 即可捕获实参，
    无需替换 ``asyncio.run``（避开 Python 3.12 已弃用的 ``asyncio.get_event_loop``）。
    """
    captured = {}

    async def fake_run_gateway(config_path=None, host=None, port=None, workspace=None, force=False):
        captured.update(host=host, port=port, workspace=workspace, force=force)

    monkeypatch.setattr(app, "run_gateway", fake_run_gateway)

    _desktop_entry.main(["--port", "0", "--host", "127.0.0.1"])
    assert captured["port"] == 0
    assert captured["host"] == "127.0.0.1"
    assert Path(captured["workspace"]) == _desktop_entry.DESKTOP_WORKSPACE


def _kill_tree(proc: subprocess.Popen) -> None:
    """Terminate a onefile PyInstaller process tree, waiting for full exit.

    Popen.terminate() only signals the onefile bootloader, orphaning the gateway
    child it spawned. On Windows, ``taskkill /T /F`` on the bootloader PID kills
    the whole tree. ``proc.wait()`` then ensures the handle is released before
    the test's temp dir is torn down (Windows won't unlink a log file a still-
    running process holds open).
    """
    try:
        subprocess.run(
            ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=15,
        )
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass
    try:
        proc.wait(timeout=15)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass
            proc.wait(timeout=5)


@pytest.mark.slow
def test_packaged_binary_serves_meta():
    """打包产物能启动 gateway，/meta 返回 api_prefix，且 web UI 可访问。

    该测试只在 CODEX_PRO_DESKTOP_BINARY 环境变量指向已构建产物时运行。
    """
    binary = os.environ.get("CODEX_PRO_DESKTOP_BINARY")
    if not binary:
        pytest.skip("set CODEX_PRO_DESKTOP_BINARY to the built desktop binary")
    if not os.path.isfile(binary):
        pytest.skip(f"CODEX_PRO_DESKTOP_BINARY points to non-file: {binary}")

    ws = tempfile.mkdtemp(prefix="codex-pro-desktop-smoke-")
    # The frozen onefile uses the bootloader's sys.stdin for the CLI channel.
    # subprocess.DEVNULL triggers stdin EOF -> CLI hits EOF -> gateway shuts down
    # immediately. Keeping stdin as an open PIPE prevents EOF so the CLI channel
    # sees a non-tty and self-disables ("CLI channel disabled because stdin is
    # not interactive"), letting the gateway stay alive.
    child_proc = subprocess.Popen(
        [binary, "--port", "0", "--host", "127.0.0.1", "--workspace", ws],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        stdin=subprocess.PIPE,
    )
    try:
        port = None
        endpoint = os.path.join(ws, ".codex-pro", "gateway.json")
        deadline = time.monotonic() + 90.0
        while port is None and time.monotonic() < deadline:
            if child_proc.poll() is not None:
                break
            if os.path.exists(endpoint):
                try:
                    with open(endpoint) as f:
                        port = json.load(f)["port"]
                except Exception:
                    pass
            time.sleep(0.5)
        assert port is not None, (
            "runtime endpoint file .codex-pro/gateway.json not written within 90s; "
            "proc exited rc={}".format(child_proc.returncode)
        )
        meta_url = "http://127.0.0.1:{}/meta".format(port)
        meta = json.loads(urllib.request.urlopen(meta_url, timeout=15).read())
        assert meta["api_prefix"] == "/api/v1", (
            "expected /api/v1, got {}".format(meta.get("api_prefix"))
        )
        ui_url = "http://127.0.0.1:{}".format(port)
        ui_resp = urllib.request.urlopen(ui_url, timeout=15)
        assert ui_resp.status == 200, "web UI returned status {}".format(ui_resp.status)
    finally:
        _kill_tree(child_proc)
        # The gateway holds log files open until its process tree is fully gone;
        # a killed process may release handles a moment after taskkill, so retry.
        for _ in range(10):
            try:
                shutil.rmtree(ws)
                break
            except OSError:
                time.sleep(0.5)
