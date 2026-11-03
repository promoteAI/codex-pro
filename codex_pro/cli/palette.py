"""Shared terminal palette for the classic CLI and the Textual TUI.

This module deliberately has no optional UI dependencies. The setup wizard
can therefore use the same colors and light/dark detection as the TUI even
when the ``tui`` extra is not installed.
"""

from __future__ import annotations

import os
from collections.abc import Mapping


DARK_PALETTE = {
    "primary": "#e6e6e6",
    "secondary": "#a0a0a0",
    "accent": "#3866f0",
    "success": "#3fb950",
    "warning": "#f79748",
    "error": "#f85149",
    "foreground": "#e6e6e6",
    "background": "#181818",
    "surface": "#1e1e1e",
    "panel": "#141414",
    "text-muted": "#6e6e6e",
    # Status-bar-only palette. A subtle indigo strip gives the telemetry a
    # distinct, polished layer without changing the rest of the terminal UI.
    "status-surface": "#1a2744",
    "status-foreground": "#e6e6e6",
    "status-muted": "#6e6e6e",
    "status-ok": "#3fb950",
    "status-model": "#5b8def",
    "status-context": "#c89dff",
    "status-time": "#5b8def",
    "status-memory": "#d4a5ff",
    "status-warning": "#f79748",
    "status-error": "#f85149",
}

LIGHT_PALETTE = {
    "primary": "#1c1c1e",
    "secondary": "#47474c",
    "accent": "#3866f0",
    "success": "#157347",
    "warning": "#9a4400",
    "error": "#a61b1b",
    "foreground": "#1c1c1e",
    "background": "#f7f7f8",
    "surface": "#ffffff",
    "panel": "#e9e9eb",
    "text-muted": "#5f5f64",
    # The light counterpart keeps the same hue mapping with deeper inks on a
    # cool lavender surface, preserving contrast in bright terminal profiles.
    "status-surface": "#d4e4ff",
    "status-foreground": "#1c1c1e",
    "status-muted": "#5f5f64",
    "status-ok": "#157347",
    "status-model": "#2c55d4",
    "status-context": "#6d28d9",
    "status-time": "#0891b2",
    "status-memory": "#7c3aed",
    "status-warning": "#9a4400",
    "status-error": "#a61b1b",
}

_TRUE = {"1", "true", "yes", "on"}
_FALSE = {"0", "false", "no", "off"}
_LIGHT_TERM_PROGRAMS = {"Apple_Terminal"}


def detect_light_mode(env: Mapping[str, str] | None = None) -> bool:
    """Return whether terminal hints indicate a light background."""
    e = env if env is not None else os.environ

    theme_flag = str(e.get("CODEX_TUI_THEME", "")).strip().lower()
    if theme_flag == "light":
        return True
    if theme_flag == "dark":
        return False

    light_flag = str(e.get("CODEX_TUI_LIGHT", "")).strip().lower()
    if light_flag in _TRUE:
        return True
    if light_flag in _FALSE:
        return False

    colorfgbg = str(e.get("COLORFGBG", "")).strip()
    if colorfgbg:
        last = colorfgbg.split(";")[-1]
        if last.isdigit():
            background = int(last)
            if background in (7, 15):
                return True
            if 0 <= background < 16:
                return False

    return str(e.get("TERM_PROGRAM", "")).strip() in _LIGHT_TERM_PROGRAMS


def active_palette(env: Mapping[str, str] | None = None) -> dict[str, str]:
    """Return a copy of the palette appropriate for the current terminal."""
    source = LIGHT_PALETTE if detect_light_mode(env) else DARK_PALETTE
    return dict(source)


def ansi(role: str, env: Mapping[str, str] | None = None) -> str:
    """Return a 24-bit ANSI foreground escape for a named palette role."""
    value = active_palette(env).get(role)
    if value is None:
        raise KeyError(f"Unknown palette role: {role}")
    red, green, blue = (int(value[i:i + 2], 16) for i in (1, 3, 5))
    return f"\033[38;2;{red};{green};{blue}m"
