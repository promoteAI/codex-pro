# tests/test_desktop_entry.py
from __future__ import annotations

from pathlib import Path

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
