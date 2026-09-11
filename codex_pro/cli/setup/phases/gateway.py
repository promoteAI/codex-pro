"""Gateway setup phase — Section 8 of the setup wizard."""
from __future__ import annotations

from codex_pro.cli.setup import (
    print_info, print_success, print_warning,
    _print_section_header, _choice, _ensure_dict,
    is_loopback_bind, normalize_host_entries, normalize_origin_entries,
    _bind_label, _primary_lan_address, _direct_http_origin,
    t, ui,
)


def _ask_allowed_hosts(auth: dict, bind_host: str) -> None:
    """Ask for the Host allowlist on a non-loopback bind."""
    existing = normalize_host_entries(
        auth.get("allowed_hosts") or auth.get("allowedHosts") or []
    )
    if existing:
        suggestion = ", ".join(existing)
    elif bind_host in ("", "0.0.0.0", "::"):
        suggestion = _primary_lan_address()
    else:
        suggestion = bind_host

    raw = ui.text(t("gateway.allowed_hosts"), default=suggestion)
    hosts = normalize_host_entries(str(raw).replace("\n", ",").split(","))

    auth.pop("allowedHosts", None)
    if hosts:
        auth["allowed_hosts"] = hosts
        print_info(t("gateway.allowed_hosts_set", hosts=", ".join(hosts)))
    else:
        auth.pop("allowed_hosts", None)
        print_warning(t("gateway.allowed_hosts_empty_warn", host=bind_host))


def _ask_allowed_origins(auth: dict, port: int) -> None:
    existing = normalize_origin_entries(auth.get("allowed_origins") or [])
    if existing:
        suggestion = ", ".join(existing)
    else:
        suggestion = ""
    raw = ui.text(t("gateway.allowed_origins"), default=suggestion)
    origins = normalize_origin_entries(str(raw).replace("\n", ",").split(","))
    if origins:
        auth["allowed_origins"] = origins


def _reconcile_loopback_allowed_hosts(auth: dict) -> None:
    allowed = normalize_host_entries(auth.get("allowed_hosts") or [])
    if not allowed and auth.get("mode") == "open":
        auth["allowed_hosts"] = ["127.0.0.1", "::1"]


def setup_gateway(config: dict) -> None:
    _print_section_header("gateway")
    print_info(t("gateway.intro"))
    print()

    gw_cfg = _ensure_dict(config, "gateway")
    enabled = ui.confirm(t("gateway.enabled"), default=bool(gw_cfg.get("enabled", False)))
    gw_cfg["enabled"] = enabled
    if not enabled:
        print_info(t("gateway.disabled"))
        return

    host = ui.text(t("gateway.host"), default=gw_cfg.get("host") or "127.0.0.1").strip()
    port_str = ui.text(t("gateway.port"), default=str(gw_cfg.get("port") or 58123)).strip()
    try:
        port = int(port_str)
    except ValueError:
        port = 58123
    gw_cfg["host"] = host
    gw_cfg["port"] = port

    if host in ("", "0.0.0.0", "::"):
        print_info(t("gateway.wildcard_bind_hint", host=host or "0.0.0.0"))
        _ask_allowed_hosts(gw_cfg.setdefault("auth", {}), host)
    else:
        _reconcile_loopback_allowed_hosts(gw_cfg.setdefault("auth", {}))

    if gw_cfg.get("auth"):
        _ask_allowed_origins(gw_cfg["auth"], port)

    print_success(t("gateway.saved", host=host, port=port))
