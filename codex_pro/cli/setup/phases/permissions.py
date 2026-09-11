"""Permissions setup phase — Section 3 of the setup wizard."""
from __future__ import annotations

from codex_pro.cli.setup import (
    print_info, print_success, print_warning,
    _print_section_header, _choice, _ensure_dict,
    t,
)


def setup_permissions(config: dict) -> None:
    _print_section_header("permissions")
    print_info(t("permissions.intro"))
    print()

    perm = _ensure_dict(config, "permissions")
    choices = ["smart", "manual", "off"]
    cur = (perm.get("approval", {}) or {}).get("mode", "smart").lower()
    default = choices.index(cur) if cur in choices else 0
    idx = _choice(t("permissions.mode"), choices, default=default)
    perm["approval"] = {"mode": choices[idx]}

    admin_users: list[str] = perm.get("admin_users") or []
    if not isinstance(admin_users, list):
        admin_users = [admin_users] if admin_users else []
    if any(admin_users):
        print_info(t("permissions.admin_users_set", users=", ".join(admin_users)))
    else:
        print_info(t("permissions.no_admin_users"))

    print_success(t("permissions.saved", mode=choices[idx]))
