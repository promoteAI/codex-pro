"""Social channel configs — extracted from channels.py."""
from __future__ import annotations

from pydantic import Field

from codex_pro.config.schema_defs.channels.base import _Base


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
            "desc_zh": '处理消息期间是否向对方下发"对方正在输入"状态',
            "desc_en": "Send a typing indicator to the user while a message is being processed",
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
