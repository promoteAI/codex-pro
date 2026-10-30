# tests/test_channel_config_fields.py
"""Regression guard: every ``config.<attr>`` accessed by a channel
implementation must be declared on the corresponding Pydantic config model.

Background: the channels schema was once split into a package
(``schema_defs/channels/``) while a stale monolith module
(``schema_defs/channels.py``) still existed. Python package shadowing made
the monolith unreachable dead code, and the split silently dropped ~20
fields. Because ``codex_pro/channels/base.py`` reads ``allow_from`` via
``getattr(self.config, "allow_from", [])``, missing fields degraded
silently (allowlist disabled) or crashed at runtime (``AttributeError`` on
``use_ssl`` etc.). This test scans channel sources for attribute accesses
and asserts each one exists on the matching model.
"""
from __future__ import annotations

import re
from pathlib import Path

from codex_pro.config.schema import ChannelsConfig

_CHANNELS_DIR = Path(__file__).resolve().parent.parent / "codex_pro" / "channels"

# Channel implementation file -> attribute name on ChannelsConfig.
# ``manager.py`` operates on ChannelsConfig itself.
_CHANNEL_CONFIG_MAP: dict[str, str | None] = {
    "telegram.py": "telegram",
    "discord.py": "discord",
    "slack.py": "slack",
    "dingtalk.py": "dingtalk",
    "feishu.py": "feishu",
    "wecom.py": "wecom",
    "weixin.py": "weixin",
    "qqbot.py": "qqbot",
    "matrix.py": "matrix",
    "whatsapp.py": "whatsapp",
    "email.py": "email",
    "webhook.py": "webhook",
    "cli.py": "cli",
    "cron.py": "cron",
    "manager.py": None,
}

_ACCESS_RE = re.compile(r"\bconfig\.([a-z_][a-z0-9_]*)")


def _iter_accesses(path: Path) -> list[str]:
    attrs: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith(("from ", "import ")):
            continue
        for match in _ACCESS_RE.finditer(stripped):
            attrs.append(match.group(1))
    return attrs


def test_channel_config_accesses_exist_on_model():
    missing: list[tuple[str, str]] = []
    channels_cfg = ChannelsConfig()
    for filename, key in _CHANNEL_CONFIG_MAP.items():
        path = _CHANNELS_DIR / filename
        assert path.exists(), f"channel file missing: {filename}"
        model = channels_cfg if key is None else getattr(channels_cfg, key)
        for attr in _iter_accesses(path):
            if attr not in type(model).model_fields:
                missing.append((filename, attr))
    assert not missing, f"通道实现访问了 schema 中不存在的 config 字段: {missing}"


def test_allow_from_declared_on_all_user_facing_channels():
    """allow_from is read via getattr in channels/base.py, so a missing field
    silently disables the allowlist instead of failing loudly."""
    channels_cfg = ChannelsConfig()
    for key in ("telegram", "discord", "slack", "whatsapp", "weixin",
                "qqbot", "dingtalk", "email"):
        model = getattr(channels_cfg, key)
        assert "allow_from" in type(model).model_fields, f"channels.{key} 缺少 allow_from"


def test_invented_fields_removed():
    """Fields invented during the schema split that no code, test, or doc
    uses must not come back."""
    channels_cfg = ChannelsConfig()
    invented = [
        ("webhook", "endpoint"),
        ("slack", "channel"),
        ("cli", "welcome_message"),
        ("cron", "schedule"),
    ]
    for key, attr in invented:
        model = getattr(channels_cfg, key)
        assert attr not in type(model).model_fields, f"channels.{key}.{attr} 应保持移除"
