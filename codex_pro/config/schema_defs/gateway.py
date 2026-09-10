"""Codex Pro configuration schema."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

class _Base(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

# ── Channel configs ──────────────────────────────────────────────────────────

class ObservabilityConfig(_Base):
    log_level: str = Field(
        default="INFO",
        json_schema_extra={
            "status": "effective", "ref": "app.py:62",
            "desc_zh": "日志级别",
            "desc_en": "Logging level",
        },
    )
    trace_enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "observability/monitor.py:55",
            "desc_zh": "是否记录执行轨迹(关闭则不写 trace 文件)",
            "desc_en": "Whether to record execution traces (off disables trace files)",
        },
    )
    max_trace_files: int = Field(
        default=500,
        json_schema_extra={
            "status": "effective", "ref": "observability/monitor.py:95",
            "desc_zh": "trace 文件保留数量上限,超出按最旧优先轮转删除;<=0 表示不限制(禁用轮转)",
            "desc_en": "Max retained trace files; oldest are rotated out when exceeded; <=0 disables rotation",
        },
    )
    health_check_interval_seconds: int = Field(
        default=60, ge=1,
        json_schema_extra={
            "status": "effective", "ref": "app.py:198",
            "desc_zh": "健康检查间隔(秒)",
            "desc_en": "Health check interval (seconds)",
        },
    )
    otel_enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:202",
            "desc_zh": "是否启用 OpenTelemetry 指标导出",
            "desc_en": "Enable OpenTelemetry metrics export",
        },
    )
    otel_endpoint: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:206",
            "desc_zh": "OpenTelemetry 导出端点",
            "desc_en": "OpenTelemetry export endpoint",
        },
    )
    otel_service_name: str = Field(
        default="codex-pro",
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:205",
            "desc_zh": "OpenTelemetry 服务名",
            "desc_en": "OpenTelemetry service name",
        },
    )
    otel_export_interval_ms: int = Field(
        default=5000, ge=1,
        json_schema_extra={
            "status": "effective", "ref": "observability/telemetry.py:87",
            "desc_zh": "OpenTelemetry 指标导出间隔(毫秒)",
            "desc_en": "OpenTelemetry metrics export interval (ms)",
        },
    )
    loop_watchdog_enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "observability/loop_watchdog.py:44",
            "desc_zh": "是否启用事件循环看门狗(检测 loop 冻结并自杀重启)",
            "desc_en": "Enable the event-loop watchdog (detects a frozen loop and self-exits for respawn)",
        },
    )
    loop_watchdog_warn_seconds: float = Field(
        default=5.0,
        json_schema_extra={
            "status": "effective", "ref": "observability/loop_watchdog.py:52",
            "desc_zh": "事件循环停滞多少秒后告警并转储线程栈",
            "desc_en": "Seconds of loop stall before warning and dumping thread stacks",
        },
    )
    loop_watchdog_kill_seconds: float = Field(
        default=30.0,
        json_schema_extra={
            "status": "effective", "ref": "observability/loop_watchdog.py:53",
            "desc_zh": "事件循环冻结多少秒后自杀退出以便 supervisor 重启",
            "desc_en": "Seconds of loop freeze before self-exiting for supervisor respawn",
        },
    )
    loop_watchdog_check_interval_seconds: float = Field(
        default=5.0,
        json_schema_extra={
            "status": "effective", "ref": "observability/loop_watchdog.py:54",
            "desc_zh": "看门狗线程检查心跳的间隔(秒)",
            "desc_en": "Interval (s) at which the watchdog thread checks the heartbeat",
        },
    )
    loop_watchdog_max_restarts_per_hour: int = Field(
        default=5,
        json_schema_extra={
            "status": "effective", "ref": "observability/restart_guard.py:26",
            "desc_zh": "一小时内看门狗自杀重启次数上限,超过则熔断不再自杀",
            "desc_en": "Max watchdog self-exits per hour before the circuit breaker suspends restarts",
        },
    )

# ── Compression configs ──────────────────────────────────────────────────────

class CompressionConfig(_Base):
    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/compression/compressor.py:80",
            "desc_zh": "是否启用上下文压缩",
            "desc_en": "Enable context compression",
        },
    )
    trigger_ratio: float = Field(
        default=0.7,
        json_schema_extra={
            "status": "effective", "ref": "agent/compression/compressor.py:46",
            "desc_zh": "上下文占用达到该比例时触发压缩",
            "desc_en": "Context usage ratio that triggers compression",
        },
    )
    tail_budget_ratio: float = Field(
        default=0.4,
        json_schema_extra={
            "status": "effective", "ref": "agent/compression/compressor.py:60",
            "desc_zh": "压缩后保留尾部消息的预算比例",
            "desc_en": "Budget ratio reserved for tail messages after compression",
        },
    )
    head_protect_count: int = Field(
        default=3,
        json_schema_extra={
            "status": "effective", "ref": "agent/compression/compressor.py:59",
            "desc_zh": "压缩时保护不动的头部消息数",
            "desc_en": "Number of head messages protected from compression",
        },
    )
    summary_target_ratio: float = Field(
        default=0.20,
        json_schema_extra={
            "status": "effective", "ref": "agent/compression/compressor.py:69",
            "desc_zh": "摘要相对原文的目标长度比例",
            "desc_en": "Target summary length relative to source",
        },
    )
    summary_min_tokens: int = Field(
        default=2000,
        json_schema_extra={
            "status": "effective", "ref": "agent/compression/compressor.py:70",
            "desc_zh": "摘要最小 token 数",
            "desc_en": "Minimum summary tokens",
        },
    )
    summary_max_tokens: int = Field(
        default=12000,
        json_schema_extra={
            "status": "effective", "ref": "agent/compression/compressor.py:71",
            "desc_zh": "摘要最大 token 数",
            "desc_en": "Maximum summary tokens",
        },
    )
    summary_model: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/compression/compressor.py:67",
            "desc_zh": "生成摘要使用的模型",
            "desc_en": "Model used to generate summaries",
        },
    )
    summary_cooldown_seconds: int = Field(
        default=600,
        json_schema_extra={
            "status": "effective", "ref": "agent/compression/compressor.py:72",
            "desc_zh": "两次压缩之间的冷却时间(秒)",
            "desc_en": "Cooldown between compressions (seconds)",
        },
    )
    tool_pruning_enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/compression/compressor.py:56",
            "desc_zh": "是否启用工具结果剪枝",
            "desc_en": "Enable pruning of tool results",
        },
    )
    tool_pruning_tail_budget_ratio: float = Field(
        default=0.3,
        json_schema_extra={
            "status": "effective", "ref": "agent/compression/compressor.py:53",
            "desc_zh": "工具结果剪枝保留尾部的预算比例",
            "desc_en": "Tail budget ratio retained when pruning tool results",
        },
    )
    max_compression_count: int = Field(
        default=10,
        json_schema_extra={
            "status": "effective", "ref": "agent/compression/compressor.py:169",
            "desc_zh": "单会话最大压缩次数",
            "desc_en": "Maximum compressions per session",
        },
    )

# ── Gateway configs ─────────────────────────────────────────────────────────

class GatewaySessionPolicyConfig(_Base):
    mode: Literal["daily", "idle", "both", "none"] = Field(
        default="idle",
        json_schema_extra={
            "status": "effective", "ref": "gateway/session_policy.py:14",
            "desc_zh": "网关会话重置策略",
            "desc_en": "Gateway session reset policy",
        },
    )
    daily_reset_hour: int = Field(
        default=4,
        json_schema_extra={
            "status": "effective", "ref": "gateway/session_policy.py:15",
            "desc_zh": "每日重置会话的小时(0-23)",
            "desc_en": "Hour of day to reset sessions (0-23)",
        },
    )
    idle_timeout_minutes: int = Field(
        default=1440,
        json_schema_extra={
            "status": "effective", "ref": "gateway/session_policy.py:16",
            "desc_zh": "会话空闲超时(分钟)",
            "desc_en": "Session idle timeout (minutes)",
        },
    )

class GatewayPlatformConfig(_Base):
    rate_limit_rpm: int = Field(
        default=30,
        json_schema_extra={
            "status": "effective", "ref": "gateway/server.py:91",
            "desc_zh": "该平台每分钟请求上限",
            "desc_en": "Per-minute request cap for this platform",
        },
    )

class GatewayAuthConfig(_Base):
    mode: Literal["open", "allowlist", "pairing"] = Field(
        default="allowlist",
        json_schema_extra={
            "status": "effective", "ref": "gateway/auth.py:20",
            "desc_zh": "网关鉴权模式",
            "desc_en": "Gateway authentication mode",
        },
    )
    allowed_users: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "gateway/auth.py:21",
            "desc_zh": "允许访问网关的用户白名单",
            "desc_en": "Allowlist of users permitted to access the gateway",
        },
    )
    admin_users: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "gateway/auth.py:22",
            "desc_zh": "网关管理员用户列表",
            "desc_en": "Gateway administrator users",
        },
    )
    api_tokens: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "gateway/auth.py:23",
            "desc_zh": "网关 API 访问令牌列表",
            "desc_en": "Gateway API access tokens",
        },
    )
    admin_tokens: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "gateway/auth.py:23",
            "desc_zh": "高危管理接口(技能导入安装删除/知识库上传删除)专用令牌；为空时回退到 api_tokens",
            "desc_en": "Tokens required for high-risk admin endpoints (skills import/install/delete and knowledge upload/delete); falls back to api_tokens when empty",
        },
    )
    allowed_origins: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "gateway/auth.py:is_cross_site_browser",
            # 旧文案称"留空则不启用 CSRF 检查",与实际默认行为不符:WS 握手、
            # POST /message 与管理接口走的是默认开启的 is_cross_site_browser,
            # 空白名单下依然拦截明确的跨站浏览器请求(这正是防 CSRF-to-localhost
            # 的那一层)。本项只是这层判定之上的显式放行入口。
            "desc_zh": "浏览器 Origin 白名单(跨站放行入口)；留空不等于关闭 CSRF 防护——WS 握手、POST /message 与管理接口默认即拦截明确的跨站浏览器请求,本项用于额外放行指定 Origin(如 webview、开发用的前端端口);非浏览器客户端始终不受影响",
            "desc_en": "Allowlisted browser Origins (cross-site escape hatch). Empty does NOT disable CSRF protection: the WS handshake, POST /message and the admin endpoints reject explicit cross-site browser requests by default. Use this to additionally permit specific Origins (webviews, a dev frontend port); non-browser clients are always unaffected",
        },
    )
    token_header: str = Field(
        default="X-Codex Pro-Token",
        json_schema_extra={
            "status": "effective", "ref": "gateway/auth.py:24",
            "desc_zh": "携带 API 令牌的请求头名",
            "desc_en": "Request header carrying the API token",
        },
    )
    pairing_ttl_seconds: int = Field(
        default=300,
        json_schema_extra={
            "status": "effective", "ref": "gateway/auth.py:25",
            "desc_zh": "配对模式令牌有效期(秒)",
            "desc_en": "Pairing-mode token time-to-live (seconds)",
        },
    )
    # Host header allowlist that closes the DNS-rebinding loop. The Origin /
    # Host comparison alone cannot stop a rebind: both are attacker-controlled
    # strings the moment DNS resolves to 127.0.0.1. The only authoritative
    # signal is whether the Host matches a name this gateway was intended to be
    # reached on — loopback addresses when bound locally, the proxy domain when
    # behind one. Empty defers to the default for the bind address (loopback
    # addresses when bound to loopback, none when bound to 0.0.0.0/::).
    #
    # Entries are normalized before comparison (gateway/host_rules.py): case,
    # a trailing :port and IPv6 bracket shape are all folded, so a value pasted
    # out of a browser address bar matches. Wildcards (0.0.0.0 / :: / empty) are
    # dropped rather than stored — a browser never sends the bind wildcard as its
    # Host, so such an entry is an allowlist that matches nothing while looking
    # configured.
    allowed_hosts: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "gateway/host_rules.py",
            "desc_zh": "可接受的 Host 头列表。DNS rebinding 攻击中 Origin 与 Host 都是攻击者控制的字符串，比对二者无效；唯一可信信号是 Host 是否为本网关预期被访问的名字。绑 loopback 时留空默认接受 localhost/127.0.0.1/[::1]；绑 0.0.0.0/:: 时留空会启动告警，且管理端点（会话/配置/记忆写入/任务/定时/知识库）会拒绝一切浏览器请求；反代时显式列出代理域名。条目会规范化后比较（忽略大小写、去端口、IPv6 方括号），通配符（0.0.0.0 / ::）不是有效条目，会被丢弃",
            "desc_en": (
                "Accepted Host header values. DNS rebinding makes Origin and Host "
                "both attacker-controlled strings — comparing them is useless. "
                "The only authoritative signal is whether the Host matches a name "
                "this gateway was intended to be reached on: loopback addresses "
                "when bound to loopback, the proxy domain when behind one. Empty "
                "defers to the bind-address default (loopback addresses when bound "
                "to loopback; when bound to 0.0.0.0/:: it warns at startup and the "
                "admin endpoints — sessions, config, memory writes, tasks, cron, "
                "knowledge — reject every browser request). Entries are compared "
                "normalized (case-insensitive, port stripped, IPv6 brackets "
                "folded); a wildcard such as 0.0.0.0 or :: is not a usable entry "
                "and is dropped. Set explicitly for reverse-proxy deployments"
            ),
        },
    )

class GatewayConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "app.py:267",
            "desc_zh": "是否启用网关服务",
            "desc_en": "Enable the gateway service",
        },
    )
    # Loopback by default. The previous 0.0.0.0 default combined with the empty
    # apiTokens default into a config that _check_bind_safety refuses outright
    # ("bind 0.0.0.0 without any API token"), so a quickstart install — which
    # never visits the gateway section and therefore never sets a token — always
    # produced a service that could not start. Binding locally is also the right
    # default on its own terms: exposing an agent to the network should be an
    # explicit act, not what happens when you accept every prompt.
    host: str = Field(
        default="127.0.0.1",
        json_schema_extra={
            "status": "effective", "ref": "gateway/server.py:_check_bind_safety",
            "desc_zh": (
                "网关监听地址。默认 127.0.0.1 仅本机可达;要对外提供服务改为 0.0.0.0 "
                "并同时配置 auth.apiTokens(无 token 绑非回环地址会被拒绝启动),"
                "反代场景还需在 auth.allowedHosts 列出代理域名。注意留空不等于本机:"
                "空字符串与 :: 一样是通配绑定(等同 0.0.0.0),同样受上述限制"
            ),
            "desc_en": (
                "Gateway bind address. Defaults to 127.0.0.1 (this machine only). "
                "To serve the network, set 0.0.0.0 AND configure auth.apiTokens — "
                "binding non-loopback without a token is refused at startup — and "
                "list your proxy domain in auth.allowedHosts if behind a reverse "
                "proxy. Note that leaving this empty does NOT mean local: an empty "
                "string, like ::, is a wildcard bind equivalent to 0.0.0.0 and is "
                "subject to the same rules"
            ),
        },
    )
    port: int = Field(
        default=58123,
        json_schema_extra={
            "status": "effective", "ref": "gateway/server.py:129",
            "desc_zh": "网关监听端口(0 表示动态分配,真实端口写入 workspace/.codex-pro/gateway.json)",
            "desc_en": "Gateway listen port (0 = dynamically assigned; the real port is written to workspace/.codex-pro/gateway.json)",
        },
    )

    @field_validator("port")
    @classmethod
    def _validate_port(cls, v: int) -> int:
        # 0 = 让 OS 挑临时端口(真实端口经端点文件对外暴露);其余须为合法 TCP 端口。
        # 越界值(负数/>65535)fail-closed 拒绝启动,而非等到 bind 时才报晦涩的 OSError。
        if v != 0 and not (1 <= v <= 65535):
            raise ValueError("port 必须为 0(动态分配)或 1-65535 之间的合法端口")
        return v
    api_prefix: str = Field(
        default="/api/v1",
        json_schema_extra={
            "status": "effective", "ref": "gateway/server.py:195",
            "desc_zh": "网关 API 路径前缀",
            "desc_en": "Gateway API path prefix",
        },
    )
    ws_path: str = Field(
        default="/ws",
        json_schema_extra={
            "status": "effective", "ref": "gateway/server.py:207",
            "desc_zh": "网关 WebSocket 路径",
            "desc_en": "Gateway WebSocket path",
        },
    )
    ws_heartbeat_seconds: float = Field(
        default=30.0,
        json_schema_extra={
            "status": "effective", "ref": "gateway/server.py:716",
            "desc_zh": "服务端 WebSocket 主动心跳间隔(秒,0 为关闭):服务端定期 ping 客户端并要求 pong,"
                       "避免长回合期间连接单边失效而无人察觉导致回复投递不到 CLI",
            "desc_en": "Server-side WebSocket heartbeat interval in seconds (0 = off): the server pings "
                       "clients and expects a pong, so a connection cannot silently die during a long turn "
                       "and cause the reply to miss the CLI",
        },
    )
    session_policy: GatewaySessionPolicyConfig = Field(default_factory=GatewaySessionPolicyConfig)
    auth: GatewayAuthConfig = Field(default_factory=GatewayAuthConfig)
    # `platform` arrives as a client-supplied string on both the WS auth frame and
    # POST /message, and it is interpolated straight into channel="gateway:{platform}"
    # and the delivery key. So an unconstrained value lets a caller name its own
    # channel — and channel names carry capability decisions elsewhere
    # (channels.stream_optimistic_channels asserts "this channel can redraw in
    # place"). A send-only script self-reporting a redraw-capable platform would be
    # served retractable drafts it cannot retract, splicing the next iteration onto
    # an abandoned one.
    #
    # Unknown values are folded to "ws" rather than rejected: third-party callers
    # already post arbitrary platform strings today and rejecting would break them
    # for no security gain — the fold already removes the capability confusion, and
    # per-platform rate limits still key off the reported name. Note this is NOT an
    # identity control; impersonation is handled by resolve_client_session_key.
    #
    # EVERY channel this repo implements must appear here. The fold runs *before*
    # the authorization check (server.py, _authenticate_and_check_rate_limit), and
    # both authorization stores are keyed by platform: allowlist entries use the
    # documented "feishu:123" form and paired users live in {platform}_approved.json.
    # So omitting a real channel does not merely misroute it — it silently
    # invalidates approvals already on disk, and the operator sees a correct-looking
    # feishu_approved.json while every request 403s. The per-platform rate-limit
    # bucket (f"{platform}:{chat_id}") collapses into a shared "ws:" bucket too.
    # test_gateway_platform_normalization pins this list against the channel
    # registry so a newly added channel cannot drift out of it.
    known_platforms: list[str] = Field(
        default_factory=lambda: [
            # Transport-level callers: no channel class, but these are the
            # gateway's own default platform values (WS handshake, POST /message)
            # and the attached CLI.
            "cli", "ws", "api",
            # Every implemented channel, i.e. codex_pro/channels/*.py `name`.
            # "wechat" is kept as a long-standing alias of the weixin channel.
            "cron", "dingtalk", "discord", "email", "feishu", "matrix", "qqbot",
            "slack", "telegram", "webhook", "wechat", "wecom", "weixin", "whatsapp",
        ],
        json_schema_extra={
            "status": "effective", "ref": "gateway/ws_session.py:normalize_platform",
            "desc_zh": (
                "网关认可的 platform 取值。客户端自报的 platform 会拼进通道名 "
                "gateway:{platform},而通道名在别处承载能力判定(如 "
                "channels.stream_optimistic_channels 断言该通道可就地重绘),"
                "所以不在此列表的取值会被折叠为 ws,而不是直接拒绝——避免打断"
                "已有的第三方接入。留空表示不做折叠(回到旧的完全自报行为)"
            ),
            "desc_en": (
                "Platform values the gateway recognises. A client-reported platform "
                "is interpolated into the channel name gateway:{platform}, and "
                "channel names carry capability decisions elsewhere (e.g. "
                "channels.stream_optimistic_channels asserts a channel can redraw "
                "in place), so a value outside this list is folded to \"ws\" rather "
                "than rejected — that keeps existing third-party callers working. "
                "Empty list disables folding (legacy fully self-reported behaviour)"
            ),
        },
    )
    platforms: dict[str, GatewayPlatformConfig] = Field(
        default_factory=dict,
        json_schema_extra={
            "status": "effective", "ref": "gateway/server.py:90",
            "desc_zh": "各接入平台的网关配置(键为平台名)",
            "desc_en": "Per-platform gateway configurations keyed by platform",
        },
    )
    media_cache_dir: str = Field(
        default="data/media_cache",
        json_schema_extra={
            "status": "effective", "ref": "gateway/server.py:79",
            "desc_zh": "网关媒体缓存目录",
            "desc_en": "Gateway media cache directory",
        },
    )
    media_cache_max_mb: int = Field(
        default=500,
        json_schema_extra={
            "status": "effective", "ref": "gateway/server.py:80",
            "desc_zh": "媒体缓存大小上限(MB)",
            "desc_en": "Media cache size limit (MB)",
        },
    )
    # Media URLs are attacker-controlled input: they arrive in a POST /message
    # body or an inbound chat attachment. The download path therefore runs under
    # the same SSRF guard as web_fetch (security/net_guard.py) plus the ceilings
    # below. Without them a single request could probe internal services, read
    # cloud instance metadata, or exhaust memory/disk with one huge response.
    media_max_file_mb: int = Field(
        default=25,
        json_schema_extra={
            "status": "effective", "ref": "gateway/media.py",
            "desc_zh": "单个媒体文件下载大小上限(MB)。Content-Length 与实际字节流都会校验,超限即中止并删除临时文件",
            "desc_en": (
                "Per-file download ceiling (MB). Enforced on both Content-Length "
                "and the real byte stream; an over-size download is aborted and "
                "its partial file removed"
            ),
        },
    )
    media_max_urls_per_message: int = Field(
        default=10,
        json_schema_extra={
            "status": "effective", "ref": "gateway/server.py",
            "desc_zh": "单条消息允许携带的媒体 URL 数量上限,超出的部分被拒绝",
            "desc_en": "Maximum media URLs accepted on one message; extras are rejected",
        },
    )
    media_download_concurrency: int = Field(
        default=4,
        json_schema_extra={
            "status": "effective", "ref": "gateway/media.py",
            "desc_zh": "媒体并行下载数上限,避免一条消息打满出站连接与内存",
            "desc_en": "Maximum parallel media downloads, bounding outbound connections and memory",
        },
    )
    media_allow_private_addresses: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "gateway/media.py",
            "desc_zh": (
                "是否允许媒体下载访问私有/回环地址(SSRF 风险)。与 tools.web.allowPrivateAddresses "
                "同口径但独立开关:内网自建 CDN 可能需要开启,默认拦截。即使开启也仍然只允许 http/https"
            ),
            "desc_en": (
                "Allow media downloads to reach private/loopback addresses (SSRF risk). "
                "Same policy as tools.web.allowPrivateAddresses but a separate switch, "
                "since an internal CDN may legitimately need it. Blocked by default; "
                "the http/https scheme restriction applies either way"
            ),
        },
    )
    hooks_dir: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "gateway/server.py:94",
            "desc_zh": "网关钩子脚本目录",
            "desc_en": "Gateway hook scripts directory",
        },
    )

# ── Skills configs ───────────────────────────────────────────────────────────

