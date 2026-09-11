"""Security setup phase — Section 9 of the setup wizard."""
from __future__ import annotations

from codex_pro.cli.setup import (
    print_info, print_success, print_warning,
    _print_section_header, _choice, _ensure_dict,
    is_loopback_bind, t,
)


def setup_security(config: dict) -> None:
    _print_section_header("security")
    print_info(t("security.intro"))
    print()

    sec = _ensure_dict(config, "security")
    gateway_enabled = bool((config.get("gateway", {}) or {}).get("enabled"))

    if not gateway_enabled:
        sec["profile"] = "personal_cli"
        print_info(t("security.no_gateway"))
        print_success(t("security.saved", profile=sec["profile"]))
        return

    print_info(t("security.gateway_intro"))
    deploy_keys = ["personal_cli", "public_gateway"]
    deploy_labels = [t("security.deploy_personal"), t("security.deploy_public")]
    host = str((config.get("gateway", {}) or {}).get("host") or "127.0.0.1").strip()
    recommended = "personal_cli" if is_loopback_bind(host) else "public_gateway"
    cur = recommended
    default_idx = deploy_keys.index(cur) if cur in deploy_keys else 0
    d_idx = _choice(t("security.deployment"), deploy_labels, default=default_idx)
    sec["profile"] = deploy_keys[d_idx]

    if sec["profile"] == "public_gateway":
        print_warning(t("security.public_hint"))
    else:
        print_info(t("security.personal_hint"))

    print_success(t("security.saved", profile=sec["profile"]))
