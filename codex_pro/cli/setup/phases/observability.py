"""Observability setup phase — Section 10 of the setup wizard."""
from __future__ import annotations

from codex_pro.cli.setup import (
    print_info, print_success,
    _print_section_header, _choice, _ensure_dict,
    t, ui,
)


def setup_observability(config: dict) -> None:
    _print_section_header("observability")
    print_info(t("observability.intro"))
    print()

    obs = _ensure_dict(config, "observability")
    log_choices = ["INFO", "DEBUG", "WARNING", "ERROR"]
    cur_level = (obs.get("log_level") or obs.get("logLevel") or "INFO").upper()
    default_log = log_choices.index(cur_level) if cur_level in log_choices else 0
    l_idx = _choice(t("observability.log_level"), log_choices, default=default_log)
    obs["log_level"] = log_choices[l_idx]

    obs["trace_enabled"] = ui.confirm(t("observability.trace"), default=bool(obs.get("trace_enabled", True)))

    otel_on = ui.confirm(t("observability.otel"), default=bool(obs.get("otel_enabled", False)))
    obs["otel_enabled"] = otel_on
    if otel_on:
        obs["otel_endpoint"] = ui.text(
            t("observability.otel_endpoint"),
            default=obs.get("otel_endpoint") or obs.get("otelEndpoint") or "http://localhost:4317"
        )
        obs["otel_service_name"] = ui.text(
            t("observability.otel_service"),
            default=obs.get("otel_service_name") or obs.get("otelServiceName") or "codex-pro"
        )

    print_success(t("observability.saved",
                    level=log_choices[l_idx],
                    otel=t("common.yes") if otel_on else t("common.no")))
