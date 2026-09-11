"""Cost setup phase — Section 12 of the setup wizard."""
from __future__ import annotations

from codex_pro.cli.setup import (
    print_info, print_success,
    _print_section_header, _ensure_dict,
    t, ui,
)


def setup_cost(config: dict) -> None:
    _print_section_header("cost")
    print_info(t("cost.intro"))
    print()

    budget = _ensure_dict(config, "budget")
    enabled = ui.confirm(
        t("cost.enabled"),
        default=bool(budget.get("enabled", True)),
    )
    budget["enabled"] = enabled
    if not enabled:
        print_info(t("cost.disabled"))
        return

    daily_limit = ui.number(
        t("cost.daily_limit"),
        default=float(budget.get("daily_limit_usd", 10.0)),
    )
    budget["daily_limit_usd"] = daily_limit

    print_success(t("cost.saved", limit=daily_limit))
