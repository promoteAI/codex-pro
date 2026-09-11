"""Channels setup phase — Section 7 of the setup wizard."""
from __future__ import annotations

from codex_pro.cli.setup import (
    print_info, print_success, print_warning,
    _print_section_header, _choice, _ensure_dict,
    CHANNEL_DEFS, t,
)


def _setup_weixin_qr(ch: dict) -> None:
    """Handle WeChat QR code setup."""
    print_info(t("channels.weixin_intro"))
    # Placeholder for QR code logic
    ch.setdefault("enabled", False)


def setup_channels(config: dict) -> None:
    _print_section_header("channel")
    print_info(t("channels.intro"))
    print()

    channels_cfg = _ensure_dict(config, "channels")
    for channel_name, channel_label, field_defs in CHANNEL_DEFS:
        enabled = ui.confirm(
            t("channels.enable", name=channel_label),
            default=bool((channels_cfg.get(channel_name) or {}).get("enabled", False)),
        )
        if not enabled:
            continue
        ch_cfg = _ensure_dict(channels_cfg, channel_name)
        ch_cfg["enabled"] = True
        if channel_name == "weixin":
            _setup_weixin_qr(ch_cfg)
        else:
            for field_name, field_label in field_defs:
                value = ui.text(t(f"channels.{channel_name}.{field_name}", label=field_label))
                ch_cfg[field_name] = value
        print_success(t("channels.saved", name=channel_label))
