"""Friendly messages when the gateway cannot bind its listen port."""

from __future__ import annotations

import errno
from typing import Final

# Windows WSAEACCES — often Hyper-V / WinNAT excluded port ranges, not a
# competing process. Mis-reporting this as "port in use" sends users hunting
# for a phantom codex-pro instance while Vite proxies keep ECONNREFUSED.
_WIN_WSAEACCES: Final = 10013


def is_bind_access_denied(exc: OSError | None) -> bool:
    if exc is None:
        return False
    winerror = getattr(exc, "winerror", None)
    if winerror == _WIN_WSAEACCES:
        return True
    return exc.errno in (errno.EACCES, getattr(errno, "WSAEACCES", -1))


def format_gateway_port_bind_error(
    host: str,
    port: int,
    exc: OSError | None = None,
) -> str:
    """User-facing hint for a failed (or preflight) listen-port bind."""
    if is_bind_access_denied(exc):
        return (
            f"网关端口 {host}:{port} 无法绑定（系统拒绝访问）。"
            "在 Windows 上常见原因是 Hyper-V / WinNAT 把该端口划进了排除范围"
            "（可用 `netsh interface ipv4 show excludedportrange protocol=tcp` 查看）。"
            "请在配置里改 `gateway.port`（例如 18789），或用 `--port` 指定其它端口；"
            "开发时同步改 `web/.env.development.local` 的 `CODEX_PRO_GATEWAY_ORIGIN`。"
        )
    return (
        f"网关端口 {host}:{port} 已被占用，可能本机已有一个常驻 codex-pro 在运行。"
        "若要接入它请用 `codex-pro cli`；若要另起实例请用 `--port` 指定其它端口。"
    )
