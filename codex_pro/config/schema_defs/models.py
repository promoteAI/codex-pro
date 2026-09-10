"""Codex Pro configuration schema."""

from __future__ import annotations


from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

class _Base(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

# ── Channel configs ──────────────────────────────────────────────────────────

class ProviderConfig(_Base):
    name: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "app.py:91",
            "desc_zh": "提供商名称(路由引用此名)",
            "desc_en": "Provider name referenced by routes",
        },
    )
    api_key: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "models/providers/__init__.py:123",
            "desc_zh": "提供商 API 密钥",
            "desc_en": "Provider API key",
        },
    )
    api_key_env: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "models/providers/__init__.py:create_provider",
            "desc_zh": "从指定环境变量读取 API 密钥；用于宿主进程临时注入，避免密钥写入配置文件",
            "desc_en": "Read the API key from this environment variable so a host can inject an ephemeral secret without persisting it",
        },
    )
    api_base: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "models/providers/__init__.py:125",
            "desc_zh": "提供商 API 基础地址",
            "desc_en": "Provider API base URL",
        },
    )
    models: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "models/router.py:352",
            "desc_zh": "该提供商支持的模型列表",
            "desc_en": "Models served by this provider",
        },
    )
    extra_headers: dict[str, str] = Field(
        default_factory=dict,
        json_schema_extra={
            "status": "effective", "ref": "models/providers/__init__.py:112",
            "desc_zh": "附加到请求的自定义 HTTP 头",
            "desc_en": "Extra HTTP headers attached to requests",
        },
    )
    max_retries: int = Field(
        default=3,
        json_schema_extra={
            "status": "effective", "ref": "models/providers/__init__.py:125",
            "desc_zh": "瞬时错误时的最大重试次数(指数退避)",
            "desc_en": "Max retries on transient errors (exponential backoff)",
        },
    )
    timeout_seconds: int = Field(
        default=120,
        json_schema_extra={
            "status": "effective", "ref": "models/providers/__init__.py:126",
            "desc_zh": "单次请求超时(秒)",
            "desc_en": "Per-request timeout (seconds)",
        },
    )
    stream_include_usage: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "models/providers/openai_provider.py:31",
            "desc_zh": "流式请求是否附带 stream_options.include_usage(用于统计 token/成本);"
                       "个别不支持该字段的 OpenAI 兼容端点需设为 false",
            "desc_en": "Send stream_options.include_usage on streaming requests (for token/cost "
                       "accounting); set false for OpenAI-compatible endpoints that reject the field",
        },
    )
    rate_limit_rpm: int = Field(
        default=0,
        json_schema_extra={
            "status": "effective", "ref": "models/providers/__init__.py:131",
            "desc_zh": "该提供商每分钟请求上限(0 为不限)",
            "desc_en": "Provider request-per-minute cap (0 = unlimited)",
        },
    )
    credential_pool: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "models/providers/__init__.py:119",
            "desc_zh": "轮换使用的多个 API 密钥池",
            "desc_en": "Pool of API keys rotated for this provider",
        },
    )

class ModelRouteConfig(_Base):
    model: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "models/router.py:122",
            "desc_zh": "该路由使用的模型名",
            "desc_en": "Model name used by this route",
        },
    )
    provider: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "models/router.py:296",
            "desc_zh": "该路由绑定的提供商名",
            "desc_en": "Provider name bound to this route",
        },
    )
    task_types: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "models/router.py:294",
            "desc_zh": "命中此路由的任务类型列表",
            "desc_en": "Task types that match this route",
        },
    )
    fallback_models: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "models/router.py:284",
            "desc_zh": "主模型失败时的回退模型列表",
            "desc_en": "Fallback models when the primary fails",
        },
    )
    max_tokens: int = Field(
        default=8192,
        json_schema_extra={
            "status": "effective", "ref": "agent/pipeline/inference_stage.py:615",
            "desc_zh": "该路由生成的最大 token 数",
            "desc_en": "Maximum tokens generated for this route",
        },
    )
    temperature: float = Field(
        default=0.7,
        json_schema_extra={
            "status": "effective", "ref": "agent/pipeline/inference_stage.py:616",
            "desc_zh": "该路由的采样温度",
            "desc_en": "Sampling temperature for this route",
        },
    )
    context_window: int = Field(
        default=0,
        json_schema_extra={
            "status": "effective", "ref": "models/router.py:268",
            "desc_zh": "该路由模型的上下文窗口显式覆盖(0 为不指定,自动按模型解析);"
                       "优先级高于内置注册表与全局兜底",
            "desc_en": "Explicit context-window override for this route's model (0 = unset, resolved "
                       "automatically); takes precedence over the built-in registry and global fallback",
        },
    )

class ModelsConfig(_Base):
    default_model: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "models/router.py:130",
            "desc_zh": "无匹配路由时使用的默认模型",
            "desc_en": "Default model used when no route matches",
        },
    )
    providers: list[ProviderConfig] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "app.py:88",
            "desc_zh": "模型提供商配置列表",
            "desc_en": "List of model provider configurations",
        },
    )
    routes: list[ModelRouteConfig] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "models/router.py:121",
            "desc_zh": "任务到模型的路由规则列表",
            "desc_en": "List of task-to-model routing rules",
        },
    )
    fallback_model: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "models/router.py:147",
            "desc_zh": "全局兜底模型",
            "desc_en": "Global fallback model",
        },
    )
    model_windows: dict[str, int] = Field(
        default_factory=dict,
        json_schema_extra={
            "status": "effective", "ref": "models/router.py:268",
            "desc_zh": "模型 ID 到上下文窗口 token 数的映射(setup 从提供商元数据自动捕获,也可手填);"
                       "解析窗口时优先级低于路由显式覆盖、高于内置注册表",
            "desc_en": "Map of model id to context-window tokens (auto-captured by setup from provider "
                       "metadata, or hand-set); ranks below a route override and above the built-in registry",
        },
    )

# ── Tool configs ─────────────────────────────────────────────────────────────

