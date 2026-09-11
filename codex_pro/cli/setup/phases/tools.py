"""Tools setup phase — Section 6 of the setup wizard."""
from __future__ import annotations

from codex_pro.cli.setup import (
    print_info, print_success,
    _print_section_header, _choice, _ensure_dict,
    t,
)


def setup_tools(config: dict) -> None:
    _print_section_header("tools")
    print_info(t("tools.intro"))
    print()

    tools_cfg = _ensure_dict(config, "tools")
    choices = ["full", "minimal", "read_only"]
    cur = tools_cfg.get("profile", "full")
    default = choices.index(cur) if cur in choices else 0
    idx = _choice(t("tools.profile"), choices, default=default)
    tools_cfg["profile"] = choices[idx]

    print_success(t("tools.saved", profile=choices[idx]))
