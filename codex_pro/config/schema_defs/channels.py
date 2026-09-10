"""Codex Pro configuration schema."""

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

class WebhookChannelConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:362",
            "desc_zh": "是否启用 Webhook 通道",
            "desc_en": "Enable the webhook channel",
        },
    )
    host: str = Field(
        default="0.0.0.0",
        json_schema_extra={
            "status": "effective", "ref": "channels/webhook.py:34",
            "desc_zh": "Webhook 服务监听地址",
            "desc_en": "Webhook server bind address",
        },
    )
    port: int = Field(
        default=8080,
        json_schema_extra={
            "status": "effective", "ref": "channels/webhook.py:34",
            "desc_zh": "Webhook 服务监听端口",
            "desc_en": "Webhook server listen port",
        },
    )
    secret: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/webhook.py:55",
            "desc_zh": "校验入站请求签名的密钥",
            "desc_en": "Secret used to verify inbound request signatures",
        },
    )
    path: str = Field(
        default="/webhook",
        json_schema_extra={
            "status": "effective", "ref": "channels/webhook.py:30",
            "desc_zh": "Webhook 接收路径",
            "desc_en": "HTTP path on which webhooks are received",
        },
    )
    max_pending: int = Field(
        default=1000,
        json_schema_extra={
            "status": "effective", "ref": "channels/webhook.py:93",
            "desc_zh": "待处理 webhook 请求队列上限",
            "desc_en": "Maximum number of pending webhook requests queued",
        },
    )

class CLIChannelConfig(_Base):
    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:362",
            "desc_zh": "是否启用命令行通道",
            "desc_en": "Enable the CLI channel",
        },
    )

class CronChannelConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:362",
            "desc_zh": "是否启用定时任务通道",
            "desc_en": "Enable the cron channel",
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
            "status": "effective", "ref": "channels/slack.py:29",
            "desc_zh": "Slack bot token(xoxb-)",
            "desc_en": "Slack bot token (xoxb-)",
        },
    )
    app_token: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/slack.py:30",
            "desc_zh": "Slack app-level token(xapp-),用于 Socket 模式",
            "desc_en": "Slack app-level token (xapp-) for Socket Mode",
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
            "status": "effective", "ref": "channels/whatsapp.py:24",
            "desc_zh": "WhatsApp webhook 验证 token",
            "desc_en": "WhatsApp webhook verification token",
        },
    )
    access_token: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/whatsapp.py:25",
            "desc_zh": "WhatsApp Cloud API 访问令牌",
            "desc_en": "WhatsApp Cloud API access token",
        },
    )
    phone_number_id: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/whatsapp.py:26",
            "desc_zh": "WhatsApp 发送号码 ID",
            "desc_en": "WhatsApp phone number ID used for sending",
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

class WeixinChannelConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:362",
            "desc_zh": "是否启用微信(个人客服)通道",
            "desc_en": "Enable the Weixin channel",
        },
    )
    account_id: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/weixin.py:306",
            "desc_zh": "微信客服账号 ID",
            "desc_en": "Weixin customer-service account ID",
        },
    )
    token: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/weixin.py:307",
            "desc_zh": "微信接入鉴权 token",
            "desc_en": "Weixin access authentication token",
        },
    )
    base_url: str = Field(
        default="https://ilinkai.weixin.qq.com",
        json_schema_extra={
            "status": "effective", "ref": "channels/weixin.py:308",
            "desc_zh": "微信 API 基础地址",
            "desc_en": "Weixin API base URL",
        },
    )
    cdn_base_url: str = Field(
        default="https://novac2c.cdn.weixin.qq.com/c2c",
        json_schema_extra={
            "status": "effective", "ref": "channels/weixin.py:309",
            "desc_zh": "微信媒体 CDN 基础地址",
            "desc_en": "Weixin media CDN base URL",
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
    dm_policy: str = Field(
        default="open",
        json_schema_extra={
            "status": "effective", "ref": "channels/weixin.py:310",
            "desc_zh": "私聊响应策略",
            "desc_en": "Direct-message reply policy",
        },
    )
    data_dir: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/weixin.py:311",
            "desc_zh": "微信通道本地数据目录",
            "desc_en": "Local data directory for the Weixin channel",
        },
    )
    typing_indicator: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "channels/weixin.py",
            "desc_zh": "处理消息期间是否向对方下发“对方正在输入”状态",
            "desc_en": "Send a typing indicator to the user while a message is being processed",
        },
    )

class QQBotChannelConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:362",
            "desc_zh": "是否启用 QQ 机器人通道",
            "desc_en": "Enable the QQ bot channel",
        },
    )
    app_id: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/qqbot.py:85",
            "desc_zh": "QQ 机器人 AppID",
            "desc_en": "QQ bot AppID",
        },
    )
    app_secret: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/qqbot.py:86",
            "desc_zh": "QQ 机器人 AppSecret",
            "desc_en": "QQ bot AppSecret",
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
    sandbox: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "channels/qqbot.py:87",
            "desc_zh": "是否使用 QQ 沙箱环境",
            "desc_en": "Use the QQ sandbox environment",
        },
    )
    markdown_support: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "channels/qqbot.py:88",
            "desc_zh": "是否以 QQ 原生 Markdown(msg_type=2)发送并保留加粗/代码等行内标记。"
                       "默认开启;若机器人未开通原生 Markdown 权限,首条消息会被拒并自动降级为"
                       "纯文本重发,该会话后续对该目标直接走纯文本(24 小时后重新探测)。"
                       "无论开关如何,表格/标题/分隔线都会降级为可读纯文本。关闭则始终发纯文本",
            "desc_en": "Send as QQ native Markdown (msg_type=2) and keep inline markers "
                       "like bold/code. On by default; if the bot lacks native Markdown "
                       "permission, the first message is rejected and auto-retried as plain "
                       "text, and later messages to that target skip markdown (re-probed "
                       "after 24h). Tables/headings/HR are downgraded to readable plain text "
                       "regardless. When off, always sends plain text",
        },
    )
    media_enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "channels/qqbot.py:107",
            "desc_zh": "是否启用媒体(图片/文件)收发",
            "desc_en": "Enable media (image/file) sending and receiving",
        },
    )
    media_max_file_size_mb: int = Field(
        default=20,
        json_schema_extra={
            "status": "effective", "ref": "channels/qqbot.py:109",
            "desc_zh": "媒体上传单文件大小上限(MB)",
            "desc_en": "Maximum size per uploaded media file (MB)",
        },
    )
    media_upload_cache_size: int = Field(
        default=500,
        json_schema_extra={
            "status": "effective", "ref": "channels/qqbot.py:111",
            "desc_zh": "媒体上传结果缓存条目上限",
            "desc_en": "Maximum number of cached media upload results",
        },
    )
    media_parse_tags: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "channels/qqbot.py:108",
            "desc_zh": "是否解析消息中的媒体标签",
            "desc_en": "Parse media tags embedded in messages",
        },
    )

class FeishuChannelConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:362",
            "desc_zh": "是否启用飞书通道",
            "desc_en": "Enable the Feishu channel",
        },
    )
    app_id: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/feishu.py:27",
            "desc_zh": "飞书应用 App ID",
            "desc_en": "Feishu app ID",
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
            "status": "effective", "ref": "channels/dingtalk.py:30",
            "desc_zh": "钉钉应用 AppKey",
            "desc_en": "DingTalk app key",
        },
    )
    app_secret: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/dingtalk.py:31",
            "desc_zh": "钉钉应用 AppSecret",
            "desc_en": "DingTalk app secret",
        },
    )
    robot_code: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/dingtalk.py:32",
            "desc_zh": "钉钉机器人编码",
            "desc_en": "DingTalk robot code",
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

class EmailChannelConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py:362",
            "desc_zh": "是否启用邮件通道",
            "desc_en": "Enable the email channel",
        },
    )
    imap_host: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/email.py:100",
            "desc_zh": "收信 IMAP 服务器地址",
            "desc_en": "IMAP server host for receiving mail",
        },
    )
    imap_port: int = Field(
        default=993,
        json_schema_extra={
            "status": "effective", "ref": "channels/email.py:100",
            "desc_zh": "收信 IMAP 服务器端口",
            "desc_en": "IMAP server port for receiving mail",
        },
    )
    smtp_host: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/email.py:68",
            "desc_zh": "发信 SMTP 服务器地址",
            "desc_en": "SMTP server host for sending mail",
        },
    )
    smtp_port: int = Field(
        default=465,
        json_schema_extra={
            "status": "effective", "ref": "channels/email.py:68",
            "desc_zh": "发信 SMTP 服务器端口",
            "desc_en": "SMTP server port for sending mail",
        },
    )
    username: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/email.py:64",
            "desc_zh": "邮箱登录用户名",
            "desc_en": "Mailbox login username",
        },
    )
    password: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/email.py:69",
            "desc_zh": "邮箱登录密码或授权码",
            "desc_en": "Mailbox login password or app token",
        },
    )
    use_ssl: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "channels/email.py:67",
            "desc_zh": "是否使用 SSL 连接邮件服务器",
            "desc_en": "Use SSL when connecting to mail servers",
        },
    )
    poll_interval_seconds: int = Field(
        default=30,
        json_schema_extra={
            "status": "effective", "ref": "channels/email.py:94",
            "desc_zh": "轮询新邮件的间隔(秒)",
            "desc_en": "Interval between new-mail polls (seconds)",
        },
    )
    allow_from: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "channels/email.py:118",
            "desc_zh": "允许交互的发件人邮箱白名单(空为不限制)",
            "desc_en": "Allowlist of sender addresses permitted to interact (empty = all)",
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
            "status": "effective", "ref": "channels/wecom.py:26",
            "desc_zh": "企业微信企业 ID",
            "desc_en": "WeCom corporation ID",
        },
    )
    agent_id: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/wecom.py:27",
            "desc_zh": "企业微信应用 AgentId",
            "desc_en": "WeCom application AgentId",
        },
    )
    secret: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/wecom.py:28",
            "desc_zh": "企业微信应用 Secret",
            "desc_en": "WeCom application secret",
        },
    )
    token: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/wecom.py:29",
            "desc_zh": "企业微信回调校验 token",
            "desc_en": "WeCom callback verification token",
        },
    )
    encoding_aes_key: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/wecom.py:87",
            "desc_zh": "企业微信加密回调的 EncodingAESKey,留空则为明文模式",
            "desc_en": "EncodingAESKey for WeCom encrypted callbacks; empty means plaintext mode",
        },
    )
    webhook_path: str = Field(
        default="/wecom",
        json_schema_extra={
            "status": "effective", "ref": "channels/wecom.py:39",
            "desc_zh": "企业微信事件接收路径",
            "desc_en": "HTTP path on which WeCom events are received",
        },
    )
    host: str = Field(
        default="0.0.0.0",
        json_schema_extra={
            "status": "effective", "ref": "channels/wecom.py:44",
            "desc_zh": "企业微信服务监听地址",
            "desc_en": "WeCom server bind address",
        },
    )
    port: int = Field(
        default=8084,
        json_schema_extra={
            "status": "effective", "ref": "channels/wecom.py:44",
            "desc_zh": "企业微信服务监听端口",
            "desc_en": "WeCom server listen port",
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
            "status": "effective", "ref": "channels/matrix.py:27",
            "desc_zh": "Matrix homeserver 地址",
            "desc_en": "Matrix homeserver URL",
        },
    )
    user_id: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/matrix.py:28",
            "desc_zh": "Matrix 机器人用户 ID",
            "desc_en": "Matrix bot user ID",
        },
    )
    access_token: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "channels/matrix.py:38",
            "desc_zh": "Matrix 访问令牌",
            "desc_en": "Matrix access token",
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

class ChannelsConfig(_Base):
    telegram: TelegramChannelConfig = Field(default_factory=TelegramChannelConfig)
    discord: DiscordChannelConfig = Field(default_factory=DiscordChannelConfig)
    webhook: WebhookChannelConfig = Field(default_factory=WebhookChannelConfig)
    cli: CLIChannelConfig = Field(default_factory=CLIChannelConfig)
    cron: CronChannelConfig = Field(default_factory=CronChannelConfig)
    slack: SlackChannelConfig = Field(default_factory=SlackChannelConfig)
    whatsapp: WhatsAppChannelConfig = Field(default_factory=WhatsAppChannelConfig)
    weixin: WeixinChannelConfig = Field(default_factory=WeixinChannelConfig)
    qqbot: QQBotChannelConfig = Field(default_factory=QQBotChannelConfig)
    feishu: FeishuChannelConfig = Field(default_factory=FeishuChannelConfig)
    dingtalk: DingTalkChannelConfig = Field(default_factory=DingTalkChannelConfig)
    email: EmailChannelConfig = Field(default_factory=EmailChannelConfig)
    wecom: WeComChannelConfig = Field(default_factory=WeComChannelConfig)
    matrix: MatrixChannelConfig = Field(default_factory=MatrixChannelConfig)
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
    # The stream_flush_* / stream_paragraph_mode defaults above are tuned for IM
    # channels, where every incremental update costs an edit API call and risks
    # rate limits. Local channels (cli / gateway websocket) have no such budget:
    # frames are cheap and the TUI redraws the whole block anyway, so they get
    # their own low-latency tier below. Setting stream_local_flush_chars to 0
    # makes local channels fall back to the shared values above.
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
    # Channels listed here stream the model's text as it arrives, even on turns
    # that may end in a tool call. If such a turn does call a tool, the streamed
    # draft ("let me check ...") is retracted and the block redrawn. Only list
    # channels that can visually REPLACE what they already showed.
    #
    # gateway:cli qualifies: the TUI keeps a reply widget per turn and rewrites it
    # via set_markdown (see cli/tui/bridge.py, on_user_reply_reset). The plain
    # "cli" channel does NOT — it prints straight to
    # stdout and cannot unprint, so a retraction there would leave the draft on
    # screen above the answer. IM channels are excluded too: editing is possible
    # but each edit burns API budget. Empty list = buffer everywhere, i.e. the
    # pre-existing conservative behaviour.
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

# ── Provider configs ─────────────────────────────────────────────────────────

