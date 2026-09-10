"""Logs command — tail or follow gateway logs from the CLI.

Usage:
    codex-pro logs              # show last 200 log entries
    codex-pro logs --follow     # stream new entries (like tail -f)
    codex-pro logs --level ERROR # filter by level
    codex-pro logs --limit 50    # custom page size
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any


from codex_pro.cli.colors import print_header, print_info


def _resolve_log_path(workspace: Path) -> Path:
    """Resolve the gateway log file path.

    On Windows the log lives under the workspace logs_dir; on Linux/macOS it
    may also be emitted by the service backend via journalctl.
    """
    return workspace / "logs" / "gateway.log"


def _read_tail(path: Path, limit: int = 200) -> list[dict[str, Any]]:
    """Read the last *limit* JSONL log lines from *path*."""
    if not path.exists():
        return []
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return []
    tail = lines[-limit:] if len(lines) > limit else lines
    entries: list[dict[str, Any]] = []
    for line in tail:
        line = line.strip()
        if not line:
            continue
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            entries.append({"raw": line})
    return entries


def _stream_logs(path: Path, follow_interval: float = 1.0) -> None:
    """Tail the log file and keep reading new lines (like tail -f)."""
    if not path.exists():
        print("Log file not found. Start the gateway first.", file=sys.stderr)
        sys.exit(1)

    # Start from end of file
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        f.seek(0, 2)  # EOF
        while True:
            line = f.readline()
            if line:
                line = line.rstrip("\n")
                if line:
                    try:
                        entry = json.loads(line)
                        ts = entry.get("timestamp", "")
                        level = entry.get("level", "").ljust(5)
                        msg = entry.get("message", line)
                        print(f"[{ts}] {level} {msg}")
                    except json.JSONDecodeError:
                        print(line)
                sys.stdout.flush()
            else:
                time.sleep(follow_interval)


def run_logs_command(
    *,
    follow: bool = False,
    limit: int = 200,
    level: str | None = None,
    workspace: Path | str | None = None,
    config_path: str | None = None,
) -> int:
    """Show gateway logs. Returns 0 on success."""
    from codex_pro.cli.workspace import load_config_and_workspace

    ws_arg = str(workspace) if workspace is not None else None
    _, ws = load_config_and_workspace(config_path, ws_arg)
    log_path = _resolve_log_path(ws)

    if not follow:
        entries = _read_tail(log_path, limit=limit)
        if level:
            entries = [e for e in entries if e.get("level", "").upper() == level.upper()]

        if not entries:
            print_info(f"No logs found at {log_path}")
            return 0

        print_header("Gateway Logs")
        for entry in entries:
            ts = entry.get("timestamp", "")
            lvl = entry.get("level", "").ljust(5)
            msg = entry.get("message", "")
            print(f"[{ts}] {lvl} {msg}")
        print(f"\n-- Showing {len(entries)} entries --")
        return 0

    # Follow mode
    print_info(f"Following logs at {log_path} (Ctrl+C to stop)...")
    print_info("Press Ctrl+C to exit.")
    try:
        _stream_logs(log_path)
    except KeyboardInterrupt:
        print()
    return 0
