"""Base channel config classes — extracted from channels.py."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class _Base(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

# ── Channel configs ──────────────────────────────────────────────────────────

class TelegramChannelConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:362",
            "desc_zh": "是否启用 Telegram 通道",
            "desc_en": "Enable the Telegram channel",
        },
    )
    token: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/telegram.py:30",
            "desc_zh": "Telegram Bot API token",
            "desc_en": "Telegram bot API token",
        },
    )
    allow_from: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "channels/base.py:107",
            "desc_zh": "允许与机器人交互的用户白名单(空为不限制)",
            "desc_en": "Allowlist of user IDs permitted to interact (empty = all)",
        },
    )
    proxy: str | None = Field(
        default=None,
        json_schema_extra={
            "status": "effective", "ref": "channels/telegram.py:41",
            "desc_zh": "访问 Telegram API 的代理地址",
            "desc_en": "Proxy URL used to reach the Telegram API",
        },
    )
    group_policy: Literal["open", "mention"] = Field(
        default="mention",
        json_schema_extra={
            "status": "effective", "ref": "channels/telegram.py:35",
            "desc_zh": "群聊响应策略:open 全部响应,mention 仅被@时响应",
            "desc_en": "Group reply policy: open = all messages, mention = only when @-mentioned",
        },
    )
    reactions_enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "channels/telegram.py:109",
            "desc_zh": "是否对消息添加表情回应",
            "desc_en": "Whether to add emoji reactions to messages",
        },
    )
    data_dir: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/telegram.py:_offset_path",
            "desc_zh": "Telegram 状态持久化目录(存 long-poll offset,防重启后重复拉取);缺省 ~/.codex-pro/data/telegram",
            "desc_en": "Directory persisting Telegram state (long-poll offset, prevents re-fetch after restart); defaults to ~/.codex-pro/data/telegram",
        },
    )

class DiscordChannelConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:362",
            "desc_zh": "是否启用 Discord 通道",
            "desc_en": "Enable the Discord channel",
        },
    )
    token: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/discord.py:33",
            "desc_zh": "Discord Bot token",
            "desc_en": "Discord bot token",
        },
    )
    allow_from: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "channels/base.py:107",
            "desc_zh": "允许与机器人交互的用户白名单(空为不限制)",
            "desc_en": "Allowlist of user IDs permitted to interact (empty = all)",
        },
    )
    group_policy: Literal["open", "mention"] = Field(
        default="mention",
        json_schema_extra={
            "status": "effective", "ref": "channels/discord.py:34",
            "desc_zh": "群聊响应策略:open 全部响应,mention 仅被@时响应",
            "desc_en": "Group reply policy: open = all messages, mention = only when @-mentioned",
        },
    )
    reactions_enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "channels/discord.py:149",
            "desc_zh": "是否对消息添加表情回应",
            "desc_en": "Whether to add emoji reactions to messages",
        },
    )
