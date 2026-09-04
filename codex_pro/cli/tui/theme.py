"""Codex TUI themes + light/dark auto-detection.

Two palettes (dark default, light for bright terminals) plus a detector.
Detection order (first decisive signal wins):

  1. CODEX_TUI_THEME = light|dark   — explicit override
  2. CODEX_TUI_LIGHT = 1/true/…     — explicit boolean
  3. COLORFGBG last field 7 or 15  — XFCE/rxvt/Terminal.app light profiles;
     any other 0..15 slot is treated as authoritatively dark
  4. TERM_PROGRAM light allow-list — Apple_Terminal defaults to a light profile

Anything undecided stays dark — the default Codex palette is the dark one.
"""

from __future__ import annotations

from collections.abc import Mapping

from textual.theme import Theme

from codex_pro.cli.palette import DARK_PALETTE, LIGHT_PALETTE, detect_light_mode

# Muted foreground for secondary text (tool operands, hints) so the eye lands on
# the primary content first. Shared shape across both palettes.
CODEX_THEME = Theme(
    name="codex",
    primary=DARK_PALETTE["primary"],
    secondary=DARK_PALETTE["secondary"],
    accent=DARK_PALETTE["accent"],
    success=DARK_PALETTE["success"],
    warning=DARK_PALETTE["warning"],
    error=DARK_PALETTE["error"],
    foreground=DARK_PALETTE["foreground"],
    background=DARK_PALETTE["background"],
    surface=DARK_PALETTE["surface"],
    panel=DARK_PALETTE["panel"],
    dark=True,
    variables={
        "text-muted": DARK_PALETTE["text-muted"],
        **{key: value for key, value in DARK_PALETTE.items() if key.startswith("status-")},
    },
)

# Light palette: darker teals/indigos that stay legible on white. Same variable
# shape as the dark one so app.tcss ($primary/$boost/$primary-muted/…) resolves
# identically — only the hues change.
CODEX_THEME_LIGHT = Theme(
    name="codex-light",
    primary=LIGHT_PALETTE["primary"],
    secondary=LIGHT_PALETTE["secondary"],
    accent=LIGHT_PALETTE["accent"],
    success=LIGHT_PALETTE["success"],
    warning=LIGHT_PALETTE["warning"],
    error=LIGHT_PALETTE["error"],
    foreground=LIGHT_PALETTE["foreground"],
    background=LIGHT_PALETTE["background"],
    surface=LIGHT_PALETTE["surface"],
    panel=LIGHT_PALETTE["panel"],
    dark=False,
    variables={
        "text-muted": LIGHT_PALETTE["text-muted"],
        **{key: value for key, value in LIGHT_PALETTE.items() if key.startswith("status-")},
    },
)


def resolve_theme_name(env: Mapping[str, str] | None = None) -> str:
    """Theme name to activate: 'codex-light' on a light terminal, else 'codex'."""
    return "codex-light" if detect_light_mode(env) else "codex"
