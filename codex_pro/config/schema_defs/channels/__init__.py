"""Channel configuration schemas — extracted from codex_pro.config.schema_defs.channels."""
from __future__ import annotations

from codex_pro.config.schema_defs.channels.messaging import (
    TelegramChannelConfig,
    DiscordChannelConfig,
    SlackChannelConfig,
    FeishuChannelConfig,
    DingTalkChannelConfig,
    MatrixChannelConfig,
    QQBotChannelConfig,
    WhatsAppChannelConfig,
    WeComChannelConfig,
    CLIChannelConfig,
    CronChannelConfig,
    WebhookChannelConfig,
)
from codex_pro.config.schema_defs.channels.social import (
    WeixinChannelConfig,
    EmailChannelConfig,
)
from codex_pro.config.schema_defs.channels.messaging import ChannelsConfig

__all__ = [
    "TelegramChannelConfig",
    "DiscordChannelConfig",
    "SlackChannelConfig",
    "FeishuChannelConfig",
    "DingTalkChannelConfig",
    "MatrixChannelConfig",
    "QQBotChannelConfig",
    "WhatsAppChannelConfig",
    "WeComChannelConfig",
    "CLIChannelConfig",
    "CronChannelConfig",
    "WebhookChannelConfig",
    "WeixinChannelConfig",
    "EmailChannelConfig",
    "ChannelsConfig",
]
