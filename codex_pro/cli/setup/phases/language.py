"""Language setup phase — Section 1 of the setup wizard."""
from __future__ import annotations

from codex_pro.cli.i18n import get_locale, set_locale, t
from codex_pro.cli.setup import print_info, print_success, _print_section_header, _choice


def setup_language(config: dict) -> None:
    _print_section_header("language")
    auto_label = t("language.english") if get_locale() == "en" else t("language.chinese")
    print_info(t("language.auto_detected", label=auto_label))
    choices = [t("language.english"), t("language.chinese")]
    default = 0 if get_locale() == "en" else 1
    idx = _choice(t("language.prompt"), choices, default=default)
    chosen = "en" if idx == 0 else "zh"
    set_locale(chosen)
    config.setdefault("ui", {})["locale"] = chosen
    print_success(t("language.saved"))
