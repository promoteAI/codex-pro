"""Shared palette contract for setup and the Textual CLI."""

from codex_pro.cli.palette import DARK_PALETTE, LIGHT_PALETTE, active_palette, ansi
from codex_pro.cli.tui.theme import CODEX_THEME, CODEX_THEME_LIGHT


def test_tui_themes_source_the_shared_cli_palette():
    assert CODEX_THEME.primary == DARK_PALETTE["primary"]
    assert CODEX_THEME.success == DARK_PALETTE["success"]
    assert CODEX_THEME_LIGHT.primary == LIGHT_PALETTE["primary"]
    assert CODEX_THEME_LIGHT.warning == LIGHT_PALETTE["warning"]


def test_active_palette_and_ansi_follow_terminal_theme():
    assert active_palette({"CODEX_TUI_THEME": "dark"}) == DARK_PALETTE
    assert active_palette({"CODEX_TUI_THEME": "light"}) == LIGHT_PALETTE
    assert ansi("primary", {"CODEX_TUI_THEME": "dark"}) == "\033[38;2;79;209;197m"
