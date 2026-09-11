"""Messaging channel configs — extracted from channels.py."""
from __future__ import annotations

from typing import Literal

from pydantic import Field
from pydantic.alias_generators import to_camel

from codex_pro.config.schema_defs.channels.base import _Base, TelegramChannelConfig, DiscordChannelConfig
from codex_pro.config.schema_defs.channels.social import WeixinChannelConfig, EmailChannelConfig


class WebhookChannelConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:362",
            "desc_zh": "是否启用 Webhook 通道",
            "desc_en": "Enable the Webhook channel",
        },
    )
    endpoint: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/webhook.py",
            "desc_zh": "Webhook 端点 URL",
            "desc_en": "Webhook endpoint URL",
        },
    )

class CLIChannelConfig(_Base):
    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:362",
            "desc_zh": "是否启用 CLI 通道",
            "desc_en": "Enable the CLI channel",
        },
    )
    welcome_message: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/cli.py",
            "desc_zh": "CLI 欢迎消息",
            "desc_en": "CLI welcome message",
        },
    )

class CronChannelConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:362",
            "desc_zh": "是否启用 Cron 通道",
            "desc_en": "Enable the Cron channel",
        },
    )
    schedule: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/cron.py",
            "desc_zh": "Cron 调度表达式",
            "desc_en": "Cron schedule expression",
        },
    )

class SlackChannelConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:362",
            "desc_zh": "是否启用 Slack 通道",
            "desc_en": "Enable the Slack channel",
        },
    )
    bot_token: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/slack.py:30",
            "desc_zh": "Slack Bot token",
            "desc_en": "Slack bot token",
        },
    )
    app_token: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/slack.py:31",
            "desc_zh": "Slack App token",
            "desc_en": "Slack app token",
        },
    )
    channel: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/slack.py:32",
            "desc_zh": "默认频道",
            "desc_en": "Default channel",
        },
    )
    reactions_enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "channels/slack.py:118",
            "desc_zh": "是否对消息添加表情回应",
            "desc_en": "Whether to add emoji reactions to messages",
        },
    )

class WhatsAppChannelConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:362",
            "desc_zh": "是否启用 WhatsApp 通道",
            "desc_en": "Enable the WhatsApp channel",
        },
    )
    verify_token: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/whatsapp.py",
            "desc_zh": "Webhook verify token",
            "desc_en": "Webhook verify token",
        },
    )
    access_token: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/whatsapp.py",
            "desc_zh": "Cloud API access token",
            "desc_en": "Cloud API access token",
        },
    )
    phone_number_id: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/whatsapp.py",
            "desc_zh": "Phone number ID",
            "desc_en": "Phone number ID",
        },
    )
    webhook_path: str = Field(
        default="/whatsapp",
        json_schema_extra={
            "status": "effective", "ref": "channels/whatsapp.py:35",
            "desc_zh": "WhatsApp webhook 接收路径",
            "desc_en": "HTTP path on which WhatsApp webhooks are received",
        },
    )
    host: str = Field(
        default="0.0.0.0",
        json_schema_extra={
            "status": "effective", "ref": "channels/whatsapp.py:40",
            "desc_zh": "WhatsApp 服务监听地址",
            "desc_en": "WhatsApp server bind address",
        },
    )
    port: int = Field(
        default=8081,
        json_schema_extra={
            "status": "effective", "ref": "channels/whatsapp.py:40",
            "desc_zh": "WhatsApp 服务监听端口",
            "desc_en": "WhatsApp server listen port",
        },
    )
    app_secret: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/whatsapp.py",
            "desc_zh": "WhatsApp App Secret（用于 webhook HMAC 签名验证）",
            "desc_en": "WhatsApp App Secret for webhook HMAC signature verification",
        },
    )
    allow_from: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "channels/base.py:107",
            "desc_zh": "允许交互的用户白名单（空为不限制）",
            "desc_en": "Allowlist of user IDs permitted to interact (empty = all)",
        },
    )
    group_policy: str = Field(
        default="mention",
        json_schema_extra={
            "status": "effective", "ref": "channels/whatsapp.py",
            "desc_zh": "群聊响应策略：all=响应所有消息，mention=仅响应@机器人",
            "desc_en": "Group response policy: all=respond to all, mention=only respond when mentioned",
        },
    )

class QQBotChannelConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:362",
            "desc_zh": "是否启用 QQ Bot 通道",
            "desc_en": "Enable the QQ Bot channel",
        },
    )
    app_id: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/qqbot.py",
            "desc_zh": "QQ Bot App ID",
            "desc_en": "QQ Bot App ID",
        },
    )
    app_secret: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/qqbot.py",
            "desc_zh": "QQ Bot App Secret",
            "desc_en": "QQ Bot App Secret",
        },
    )

class FeishuChannelConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:362",
            "desc_zh": "是否启用飞书通道",
            "desc_en": "Enable the Feishu/Lark channel",
        },
    )
    app_id: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/feishu.py",
            "desc_zh": "飞书 App ID",
            "desc_en": "Feishu/Lark App ID",
        },
    )
    app_secret: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/feishu.py:28",
            "desc_zh": "飞书应用 App Secret",
            "desc_en": "Feishu app secret",
        },
    )
    verification_token: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/feishu.py:29",
            "desc_zh": "飞书事件回调验证 token",
            "desc_en": "Feishu event callback verification token",
        },
    )
    encryption_key: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/feishu.py:30",
            "desc_zh": "飞书事件加密密钥",
            "desc_en": "Feishu event encryption key",
        },
    )
    webhook_path: str = Field(
        default="/feishu",
        json_schema_extra={
            "status": "effective", "ref": "channels/feishu.py:41",
            "desc_zh": "飞书事件接收路径",
            "desc_en": "HTTP path on which Feishu events are received",
        },
    )
    host: str = Field(
        default="0.0.0.0",
        json_schema_extra={
            "status": "effective", "ref": "channels/feishu.py:45",
            "desc_zh": "飞书服务监听地址",
            "desc_en": "Feishu server bind address",
        },
    )
    port: int = Field(
        default=8083,
        json_schema_extra={
            "status": "effective", "ref": "channels/feishu.py:45",
            "desc_zh": "飞书服务监听端口",
            "desc_en": "Feishu server listen port",
        },
    )
    group_policy: str = Field(
        default="mention",
        json_schema_extra={
            "status": "effective", "ref": "channels/feishu.py:135",
            "desc_zh": "群聊触发策略: mention=仅被@时响应, all=响应所有消息",
            "desc_en": "Group trigger policy: mention=respond only when @mentioned, all=respond to every message",
        },
    )
    bot_open_id: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/feishu.py:32",
            "desc_zh": "机器人自身的 open_id，用于群聊 @mention 过滤",
            "desc_en": "Bot's own open_id for group chat mention filtering",
        },
    )

class DingTalkChannelConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:362",
            "desc_zh": "是否启用钉钉通道",
            "desc_en": "Enable the DingTalk channel",
        },
    )
    app_key: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/dingtalk.py",
            "desc_zh": "钉钉 App Key",
            "desc_en": "DingTalk App Key",
        },
    )
    app_secret: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/dingtalk.py",
            "desc_zh": "钉钉 App Secret",
            "desc_en": "DingTalk App Secret",
        },
    )
    robot_code: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/dingtalk.py",
            "desc_zh": "钉钉 Robot Code",
            "desc_en": "DingTalk Robot Code",
        },
    )

class WeComChannelConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:362",
            "desc_zh": "是否启用企业微信通道",
            "desc_en": "Enable the WeCom channel",
        },
    )
    corp_id: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/wecom.py",
            "desc_zh": "企业微信 Corp ID",
            "desc_en": "WeCom Corp ID",
        },
    )
    agent_id: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/wecom.py",
            "desc_zh": "企业微信 Agent ID",
            "desc_en": "WeCom Agent ID",
        },
    )
    secret: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/wecom.py",
            "desc_zh": "企业微信 Secret",
            "desc_en": "WeCom Secret",
        },
    )

class MatrixChannelConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:362",
            "desc_zh": "是否启用 Matrix 通道",
            "desc_en": "Enable the Matrix channel",
        },
    )
    homeserver: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/matrix.py",
            "desc_zh": "Matrix Homeserver URL",
            "desc_en": "Matrix Homeserver URL",
        },
    )
    user_id: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/matrix.py",
            "desc_zh": "Matrix User ID",
            "desc_en": "Matrix User ID",
        },
    )
    access_token: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/matrix.py",
            "desc_zh": "Matrix Access Token",
            "desc_en": "Matrix Access Token",
        },
    )
    allow_rooms: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "channels/matrix.py:30",
            "desc_zh": "允许响应的房间白名单(空为不限制)",
            "desc_en": "Allowlist of room IDs the bot responds in (empty = all)",
        },
    )
    reactions_enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "channels/matrix.py:100",
            "desc_zh": "是否对消息添加表情回应",
            "desc_en": "Whether to add emoji reactions to messages",
        },
    )

