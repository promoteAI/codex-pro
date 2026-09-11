"""Terminal/Sandbox setup phase — Section 4 of the setup wizard."""
from __future__ import annotations

from codex_pro.cli.setup import (
    print_info, print_success,
    _print_section_header, _choice, _ensure_dict,
    t,
)


def setup_terminal(config: dict) -> None:
    _print_section_header("terminal")
    print_info(t("terminal.intro"))
    print()

    exec_cfg = _ensure_dict(config, "execution")
    choices = ["local", "sandbox", "container", "remote"]
    cur = exec_cfg.get("default_executor") or exec_cfg.get("defaultExecutor") or "sandbox"
    default = choices.index(cur) if cur in choices else 1
    idx = _choice(t("terminal.executor"), choices, default=default)
    exec_cfg["default_executor"] = choices[idx]

    print_success(t("terminal.saved", executor=choices[idx]))
