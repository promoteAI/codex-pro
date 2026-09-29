"""Desktop entry point — the PyInstaller binary calls this.

The desktop shell spawns the gateway with a dynamic port and the desktop
workspace so it never collides with a CLI gateway running on the same
machine. The real bound port is written to the runtime endpoint file
(``.codex-pro/gateway.json``) and read back by the Tauri shell.
"""
from __future__ import annotations

import asyncio
import os
import sys

from codex_pro import __version__, app
from codex_pro.runtime_paths import codex_home

# Desktop workspace is isolated from the CLI default workspace so the
# per-workspace instance lock (workspace/data/<lock>) never collides.
DESKTOP_WORKSPACE = codex_home() / "desktop-workspace"


def main(argv: list[str] | None = None) -> int:
    """Run the gateway in desktop mode.

    Forces ``port=0`` (dynamic), ``host=127.0.0.1`` (loopback only), and a
    desktop workspace. Any extra CLI args are passed through.
    """
    import argparse

    parser = argparse.ArgumentParser(prog="codex-pro-desktop")
    parser.add_argument("-c", "--config", default=None)
    parser.add_argument("-w", "--workspace", default=str(DESKTOP_WORKSPACE))
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--version", action="version", version=f"codex-pro {__version__}")
    args = parser.parse_args(argv)

    DESKTOP_WORKSPACE.mkdir(parents=True, exist_ok=True)

    # In desktop mode, stdin is redirected to null by the Tauri shell, so
    # `sys.stdin.isatty()` returns False and the CLI channel disables itself.
    # This is safe because the desktop shell communicates with the gateway
    # via HTTP/WebSocket on localhost, never via stdin.
    #
    # Additionally, set an environment marker so the gateway can adapt its
    # behavior if needed (e.g., skip interactive prompts).
    os.environ["_CODEX_PRO_DESKTOP"] = "1"

    def _run() -> None:
        asyncio.run(
            app.run_gateway(
                config_path=args.config,
                host=args.host,
                port=args.port,
                workspace=args.workspace,
                force=args.force,
            )
        )

    try:
        _run()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
