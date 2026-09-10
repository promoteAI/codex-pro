"""Codex Pro configuration schema."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

class _Base(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

# ── Channel configs ──────────────────────────────────────────────────────────

class ExecToolConfig(_Base):
    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:39",
            "desc_zh": "是否启用 shell/进程执行工具",
            "desc_en": "Enable the shell/process execution tool",
        },
    )
    max_output_chars: int = Field(
        default=2000000,
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:47",
            "desc_zh": "命令输出的采集上限字符数(不是模型可见上限——后者由 spill.maxInlineChars 决定)",
            "desc_en": "Acquisition character cap for command output (not the model-facing cap, which is spill.maxInlineChars)",
        },
    )
    host: Literal["auto", "local", "sandbox", "container", "remote"] = Field(
        default="sandbox",
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:42",
            "desc_zh": "命令执行所在的宿主环境",
            "desc_en": "Host environment in which commands execute",
        },
    )
    security: Literal["deny", "allowlist", "full"] = Field(
        default="allowlist",
        json_schema_extra={
            "status": "effective", "ref": "security/guards.py:237",
            "desc_zh": "命令执行安全模式",
            "desc_en": "Command execution security mode",
        },
    )
    ask: Literal["off", "on_miss", "always"] = Field(
        default="on_miss",
        json_schema_extra={
            "status": "effective", "ref": "security/guards.py:238",
            "desc_zh": "命令执行前的审批询问策略",
            "desc_en": "When to ask for approval before running a command",
        },
    )
    safe_bins: list[str] = Field(
        default_factory=lambda: [
            "awk",
            "cat",
            "date",
            "codex",
            "find",
            "grep",
            "head",
            "ls",
            "pwd",
            "rg",
            "sed",
            "sort",
            "tail",
            "tr",
            "uniq",
            "wc",
        ],
        json_schema_extra={
            "status": "effective", "ref": "security/guards.py:265",
            "desc_zh": "allowlist 模式下免审批直接放行的安全命令",
            "desc_en": "Commands allowed without approval under allowlist mode",
        },
    )
    allowed_commands: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:45",
            "desc_zh": "额外允许执行的命令白名单",
            "desc_en": "Additional allowlist of commands permitted to run",
        },
    )
    blocked_commands: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:46",
            "desc_zh": "禁止执行的命令黑名单",
            "desc_en": "Blocklist of commands forbidden from running",
        },
    )

class WebToolConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:56",
            "desc_zh": "是否启用网络访问工具",
            "desc_en": "Enable the web access tool",
        },
    )
    proxy: str | None = Field(
        default=None,
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:57",
            "desc_zh": "网络访问使用的代理地址",
            "desc_en": "Proxy URL used for web access",
        },
    )
    timeout_seconds: int = Field(
        default=30,
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:64",
            "desc_zh": "网络请求超时(秒)",
            "desc_en": "Web request timeout (seconds)",
        },
    )
    search_api_key: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:58",
            "desc_zh": "搜索服务 API key",
            "desc_en": "Search service API key",
        },
    )
    search_provider: Literal["brave", "tavily", "serpapi", "searxng", "serply"] = Field(
        default="brave",
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:58",
            "desc_zh": "网络搜索服务提供商 (serply 使用 Serply SERP API: https://serply.io, 文档 https://serply.io/docs)",
            "desc_en": "Web search service provider (serply uses the Serply SERP API: https://serply.io, docs https://serply.io/docs)",
        },
    )
    search_api_base: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:62",
            "desc_zh": "搜索服务 API 基础地址",
            "desc_en": "Search service API base URL",
        },
    )
    # SSRF guard: block web_fetch requests to loopback/private/link-local
    # addresses (cloud metadata endpoints, internal services). Opt out only
    # when the agent legitimately needs to reach internal hosts.
    allow_private_addresses: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:57",
            "desc_zh": "是否允许 web_fetch 访问私有/回环地址(SSRF 风险)",
            "desc_en": "Allow web_fetch to reach private/loopback addresses (SSRF risk)",
        },
    )

class BrowserToolConfig(_Base):
    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py",
            "desc_zh": "是否开启浏览器自动化工具（默认开，未装 playwright/chromium 时 is_ready 探测自动降级不装配）",
            "desc_en": "Enable browser automation tool (default on; auto-degrades if playwright/chromium missing)",
        },
    )
    max_sessions: int = Field(
        default=3,
        json_schema_extra={
            "status": "effective", "ref": "agent/browser/session.py",
            "desc_zh": "单个会话方(owner)的并发浏览器会话上限",
            "desc_en": "Max concurrent browser sessions per owner",
        },
    )
    max_total_sessions: int = Field(
        default=10,
        json_schema_extra={
            "status": "effective", "ref": "agent/browser/session.py",
            "desc_zh": "全实例并发浏览器会话总上限（每个会话都是独立 Chromium context，占用真实内存）；<=0 表示不限制",
            "desc_en": "Global cap on concurrent browser sessions across all owners (each is a Chromium context); <=0 disables",
        },
    )
    session_idle_timeout_sec: int = Field(
        default=300,
        json_schema_extra={
            "status": "effective", "ref": "agent/browser/session.py",
            "desc_zh": "浏览器会话空闲多久(秒)后自动回收",
            "desc_en": "Idle seconds before a browser session is reaped",
        },
    )
    max_snapshot_chars: int = Field(
        default=8000,
        json_schema_extra={
            "status": "effective", "ref": "agent/browser/snapshot.py",
            "desc_zh": "可访问性快照文本截断上限(字符)",
            "desc_en": "Accessibility snapshot text truncation limit (chars)",
        },
    )
    headless: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/browser/session.py",
            "desc_zh": "无头模式（服务器环境必需）",
            "desc_en": "Headless mode (required on servers)",
        },
    )
    nav_timeout_sec: int = Field(
        default=30,
        json_schema_extra={
            "status": "effective", "ref": "agent/browser/actions.py",
            "desc_zh": "单次页面导航超时(秒)",
            "desc_en": "Per-navigation timeout (seconds)",
        },
    )
    allow_private_addresses: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "agent/browser/actions.py",
            "desc_zh": "是否允许导航到内网地址（默认拦截，复用 SSRF 口径）",
            "desc_en": "Allow navigating to private addresses (default blocked, reuses SSRF policy)",
        },
    )
    dialog_policy: str = Field(
        default="dismiss",
        json_schema_extra={
            "status": "effective", "ref": "agent/browser/session.py",
            "desc_zh": "原生弹窗(alert/confirm/prompt)自动处理策略：dismiss 取消 / accept 确认。不处理会导致页面阻塞",
            "desc_en": "Native dialog auto-handling policy: dismiss or accept (unhandled dialogs block the page)",
        },
    )
    allow_evaluate: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/browser.py",
            "desc_zh": "是否允许 evaluate 动作在页面内执行 JS。表达式黑名单只能拦住粗糙用法，无法对抗刻意混淆；不能接受页内任意代码执行的部署应关掉此项",
            "desc_en": "Allow the evaluate action to run JS in the page. The expression blacklist stops careless use, not deliberate obfuscation; turn this off where in-page code execution is unacceptable",
        },
    )
    allow_unsafe_evaluate: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "agent/browser/actions.py",
            "desc_zh": "是否跳过 evaluate 的敏感表达式检查（读取 cookie/localStorage、脚本跳转等），默认拒绝以防注入外泄",
            "desc_en": "Skip evaluate's sensitive-expression checks (cookie/storage reads, script navigation). Default denied",
        },
    )
    persist_login_state: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/browser.py",
            "desc_zh": "是否持久化浏览器登录态(cookie/localStorage)到工作区，供后续会话复用",
            "desc_en": "Persist browser login state (cookies/localStorage) into the workspace for reuse",
        },
    )
    viewport_width: int = Field(
        default=1280,
        json_schema_extra={
            "status": "effective", "ref": "agent/browser/session.py",
            "desc_zh": "浏览器视口宽度(像素)",
            "desc_en": "Browser viewport width (px)",
        },
    )
    viewport_height: int = Field(
        default=800,
        json_schema_extra={
            "status": "effective", "ref": "agent/browser/session.py",
            "desc_zh": "浏览器视口高度(像素)",
            "desc_en": "Browser viewport height (px)",
        },
    )
    user_agent: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/browser/session.py",
            "desc_zh": "自定义 User-Agent，留空用 Chromium 默认值",
            "desc_en": "Custom User-Agent; empty uses the Chromium default",
        },
    )

class ImageGenConfig(_Base):
    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:220",
            "desc_zh": "是否启用图像生成工具(取消后即使填了 key 也不注册)",
            "desc_en": "Enable the image generation tool (unset skips registration even if a key is present)",
        },
    )
    backend: str = Field(
        default="openai",
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:192",
            "desc_zh": "图像生成后端",
            "desc_en": "Image generation backend",
        },
    )
    # OpenAI-compatible backend
    api_key: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:213",
            "desc_zh": "OpenAI 兼容后端 API key",
            "desc_en": "OpenAI-compatible backend API key",
        },
    )
    api_base: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:214",
            "desc_zh": "OpenAI 兼容后端 API 基础地址",
            "desc_en": "OpenAI-compatible backend API base URL",
        },
    )
    model: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:215",
            "desc_zh": "图像生成模型名",
            "desc_en": "Image generation model name",
        },
    )
    # FAL.ai backend
    fal_key: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:195",
            "desc_zh": "FAL.ai 后端访问密钥",
            "desc_en": "FAL.ai backend access key",
        },
    )
    fal_model: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:196",
            "desc_zh": "FAL.ai 图像生成模型名",
            "desc_en": "FAL.ai image generation model name",
        },
    )

class TTSConfig(_Base):
    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:263",
            "desc_zh": "是否启用 TTS 语音合成工具(取消后不注册,保留已填凭证)",
            "desc_en": "Enable the TTS tool (unset skips registration; stored credentials are kept)",
        },
    )
    openai_api_key: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:236",
            "desc_zh": "OpenAI TTS API key",
            "desc_en": "OpenAI TTS API key",
        },
    )
    openai_api_base: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:237",
            "desc_zh": "OpenAI TTS API 基础地址",
            "desc_en": "OpenAI TTS API base URL",
        },
    )
    model: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:238",
            "desc_zh": "TTS 模型名",
            "desc_en": "TTS model name",
        },
    )
    default_backend: str = Field(
        default="edge",
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:239",
            "desc_zh": "默认语音合成后端",
            "desc_en": "Default text-to-speech backend",
        },
    )
    default_voice: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:240",
            "desc_zh": "默认语音音色",
            "desc_en": "Default synthesis voice",
        },
    )

class CodeExecConfig(_Base):
    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:91",
            "desc_zh": "是否启用代码执行工具",
            "desc_en": "Enable the code execution tool",
        },
    )
    timeout_seconds: int = Field(
        default=30,
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:98",
            "desc_zh": "代码执行超时(秒)",
            "desc_en": "Code execution timeout (seconds)",
        },
    )
    allowed_languages: list[str] = Field(
        default_factory=lambda: ["python", "javascript", "bash"],
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:96",
            "desc_zh": "允许执行的代码语言列表",
            "desc_en": "Languages permitted for code execution",
        },
    )

class MCPServerConfig(_Base):
    command: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "mcp/manager.py:_create_transport",
            "desc_zh": "stdio 传输方式下启动 MCP 服务的命令(与 url 二选一)",
            "desc_en": "Command launching the MCP server over stdio (mutually exclusive with url)",
        },
    )
    args: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "mcp/manager.py:_create_transport",
            "desc_zh": "启动 MCP 服务命令的参数",
            "desc_en": "Arguments for the MCP server launch command",
        },
    )
    env: dict[str, str] = Field(
        default_factory=dict,
        json_schema_extra={
            "status": "effective", "ref": "mcp/manager.py:_resolve_env_vars",
            "desc_zh": "MCP 服务进程的环境变量,支持 ${VAR} 与 $VAR 展开(变量缺失即报错)",
            "desc_en": "Environment variables for the MCP server process; ${VAR}/$VAR expanded",
        },
    )
    url: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "mcp/manager.py:_create_transport",
            "desc_zh": "Streamable HTTP 传输方式下 MCP 服务地址(与 command 二选一)",
            "desc_en": "MCP server URL for Streamable HTTP transport (mutually exclusive with command)",
        },
    )
    headers: dict[str, str] = Field(
        default_factory=dict,
        json_schema_extra={
            "status": "effective", "ref": "mcp/manager.py:_create_transport",
            "desc_zh": "HTTP 连接 MCP 服务的自定义头,支持 ${VAR} 展开",
            "desc_en": "Custom headers for the MCP HTTP connection; ${VAR} expanded",
        },
    )
    auth: Literal["", "oauth"] = Field(
        default="",
        json_schema_extra={
            # 原描述写「认证凭据」,实际是模式选择器且只认 "oauth" —— 类型收窄后
            # 配置层就会直接拒绝其他取值,而不是静默走无认证。
            "status": "effective", "ref": "mcp/manager.py:_acquire_oauth_token",
            "desc_zh": "认证模式:留空为不认证(或自带 headers),oauth 为 OAuth 2.1 PKCE 浏览器授权",
            "desc_en": "Auth mode: empty for none (or preset headers), 'oauth' for OAuth 2.1 PKCE",
        },
    )
    trust_level: Literal["untrusted", "trusted"] = Field(
        default="untrusted",
        json_schema_extra={
            "status": "effective", "ref": "mcp/tool_adapter.py:_classify_risk",
            "desc_zh": (
                "该 MCP 服务的信任级别。untrusted(默认):其工具至少按 exec 审批,"
                "服务端声明的 readOnlyHint 不能降低审批等级;trusted:采信 annotations。"
                "MCP 规范明确 annotations 仅为提示,不可作为安全判据 —— 只有你自己"
                "掌控的服务才应设为 trusted。"
            ),
            "desc_en": (
                "Trust level for this server. untrusted (default): tools are gated at "
                "exec or above and server-supplied readOnlyHint cannot lower it; "
                "trusted: annotations are honoured. Only set trusted for servers you control."
            ),
        },
    )
    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "mcp/manager.py:start_all",
            "desc_zh": "是否启用该 MCP 服务",
            "desc_en": "Enable this MCP server",
        },
    )
    timeout: int = Field(
        default=120, gt=0, le=3600,
        json_schema_extra={
            "status": "effective", "ref": "mcp/manager.py:_register_server_tools",
            "desc_zh": "MCP 工具调用超时(秒)",
            "desc_en": "MCP tool call timeout (seconds)",
        },
    )
    connect_timeout: int = Field(
        default=60, gt=0, le=600,
        json_schema_extra={
            "status": "effective", "ref": "mcp/manager.py:_connect_server",
            "desc_zh": "连接与初始化握手的超时(秒)",
            "desc_en": "Connection and initialize handshake timeout (seconds)",
        },
    )
    tools_include: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "mcp/security.py:validate_mcp_tools",
            "desc_zh": "仅暴露的 MCP 工具白名单(空为全部)",
            "desc_en": "Allowlist of MCP tools to expose (empty = all)",
        },
    )
    tools_exclude: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "mcp/security.py:validate_mcp_tools",
            "desc_zh": "排除的 MCP 工具黑名单",
            "desc_en": "Blocklist of MCP tools to exclude",
        },
    )

    @model_validator(mode="after")
    def _exactly_one_transport(self) -> "MCPServerConfig":
        """url 与 command 必须二选一。

        两者同时配置时旧行为是静默优先 url,于是 command 里的笔误无从发现;
        两者都不配则在连接时才失败,而这是纯配置错误,应当在加载期就报出来。
        """
        if self.enabled and not self.url and not self.command:
            raise ValueError("MCP server must set either 'url' or 'command'")
        if self.url and self.command:
            raise ValueError("MCP server must set exactly one of 'url' or 'command', not both")
        if self.auth == "oauth" and not self.url:
            raise ValueError("auth='oauth' only applies to HTTP MCP servers (set 'url')")
        return self

class MCPToolConfig(_Base):
    """Top-level MCP switch for the tools section.

    Individual servers live in ``tools.mcp_servers``; this holds the single
    on/off flag the setup wizard writes so un-checking MCP is a real config
    change rather than a print-only no-op.
    """
    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:_start_mcp",
            "desc_zh": "是否启用 MCP 工具接入(设为 false 时不加载任何 MCP 服务,"
                       "即使 mcp_servers 里仍有配置)",
            "desc_en": "Enable MCP tool integration (false skips every configured MCP server)",
        },
    )

class ToolsConfig(_Base):
    # Keep in sync with default.yaml (tools.profile). "full" is the packaged
    # default; both must agree so the effective profile is unambiguous.
    profile: Literal["minimal", "messaging", "coding", "full"] = Field(
        default="full",
        json_schema_extra={
            "status": "effective", "ref": "security/tool_policy.py:114",
            "desc_zh": "工具集预设档位",
            "desc_en": "Preset tool profile",
        },
    )
    allow: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "security/tool_policy.py:119",
            "desc_zh": "覆盖档位、显式允许的工具列表",
            "desc_en": "Explicit allowlist of tools overriding the profile",
        },
    )
    also_allow: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "security/tool_policy.py:122",
            "desc_zh": "在档位基础上额外允许的工具",
            "desc_en": "Tools additionally allowed on top of the profile",
        },
    )
    deny: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "security/tool_policy.py:111",
            "desc_zh": "显式禁用的工具列表",
            "desc_en": "Explicit blocklist of tools",
        },
    )
    exec: ExecToolConfig = Field(default_factory=ExecToolConfig)
    web: WebToolConfig = Field(default_factory=WebToolConfig)
    browser: BrowserToolConfig = Field(default_factory=BrowserToolConfig)
    restrict_to_workspace: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:34",
            "desc_zh": "是否将文件操作限制在工作区内",
            "desc_en": "Restrict file operations to the workspace",
        },
    )
    safe_write_root: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/__init__.py:35",
            "desc_zh": "允许写入的根目录",
            "desc_en": "Root directory under which writes are permitted",
        },
    )
    inbound_document_enabled: bool = Field(
        True,
        json_schema_extra={
            "status": "effective",
            "ref": "agent/context.py:resolve_inbound_media",
            "desc_zh": "是否自动下载、解密并解析入站文档附件(docx/xlsx/pptx/pdf)",
            "desc_en": "Auto download, decrypt and parse inbound document attachments",
        },
    )
    inbound_document_max_chars: int = Field(
        8000,
        ge=0,
        json_schema_extra={
            "status": "effective",
            "ref": "agent/context.py:build_messages",
            "desc_zh": "入站文档自动注入正文的字符上限,超出则注入摘要并提示用 read_document 读全文",
            "desc_en": "Char cap for auto-injecting inbound document text; beyond it, inject a summary and hint read_document",
        },
    )
    mcp_servers: dict[str, MCPServerConfig] = Field(
        default_factory=dict,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:_start_mcp",
            "desc_zh": "MCP 服务配置(键为服务名;该键会参与工具名与凭据文件名,"
                       "只允许字母数字与 . - _)",
            "desc_en": "MCP server configurations keyed by name (the key feeds tool names "
                       "and credential filenames; letters, digits, dot, dash, underscore only)",
        },
    )
    mcp_security_policy: Literal["warn", "block"] = Field(
        default="block",
        json_schema_extra={
            "status": "effective", "ref": "mcp/security.py:validate_mcp_tools",
            "desc_zh": "MCP 工具注入扫描策略:block 拒绝可疑工具,warn 仅告警放行。"
                       "扫描覆盖工具名、描述与 inputSchema 内的描述/标题",
            "desc_en": "MCP injection-scan policy: block rejects suspicious tools, warn only logs. "
                       "Covers tool name, description and inputSchema descriptions/titles",
        },
    )
    image_gen: ImageGenConfig = Field(default_factory=ImageGenConfig)
    tts: TTSConfig = Field(default_factory=TTSConfig)
    code_exec: CodeExecConfig = Field(default_factory=CodeExecConfig)
    mcp: MCPToolConfig = Field(default_factory=MCPToolConfig)

# ── Execution environment configs ────────────────────────────────────────────