# ── Channels aggregate config ────────────────────────────────────────────────

class ChannelsConfig(_Base):
    telegram: TelegramChannelConfig = Field(default_factory=TelegramChannelConfig)
    discord: DiscordChannelConfig = Field(default_factory=DiscordChannelConfig)
    slack: SlackChannelConfig = Field(default_factory=SlackChannelConfig)
    dingtalk: DingTalkChannelConfig = Field(default_factory=DingTalkChannelConfig)
    feishu: FeishuChannelConfig = Field(default_factory=FeishuChannelConfig)
    wecom: WeComChannelConfig = Field(default_factory=WeComChannelConfig)
    weixin: WeixinChannelConfig = Field(default_factory=WeixinChannelConfig)
    qqbot: QQBotChannelConfig = Field(default_factory=QQBotChannelConfig)
    matrix: MatrixChannelConfig = Field(default_factory=MatrixChannelConfig)
    whatsapp: WhatsAppChannelConfig = Field(default_factory=WhatsAppChannelConfig)
    email: EmailChannelConfig = Field(default_factory=EmailChannelConfig)
    webhook: WebhookChannelConfig = Field(default_factory=WebhookChannelConfig)
    cli: CLIChannelConfig = Field(default_factory=CLIChannelConfig)
    cron: CronChannelConfig = Field(default_factory=CronChannelConfig)

    send_progress: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:88",
            "desc_zh": "是否向用户推送处理进度提示",
            "desc_en": "Send progress updates to the user",
        },
    )
    send_tool_hints: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:89",
            "desc_zh": "是否推送工具调用提示",
            "desc_en": "Send tool-invocation hints to the user",
        },
    )
    stream_channels: list[str] = Field(
        default_factory=lambda: ["cli", "telegram", "discord", "slack", "gateway:*"],
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:815",
            "desc_zh": "启用流式增量回复的通道列表",
            "desc_en": "Channels for which streaming incremental replies are enabled",
        },
    )
    stream_flush_chars: int = Field(
        default=180,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:683",
            "desc_zh": "流式回复累计多少字符后推送一段",
            "desc_en": "Character count that triggers a streaming flush",
        },
    )
    stream_flush_interval_ms: int = Field(
        default=1500,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:684",
            "desc_zh": "流式回复推送的最大时间间隔(毫秒)",
            "desc_en": "Maximum interval between streaming flushes (ms)",
        },
    )
    stream_paragraph_mode: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:685",
            "desc_zh": "是否按段落边界切分流式推送",
            "desc_en": "Flush streaming output on paragraph boundaries",
        },
    )
    stream_local_flush_chars: int = Field(
        default=24,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:1516",
            "desc_zh": "本地通道(cli/gateway)流式推送的字符阈值,0 表示复用通用配置",
            "desc_en": "Flush threshold for local channels (cli/gateway); 0 reuses the shared value",
        },
    )
    stream_local_flush_interval_ms: int = Field(
        default=100,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:1516",
            "desc_zh": "本地通道(cli/gateway)流式推送的最大时间间隔(毫秒)",
            "desc_en": "Maximum interval between flushes for local channels (cli/gateway), in ms",
        },
    )
    stream_local_channels: list[str] = Field(
        default_factory=lambda: ["cli", "gateway:*"],
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:1516",
            "desc_zh": "使用本地低延迟流式档位的通道列表(支持 prefix:* 通配)",
            "desc_en": "Channels that use the local low-latency streaming tier (supports prefix:*)",
        },
    )
    stream_optimistic_channels: list[str] = Field(
        default_factory=lambda: ["gateway:cli"],
        json_schema_extra={
            "status": "effective", "ref": "agent/pipeline/inference_stage.py:659",
            "desc_zh": "允许乐观流式(工具前草稿先发后撤回)的通道列表;仅限能就地重绘的通道",
            "desc_en": "Channels allowed to stream optimistically (pre-tool draft sent then retracted); only channels that can redraw in place",
        },
    )
    transcription_api_key: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:369",
            "desc_zh": "语音转写服务的 API key",
            "desc_en": "API key for the voice transcription service",
        },
    )

    # Legacy field name alias
    @property
    def channels(self) -> dict[str, dict]:
        return {k: v.model_dump() for k, v in self}
