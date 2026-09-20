"""Watchdog for reloading config when the YAML file changes."""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import TYPE_CHECKING

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer

logger = logging.getLogger(__name__)


class _ConfigFileHandler(FileSystemEventHandler):
    """Respond to modifications of a single config file by triggering reload."""

    def __init__(self, server: "GatewayServer", config_path: Path) -> None:
        super().__init__()
        self._server = server
        self._config_path = config_path.resolve()
        self._last_mtime: float = 0.0
        # Store the running loop at start() time so watchdog's background
        # thread can schedule async work via call_soon_threadsafe.
        self._loop: asyncio.AbstractEventLoop | None = None

    def _try_reload(self) -> None:
        """Schedule an async reload if the file has actually changed."""
        try:
            mtime = self._config_path.stat().st_mtime
        except OSError:
            return
        if mtime <= self._last_mtime:
            return
        self._last_mtime = mtime
        if self._loop is None or self._loop.is_closed():
            return
        self._loop.call_soon_threadsafe(self._do_reload)

    def _do_reload(self) -> None:
        """Run the reload on the event loop thread."""
        task = asyncio.ensure_future(self._server.reload_config())
        task.add_done_callback(self._on_reload_done)

    def _on_reload_done(self, task: asyncio.Task[None]) -> None:
        try:
            result = task.result()
            if isinstance(result, dict) and not result.get("ok", True):
                logger.warning("Config hot-reload failed: {}", result.get("error", "unknown"))
        except Exception as exc:
            logger.warning("Config hot-reload failed: {}", exc)

    def on_modified(self, event) -> None:
        if not event.is_directory and Path(event.src_path).resolve() == self._config_path:
            self._try_reload()

    def on_moved(self, event) -> None:
        if not event.is_directory and Path(event.dest_path).resolve() == self._config_path:
            self._try_reload()


class ConfigWatcher:
    """Monitor a config file and hot-reload the gateway when it changes."""

    def __init__(self, server: "GatewayServer", config_path: Path) -> None:
        self._server = server
        self._config_path = config_path.resolve()
        self._observer: Observer | None = None
        self._handler: _ConfigFileHandler | None = None

    def start(self) -> None:
        """Start watching the config file in a background thread."""
        if self._config_path is None or not self._config_path.exists():
            logger.debug("Config watcher skipped: path does not exist: {}", self._config_path)
            return
        self._handler = _ConfigFileHandler(self._server, self._config_path)
        # Capture the running loop so the handler can schedule async work
        # from watchdog's daemon thread.
        self._handler._loop = asyncio.get_running_loop()
        self._observer = Observer()
        self._observer.schedule(self._handler, str(self._config_path.parent), recursive=False)
        self._observer.start()
        logger.info("Config watcher started for {}", self._config_path)

    def stop(self) -> None:
        """Stop the observer and wait for it to terminate."""
        if self._observer is not None:
            self._observer.stop()
            self._observer.join(timeout=5)
            self._observer = None
            self._handler = None
            logger.debug("Config watcher stopped")
