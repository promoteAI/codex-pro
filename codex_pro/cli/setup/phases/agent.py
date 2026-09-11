"""Agent behavior setup phase — Section 5 of the setup wizard."""
from __future__ import annotations

from codex_pro.cli.setup import (
    print_info, print_success,
    _print_section_header, _choice, _ensure_dict,
    t,
)


def setup_agent(config: dict) -> None:
    _print_section_header("agent")
    print_info(t("agent.intro"))
    print()

    session_cfg = _ensure_dict(config, "session")
    choices = ["compact", "balanced", "verbose"]
    cur = session_cfg.get("context_mode", "balanced")
    default = choices.index(cur) if cur in choices else 1
    idx = _choice(t("agent.context_mode"), choices, default=default)
    session_cfg["context_mode"] = choices[idx]

    print_success(t("agent.saved", mode=choices[idx]))
