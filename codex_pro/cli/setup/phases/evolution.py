"""Evolution setup phase — Section 11 of the setup wizard."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from codex_pro.cli.setup import (
    print_info, print_success, print_warning,
    _print_section_header, _choice, _ensure_dict,
    t, ui,
)


def setup_evolution(config: dict) -> None:
    _print_section_header("evolution")
    print_info(t("evolution.intro"))
    print_warning(t("evolution.warning"))
    print()

    evo = _ensure_dict(config, "evolution")
    enabled = ui.confirm(
        t("evolution.enabled"),
        default=bool(evo.get("enabled", False)),
    )
    evo["enabled"] = enabled
    if not enabled:
        print_info(t("evolution.disabled"))
        return

    trigger_choices = ["manual", "threshold", "scheduled"]
    cur_trigger = evo.get("trigger", "manual")
    default_trigger = trigger_choices.index(cur_trigger) if cur_trigger in trigger_choices else 0
    trigger_idx = _choice(t("evolution.trigger"), trigger_choices, default=default_trigger)
    evo["trigger"] = trigger_choices[trigger_idx]

    if trigger_choices[trigger_idx] == "threshold":
        threshold = ui.number(
            t("evolution.threshold"),
            default=float(evo.get("threshold", 0.01)),
        )
        evo["threshold"] = threshold
    elif trigger_choices[trigger_idx] == "scheduled":
        interval = ui.number(
            t("evolution.interval"),
            default=float(evo.get("interval_hours", 24)),
        )
        evo["interval_hours"] = interval

    print_success(t("evolution.saved"))
