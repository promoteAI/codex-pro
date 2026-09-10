"""Codex Pro configuration schema."""

from __future__ import annotations

from pathlib import PurePosixPath
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

class _Base(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

# ── Channel configs ──────────────────────────────────────────────────────────

class SessionConfig(_Base):
    max_history_messages: int = Field(
        default=500,
        json_schema_extra={
            "status": "effective", "ref": "agent/pipeline/context_stage.py:133",
            "desc_zh": "单会话保留的最大历史消息数",
            "desc_en": "Maximum history messages retained per session",
        },
    )
    expiry_hours: int = Field(
        default=72,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:99",
            "desc_zh": "会话过期时间(小时)",
            "desc_en": "Session expiry time (hours)",
        },
    )
    context_window_tokens: int = Field(
        default=0,
        json_schema_extra={
            "status": "effective", "ref": "models/model_windows.py:88",
            "desc_zh": "上下文窗口 token 上限的全局兜底值(0=不设,让未知模型落到 256K 现代基线;"
                       "仅当你为某些无法动态解析的私有/本地模型显式设成正数时才生效,优先级低于 models.dev/内置注册表)",
            "desc_en": "Global fallback context-window budget (0 = unset, so an unknown model lands on the 256K "
                       "modern baseline; only an explicit positive value takes effect, for private/local models "
                       "that cannot be resolved dynamically, and it ranks below models.dev and the built-in registry)",
        },
    )
    compression_window_cap: int = Field(
        default=200000,
        json_schema_extra={
            "status": "effective", "ref": "agent/pipeline/inference_stage.py:285",
            "desc_zh": "压缩预算上限(0 为不封顶):模型真实窗口用于显示,但压缩触发按 min(真实窗口, 此上限) 计算,"
                       "避免大窗口模型让上下文膨胀到很大才压缩、抬高单请求成本与延迟",
            "desc_en": "Compression-budget cap (0 = uncapped): the model's real window drives the display, but "
                       "compression triggers against min(real_window, cap) so a large-window model does not let "
                       "context balloon before compressing, which would raise per-request cost and latency",
        },
    )
    introduction_enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:790",
            "desc_zh": "是否在新会话发送自我介绍",
            "desc_en": "Send a self-introduction on new sessions",
        },
    )
    im_clarify_pending_ttl_seconds: int = Field(
        default=300,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py",
            "desc_zh": "IM 通道追问续接的待答有效期(秒);agent 发出追问后超过此时长,下一条消息不再当作答案而按新消息处理",
            "desc_en": "TTL (seconds) for an IM follow-up question; after this, the next message is treated as new rather than an answer to the pending question",
        },
    )
    introduction_template: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:795",
            "desc_zh": "自我介绍模板",
            "desc_en": "Self-introduction template",
        },
    )
    history_image_ttl_minutes: int = Field(
        default=30,
        json_schema_extra={
            "status": "effective", "ref": "agent/pipeline/context_stage.py:245",
            "desc_zh": "历史图片保留时长(分钟)",
            "desc_en": "Time-to-live for images in history (minutes)",
        },
    )
    history_image_limit: int = Field(
        default=4,
        json_schema_extra={
            "status": "effective", "ref": "agent/pipeline/context_stage.py:246",
            "desc_zh": "历史中保留的最大图片数",
            "desc_en": "Maximum images retained in history",
        },
    )
    history_image_skip_if_current: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/pipeline/context_stage.py:247",
            "desc_zh": "当前轮已带图时是否跳过历史图片",
            "desc_en": "Skip history images when the current turn already has one",
        },
    )
    group_session_scope: Literal["per_user", "shared"] = Field(
        default="per_user",
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:597",
            "desc_zh": "群聊会话隔离策略:per_user 每人独立会话(默认,防群内串话),shared 整群共享一个会话",
            "desc_en": "Group session scope: per_user = isolate per sender (default), shared = whole group shares one session",
        },
    )

# ── Memory configs ───────────────────────────────────────────────────────────

class MemoryConfig(_Base):
    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:184",
            "desc_zh": "是否启用认知记忆",
            "desc_en": "Enable cognitive memory",
        },
    )
    scope_policy: Literal["legacy", "session"] = Field(
        default="session",
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:108",
            "desc_zh": "记忆作用域策略",
            "desc_en": "Memory scope policy",
        },
    )
    cross_channel_owner: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "bus/events.py:memory_scope_key",
            "desc_zh": "跨通道主人记忆归一:开启时,principal_bindings 列入的 sender 在各通道 1:1 私聊共享 owner 记忆;未列入者与群聊均按会话隔离。关闭则全部按会话隔离",
            "desc_en": "Cross-channel owner memory: when on, senders listed in principal_bindings share owner memory across 1:1 DMs on any channel; unlisted senders and groups stay per-session. Off = all per-session.",
        },
    )
    owner_key: str = Field(
        default="owner",
        json_schema_extra={
            "status": "effective", "ref": "bus/events.py:memory_scope_key",
            "desc_zh": "主人记忆作用域键(单主体默认 owner,一般无需修改)",
            "desc_en": "Owner memory scope key (single-subject default owner; rarely needs changing)",
        },
    )
    allow_model_environment_writes: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/memory.py",
            "desc_zh": "是否允许模型记忆工具写 ENVIRONMENT 记忆或带 global 标签(这类绕过 scope、全局可见);默认关闭,模型只能写自己 scope 的 USER 记忆,避免任意通道模型污染全局",
            "desc_en": "Allow the model memory tool to write ENVIRONMENT memory or global-tagged entries (these bypass scope, globally visible). Off by default; the model may only write its own scope's USER memory.",
        },
    )

    @field_validator("owner_key")
    @classmethod
    def _owner_key_non_empty(cls, v: str) -> str:
        # 空/空白 owner_key 会让私聊 memory_scope 变空串,进而在 store 层 fail-open
        # 放行全库记忆(store.py:497)。这里 fail-closed 拒绝。
        if not v or not v.strip():
            raise ValueError("owner_key 不能为空")
        return v

    principal_bindings: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "bus/events.py:memory_scope_key",
            "desc_zh": "主人身份绑定表:每项 \"通道:sender_id\",列入者的 1:1 私聊归一到 owner 记忆域实现跨通道互通;未列入者按会话隔离。安全前提:仅对 sender_id 由平台保证不可伪造的通道(如 Telegram/Slack)启用,否则冒充该 id 者可读主人记忆;仅在 cross_channel_owner 开启时生效",
            "desc_en": "Owner identity bindings: each \"channel:sender_id\"; listed senders' 1:1 DMs map to the owner memory scope for cross-channel sharing; others stay per-session. Security assumption: only for channels whose sender_id is platform-guaranteed unforgeable (e.g. Telegram/Slack); otherwise anyone spoofing that id reads owner memory. Effective only when cross_channel_owner is on.",
        },
    )

    @field_validator("principal_bindings")
    @classmethod
    def _validate_principal_bindings(cls, v: list[str]) -> list[str]:
        # 每项须为 "channel:sender_id",冒号两侧非空;非法项 fail-closed 拒绝启动,
        # 避免错配把陌生人误绑成 owner 或静默失效。归一化去除首尾空白后存储,
        # 使 "telegram: alice" 这类含空格配置能与下游真实 sender_id 正确比对。
        normalized: list[str] = []
        for item in v:
            channel, sep, sender = item.partition(":")
            channel, sender = channel.strip(), sender.strip()
            if not sep or not channel or not sender:
                raise ValueError(f"principal_bindings 项格式须为 'channel:sender_id',非法项: {item!r}")
            normalized.append(f"{channel}:{sender}")
        return normalized

    retrieval_on_miss: Literal["degrade", "sync"] = Field(
        default="degrade",
        json_schema_extra={
            "status": "effective", "ref": "agent/pipeline/context_stage.py:197",
            "desc_zh": "检索缓存未命中时的行为:degrade=有界同步检索(超时回退关键词),sync=完整同步检索",
            "desc_en": "Behavior on retrieval cache miss: degrade=bounded sync retrieval with keyword fallback, sync=full synchronous retrieval",
        },
    )
    retrieval_miss_timeout_seconds: float = Field(
        default=0.8,
        json_schema_extra={
            "status": "effective", "ref": "agent/pipeline/context_stage.py:197",
            "desc_zh": "degrade 模式下缓存未命中时的同步检索时间预算(秒),超时回退本地关键词检索;0=完全跳过(旧行为)",
            "desc_en": "Time budget (s) for bounded sync retrieval on cache miss in degrade mode; falls back to local keyword search on timeout; 0=skip entirely (legacy)",
        },
    )
    cache_ttl_seconds: float = Field(
        default=60.0,
        json_schema_extra={
            "status": "effective", "ref": "agent/pipeline/context_stage.py:192",
            "desc_zh": "检索预取缓存新鲜度 TTL(秒),超时即视为未命中",
            "desc_en": "Retrieval prefetch cache freshness TTL in seconds",
        },
    )
    cache_jaccard_min: float = Field(
        default=0.3,
        json_schema_extra={
            "status": "effective", "ref": "agent/pipeline/context_stage.py:192",
            "desc_zh": "当前查询与缓存查询的最小 Jaccard 相似度,低于则视为话题突变未命中",
            "desc_en": "Min Jaccard similarity between current and cached query; below is a miss",
        },
    )
    consolidation_threshold: int = Field(
        default=20,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:176",
            "desc_zh": "触发记忆整合的条目阈值",
            "desc_en": "Entry threshold that triggers memory consolidation",
        },
    )
    narrative_episode_count: int = Field(
        default=3,
        json_schema_extra={
            "status": "effective", "ref": "agent/pipeline/context_stage.py",
            "desc_zh": "快照叙事层注入的最近 episode.summary 条数(承载跨条目时序/因果,补结构化事实层缺失)",
            "desc_en": "Number of recent episode summaries injected as the snapshot narrative layer (carries cross-entry temporal/causal narrative)",
        },
    )
    vector_enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:364",
            "desc_zh": "是否启用向量检索记忆",
            "desc_en": "Enable vector-based memory retrieval",
        },
    )
    vector_dimensions: int = Field(
        default=0,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:366",
            "desc_zh": "记忆向量维度,0=自动跟随当前嵌入模型的实际维度",
            "desc_en": "Memory embedding vector dimensions; 0 = follow the active embedding model",
        },
    )
    max_user_memories: int = Field(
        default=1000,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:104",
            "desc_zh": "单用户记忆条目上限",
            "desc_en": "Maximum stored memories per user",
        },
    )
    max_env_memories: int = Field(
        default=500,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:105",
            "desc_zh": "环境记忆条目上限",
            "desc_en": "Maximum stored environment memories",
        },
    )
    memory_nudge_interval: int = Field(
        default=10,
        json_schema_extra={
            "status": "effective", "ref": "agent/pipeline/inference_stage.py:189",
            "desc_zh": "提示模型记录记忆的轮次间隔",
            "desc_en": "Turn interval for nudging the model to store memories",
        },
    )
    importance_decay_days: float = Field(
        default=30.0,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:106",
            "desc_zh": "记忆重要性衰减周期(天)",
            "desc_en": "Memory importance decay period (days)",
        },
    )
    snapshot_enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/pipeline/context_stage.py:107",
            "desc_zh": "是否启用记忆快照注入上下文",
            "desc_en": "Inject memory snapshots into context",
        },
    )
    snapshot_layering: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "memory/store.py:get_snapshot_with_ids",
            "desc_zh": "快照分层:常驻核心只保留 top-K(按有效重要度)+ 显式 pinned 条目,长尾不再每轮无条件注入 system prompt,改由 query 驱动的召回按需带出。关闭则回退旧行为(USER≤50/ENV≤30 全量注入)。解决'常驻画像与当前问题无关'的注入路径",
            "desc_en": "Snapshot layering: the always-on core keeps only top-K (by effective importance) plus explicitly pinned entries; the long tail is no longer injected into the system prompt every turn but surfaces via query-driven recall. Disable to revert to the legacy full snapshot (USER≤50/ENV≤30). Addresses the query-independent 'always-on profile looks unrelated' injection path.",
        },
    )
    snapshot_user_core_max: int = Field(
        default=12,
        json_schema_extra={
            "status": "effective", "ref": "memory/store.py:get_snapshot_with_ids",
            "desc_zh": "分层开启时 USER 常驻核心的最大条目数(top-K + pinned)。长尾靠召回带出",
            "desc_en": "Max USER entries in the always-on core when layering is on (top-K + pinned). The long tail surfaces via recall.",
        },
    )
    snapshot_env_core_max: int = Field(
        default=8,
        json_schema_extra={
            "status": "effective", "ref": "memory/store.py:get_snapshot_with_ids",
            "desc_zh": "分层开启时 ENVIRONMENT 常驻核心的最大条目数(top-K + pinned)",
            "desc_en": "Max ENVIRONMENT entries in the always-on core when layering is on (top-K + pinned).",
        },
    )
    contradiction_detection: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:406",
            "desc_zh": "是否启用记忆矛盾检测",
            "desc_en": "Enable memory contradiction detection",
        },
    )
    sleep_consolidation: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/consolidation.py:109",
            "desc_zh": "是否启用空闲期记忆整合",
            "desc_en": "Enable idle-time (sleep) memory consolidation",
        },
    )
    archival_threshold: float = Field(
        default=0.05,
        json_schema_extra={
            "status": "effective", "ref": "memory/store.py:172",
            "desc_zh": "记忆归档分数阈值,低于此值进入归档层",
            "desc_en": "Archival score threshold; entries below it move to the archival tier",
        },
    )
    forget_threshold: float = Field(
        default=0.01,
        json_schema_extra={
            "status": "effective", "ref": "memory/store.py:172",
            "desc_zh": "记忆遗忘分数阈值,低于此值被遗忘",
            "desc_en": "Forget score threshold; entries below it are forgotten",
        },
    )
    lineage_max_versions: int = Field(
        default=3,
        json_schema_extra={
            "status": "effective", "ref": "memory/forgetting.py:prune_lineage",
            "desc_zh": "同 key 世系保留的 superseded 版本数上限,超出的最旧版本转归档待遗忘",
            "desc_en": "Max superseded versions kept per key lineage; older ones move to archival for forgetting",
        },
    )
    lineage_retention_days: int = Field(
        default=90,
        json_schema_extra={
            "status": "effective", "ref": "memory/forgetting.py:prune_lineage",
            "desc_zh": "superseded 版本保留天数,超期即转归档待遗忘(即便未超版本数上限)",
            "desc_en": "Retention days for superseded versions; stale ones move to archival even under the version cap",
        },
    )
    max_working_memory: int = Field(
        default=20,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:655",
            "desc_zh": "工作记忆条目上限",
            "desc_en": "Maximum working-memory entries",
        },
    )
    embedding_backend: Literal["auto", "local", "provider"] = Field(
        default="auto",
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:_resolve_embed_and_index",
            "desc_zh": "嵌入后端: auto=启动探测provider,失败则仅在 local_embedding_model 非空时回退fastembed; "
                       "local=直接用本地fastembed免探测; provider=强制provider,探测失败报错不回退",
            "desc_en": "Embedding backend: auto=probe provider at startup, fall back to fastembed "
                       "only when local_embedding_model is non-empty; local=use local fastembed "
                       "directly; provider=force provider, error out if probe fails",
        },
    )
    embedding_model: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:370",
            "desc_zh": "记忆向量化使用的嵌入模型",
            "desc_en": "Embedding model used for memory vectorization",
        },
    )
    local_embedding_model: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "memory/local_embed.py",
            "desc_zh": "无embed能力provider时的本地嵌入兜底模型(fastembed)。默认空串=不下载/不加载本地模型,检索退化为关键词;需要本地向量时再设如 BAAI/bge-small-zh-v1.5",
            "desc_en": "Local fastembed fallback when no embed-capable provider exists. Default empty = do not download/load a local model (keyword retrieval only); set e.g. BAAI/bge-small-zh-v1.5 to enable",
        },
    )
    hf_embedding_endpoint: str = Field(
        default="https://hf-mirror.com",
        json_schema_extra={
            "status": "effective", "ref": "memory/local_embed.py",
            "desc_zh": "本地嵌入模型(fastembed)的 HuggingFace 下载源,默认走 hf-mirror.com 镜像以适配国内网络;设为官方源填 https://huggingface.co,空串则不覆盖已有 HF_ENDPOINT 环境变量",
            "desc_en": "HuggingFace download endpoint for the local fastembed model; defaults to the hf-mirror.com mirror for CN networks. Set to https://huggingface.co for the official source, or empty to leave any existing HF_ENDPOINT env var untouched",
        },
    )
    # Latency budget for the per-message query-embedding round-trip in hybrid
    # retrieval. On timeout retrieval degrades to keyword-only for that turn.
    # Raise this if your embedding endpoint is on a high-latency network and
    # you prefer recall quality over response latency.
    embed_timeout_seconds: float = Field(
        default=1.5,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:419",
            "desc_zh": "查询向量化的单次超时(秒),超时降级为关键词检索",
            "desc_en": "Query-embedding timeout (seconds); falls back to keyword search on timeout",
        },
    )
    rrf_min_similarity: float = Field(
        default=0.30,
        json_schema_extra={
            "status": "effective", "ref": "memory/retrieval.py:vec_rank_map",
            "desc_zh": "RRF 向量召回相似度下限(可调)。向量命中余弦低于该值则不占 rank 槽、不贡献 RRF 分,且不构成'向量达标'准入通路——避免低相似度命中污染真实候选。对归一化句向量,0.25 基本是'勉强沾边',0.30 是更稳的下限;BM25 侧改用判别性 token 门控(单个常见汉字命中不准入),不设分数下限(量纲不同)",
            "desc_en": "RRF vector-recall similarity floor (tunable). Vector hits below this cosine occupy no rank slot, contribute no RRF term, and do not count as a vector-admission path — keeping low-similarity hits from polluting real candidates. For normalized sentence embeddings 0.25 is 'barely related'; 0.30 is a safer floor. The BM25 side instead uses a discriminative-token gate (a single common CJK char never admits) rather than a score floor (different scale).",
        },
    )
    rerank_enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "memory/retrieval.py:_rerank",
            "desc_zh": "是否启用 cross-encoder 精排。RRF 只融合两路顺序、不懂'到底多相关',cross-encoder 对 (query,doc) 联合打分是相关性金标准。开启后对融合 top-K 重排(仅 top-K,开销小),超时/失败回退 RRF 原序。默认关:避免冷启动下载约 941MB 模型与每轮精排延迟;需要时再打开,模型可从自建镜像预取(Gitee 分卷优先,再 GitHub 整包)后离线命中",
            "desc_en": "Enable cross-encoder reranking. RRF only fuses rank order; a cross-encoder scores (query,doc) jointly — the relevance gold standard. When on, the fused top-K is reranked (top-K only, cheap); timeout/failure falls back to the RRF order. Default off: avoids a cold-start ~941MB download and per-turn rerank latency. Turn on when needed; the model can be prefetched from self-hosted mirrors (Gitee split volumes first, then GitHub whole file) for offline hits.",
        },
    )
    rerank_model: str = Field(
        default="BAAI/bge-reranker-base",
        json_schema_extra={
            "status": "effective", "ref": "memory/local_rerank.py",
            "desc_zh": "cross-encoder 精排模型(fastembed TextCrossEncoder 支持的模型名)。中文/多语可选 BAAI/bge-reranker-base 或 jinaai/jina-reranker-v2-base-multilingual",
            "desc_en": "Cross-encoder rerank model (a fastembed TextCrossEncoder model name). For CN/multilingual use BAAI/bge-reranker-base or jinaai/jina-reranker-v2-base-multilingual.",
        },
    )
    rerank_top_k: int = Field(
        default=10,
        json_schema_extra={
            "status": "effective", "ref": "memory/retrieval.py:_rerank",
            "desc_zh": "精排作用的融合 top-K 数量。只对 RRF 融合后的前 K 条重排,其余保持原序,控制精排开销。默认 10:精排是纯 CPU 的 cross-encoder,base 规模模型每对 (query,doc) 打分在数十毫秒量级,K=20 常态就会撞满推理预算而整轮白跑降级;而召回配额本身只有 5 条记忆+3 条 episode,K=10 已覆盖两倍配额,再往上是花延迟买不到名次变化",
            "desc_en": "Number of fused top-K candidates the reranker rescores; the rest keep RRF order. Bounds rerank cost. Default 10: the cross-encoder is CPU-only and a base-size model spends tens of ms per (query,doc) pair, so K=20 routinely blows the inference budget and wastes the whole pass; the recall quota is only 5 memories + 3 episodes, so K=10 already covers twice the quota and going higher buys latency, not ranking changes.",
        },
    )
    rerank_min_score: float = Field(
        default=0.0,
        json_schema_extra={
            "status": "effective", "ref": "memory/retrieval.py:_rerank",
            "desc_zh": "精排绝对相关性下限(0=只重排不剔除)。>0 时重排分低于该值的候选被丢弃(仅在重排 top-K 内,且全被丢时回退不过滤,防止误配阈值清空召回)",
            "desc_en": "Rerank absolute relevance floor (0 = reorder only, drop nothing). When >0, reranked candidates below it are dropped (within the top-K only; if the floor drops everything it falls back to unfiltered, so a miscalibrated threshold can't empty recall).",
        },
    )
    rerank_timeout_seconds: float = Field(
        default=5.0,
        json_schema_extra={
            "status": "effective", "ref": "memory/local_rerank.py",
            "desc_zh": "精排单次推理的等待预算(秒),超时本轮回退 RRF 原序。仅管推理:模型加载/下载走 rerank_load_timeout_seconds(两者共用一个值时,2s 既等不到 1GB 模型加载完,也不够 base 模型在纯 CPU 上给 top-K 打完分,结果是常态降级)",
            "desc_en": "Per-call wait budget (seconds) for reranker INFERENCE; on timeout this turn keeps the RRF order. Inference only — model load/download uses rerank_load_timeout_seconds. (When both shared one value, 2s was neither enough to load a ~1GB model nor enough for a base-size model to score the top-K on CPU, so every turn degraded.)",
        },
    )
    rerank_load_timeout_seconds: float = Field(
        default=60.0,
        json_schema_extra={
            "status": "effective", "ref": "memory/local_rerank.py",
            "desc_zh": "精排模型加载/下载的单次等待预算(秒),与 embed_load_timeout_seconds 对称。超时不算失败:后台加载继续,本轮回退 RRF 原序,模型就绪后自动接管。设得太小(如按推理预算的 2s)会让每次等待都超时,启动预热也白跑",
            "desc_en": "Per-wait budget (seconds) for reranker model load/download, symmetric with embed_load_timeout_seconds. A timeout is not a failure: the background load continues, this turn keeps the RRF order, and the model is picked up transparently once ready. Setting it as low as the inference budget (2s) makes every wait time out and wastes the startup warmup.",
        },
    )
    embed_load_timeout_seconds: float = Field(
        default=60.0,
        json_schema_extra={
            "status": "effective", "ref": "memory/local_embed.py",
            "desc_zh": "本地嵌入模型首次加载/下载的超时(秒),超时即标记失败并降级为关键词检索,避免下载挂起拖垮进程",
            "desc_en": "Local embedding model first-load/download timeout (seconds); on timeout the embedder is marked failed and degrades to keyword search, preventing a hung download from starving the process",
        },
    )
    local_embedding_cache_dir: str = Field(
        default="~/.codex-pro/models/fastembed",
        json_schema_extra={
            "status": "effective", "ref": "memory/local_embed.py",
            "desc_zh": "本地嵌入模型(fastembed)的缓存目录,安装期预取与运行期共用同一目录以实现离线命中;默认落在 codex-home 下的稳定位置(而非易被系统清理的临时目录),空串则用 fastembed 默认(FASTEMBED_CACHE_PATH 或临时目录)",
            "desc_en": "fastembed cache directory for the local embedding model; install-time prefetch and runtime share this path for offline cache hits. Defaults to a stable location under codex-home (not the volatile tempdir fastembed uses by default). Empty leaves fastembed's default (FASTEMBED_CACHE_PATH or tempdir) untouched",
        },
    )
    local_embedding_max_load_attempts: int = Field(
        default=5,
        json_schema_extra={
            "status": "effective", "ref": "memory/local_embed.py",
            "desc_zh": "本地嵌入模型加载失败后的最大重试次数,超过则本进程保持关键词检索直到重启;避免一次网络抖动就永久降级",
            "desc_en": "Max load attempts for the local embedding model before staying keyword-only until restart; prevents one network blip from permanently degrading the process",
        },
    )
    local_embedding_retry_backoff_seconds: float = Field(
        default=30.0,
        json_schema_extra={
            "status": "effective", "ref": "memory/local_embed.py",
            "desc_zh": "本地嵌入模型加载失败后再次尝试前的退避等待(秒),避免失败后每条消息都反复触发加载",
            "desc_en": "Backoff (seconds) before re-attempting a failed local embedding model load, so a failure does not re-trigger a load on every message",
        },
    )
    contradiction_scan_on_store: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:109",
            "desc_zh": "是否在写入记忆时即时扫描矛盾",
            "desc_en": "Scan for contradictions at memory store time",
        },
    )
    auto_resolve_contradictions: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "memory/consolidator.py:auto_resolve",
            "desc_zh": "睡眠整合时自动消解同 key 矛盾(newest-wins),默认关闭只检测不消解",
            "desc_en": "Auto-resolve same-key contradictions (newest-wins) during sleep consolidation; off by default",
        },
    )
    reflection_enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "memory/reflection.py",
            "desc_zh": "是否启用睡眠反思(归纳提炼+LLM矛盾裁决),随睡眠整合运行",
            "desc_en": "Enable sleep-time reflection (distillation + LLM conflict adjudication), piggybacking on sleep consolidation",
        },
    )

class KnowledgeConfig(_Base):
    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:215",
            "desc_zh": "是否启用知识库检索",
            "desc_en": "Enable knowledge-base retrieval",
        },
    )
    docs_dir: str = Field(
        default="data/knowledge",
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:219",
            "desc_zh": "知识库文档目录",
            "desc_en": "Knowledge base documents directory",
        },
    )
    index_path: str = Field(
        default="data/knowledge_index.json",
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:220",
            "desc_zh": "知识库索引文件路径",
            "desc_en": "Knowledge base index file path",
        },
    )
    auto_index: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:225",
            "desc_zh": "是否自动索引文档目录",
            "desc_en": "Automatically index the documents directory",
        },
    )
    chunk_size: int = Field(
        default=1200,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:221",
            "desc_zh": "文档切块大小(字符)",
            "desc_en": "Document chunk size (characters)",
        },
    )
    chunk_overlap: int = Field(
        default=120,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:222",
            "desc_zh": "相邻切块重叠大小(字符)",
            "desc_en": "Overlap between adjacent chunks (characters)",
        },
    )
    max_results: int = Field(
        default=5,
        json_schema_extra={
            "status": "effective", "ref": "agent/pipeline/context_stage.py:213",
            "desc_zh": "知识检索返回的最大结果数",
            "desc_en": "Maximum knowledge retrieval results returned",
        },
    )
    allowed_extensions: list[str] = Field(
        default_factory=lambda: [
            ".md", ".txt", ".rst", ".json", ".yaml", ".yml", ".py",
            ".pdf", ".docx", ".xlsx", ".pptx",
        ],
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:223",
            "desc_zh": "允许索引的文档扩展名",
            "desc_en": "Document extensions eligible for indexing",
        },
    )

# ── Multi-agent delegation configs ─────────────────────────────────────────────

class WorkerProfileConfig(_Base):
    id: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/multi_agent/registry.py:21",
            "desc_zh": "子代理画像 ID",
            "desc_en": "Worker profile ID",
        },
    )
    name: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/multi_agent/registry.py:22",
            "desc_zh": "子代理名称",
            "desc_en": "Worker profile name",
        },
    )
    description: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/multi_agent/registry.py:23",
            "desc_zh": "子代理用途描述",
            "desc_en": "Worker profile description",
        },
    )
    instructions: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/multi_agent/registry.py:24",
            "desc_zh": "子代理系统指令",
            "desc_en": "Worker profile system instructions",
        },
    )
    default_tools: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "agent/multi_agent/registry.py:25",
            "desc_zh": "子代理默认可用工具",
            "desc_en": "Default tools available to the worker",
        },
    )
    model: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/multi_agent/registry.py:26",
            "desc_zh": "子代理使用的模型",
            "desc_en": "Model used by the worker",
        },
    )
    max_iterations: int = Field(
        default=12, ge=1,
        json_schema_extra={
            "status": "effective", "ref": "agent/multi_agent/registry.py:28",
            "desc_zh": "子代理单任务最大迭代数",
            "desc_en": "Maximum iterations per worker task",
        },
    )
    max_tokens: int = Field(
        default=8192,
        json_schema_extra={
            "status": "effective", "ref": "agent/multi_agent/registry.py:29",
            "desc_zh": "子代理生成最大 token 数",
            "desc_en": "Maximum tokens generated by the worker",
        },
    )
    temperature: float = Field(
        default=0.4,
        json_schema_extra={
            "status": "effective", "ref": "agent/multi_agent/registry.py:30",
            "desc_zh": "子代理采样温度",
            "desc_en": "Worker sampling temperature",
        },
    )

class StorageConfig(_Base):
    database_path: str = Field(
        default="data/codex_pro.db",
        json_schema_extra={
            "status": "effective", "ref": "app.py:71",
            "desc_zh": "SQLite 数据库文件路径",
            "desc_en": "SQLite database file path",
        },
    )
    sessions_dir: str = Field(
        default="data/sessions",
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:98",
            "desc_zh": "会话数据存储目录",
            "desc_en": "Directory storing session data",
        },
    )
    memory_dir: str = Field(
        default="data/memory",
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:103",
            "desc_zh": "记忆数据存储目录",
            "desc_en": "Directory storing memory data",
        },
    )
    logs_dir: str = Field(
        default="data/logs",
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:112",
            "desc_zh": "日志文件存储目录",
            "desc_en": "Directory storing log files",
        },
    )
    spill_dir: str = Field(
        default="data/spill",
        json_schema_extra={
            "status": "effective", "ref": "spill/store.py:1",
            "desc_zh": "工具输出溢出产物的存储目录(必须是工作区内的相对路径专用子目录)",
            "desc_en": "Directory storing spilled tool-output artifacts (must be a dedicated workspace-relative subdirectory)",
        },
    )

    @field_validator("spill_dir")
    @classmethod
    def _spill_dir_must_be_dedicated(cls, v: str) -> str:
        """拒绝把 spill 根指到工作区本身或工作区之外。

        清扫器会在这个目录下删文件。它虽只删自己认得的形状,但把根指到源码树
        仍是配置错误,且让 spill 闸门去屏蔽整个工作区的读取——那会静默废掉
        read_file/search_files。这里挡在源头,比在删除点补救可靠。
        """
        raw = v.strip()
        if not raw:
            raise ValueError("storage.spillDir must not be empty")
        p = PurePosixPath(raw.replace("\\", "/"))
        if p.is_absolute() or (len(raw) > 1 and raw[1] == ":"):
            raise ValueError(
                f"storage.spillDir must be workspace-relative, got absolute path: {v}"
            )
        parts = [seg for seg in p.parts if seg not in (".",)]
        if any(seg == ".." for seg in parts):
            raise ValueError(f"storage.spillDir must not escape the workspace: {v}")
        if not parts:
            raise ValueError(
                "storage.spillDir must be a dedicated subdirectory, not the workspace root"
            )
        return raw

# ── Spill config ─────────────────────────────────────────────────────────────

class SpillConfig(_Base):
    """超长工具输出落盘。跨工具生效,故挂 Config 顶层而非某个工具下。"""

    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "spill/policy.py:1",
            "desc_zh": "是否把超长工具输出落盘并只给模型预览(关闭则回退旧行为:输出由下游按 16000 字符哑截断,尾部结论丢失且无取回路径)",
            "desc_en": "Spill oversized tool output to disk and show the model a preview only (off falls back to the old behaviour: output is bluntly truncated downstream at 16000 chars, losing the trailing conclusion with no way to retrieve it)",
        },
    )
    # 下限 500 不是保守起见:替换文本要装得下取回提示本身(约 100 字符)再加
    # 一点头尾预览,cap 过小 compose 会一路返回 None,于是文件白写、模型仍拿到
    # 超长原文——"配小一点更省 token"的直觉在这里得到相反的结果。
    max_inline_chars: int = Field(
        default=6000, ge=500,
        json_schema_extra={
            "status": "effective", "ref": "spill/policy.py:1",
            "desc_zh": "模型可见的工具输出字符上限,超出则落盘并替换为首尾预览加取回路径",
            "desc_en": "Model-facing character cap for tool output; larger results are spilled and replaced with a head/tail preview",
        },
    )
    # ge=1:0 或负值会让 cutoff 落到当下或未来,一次清扫就删光全部产物,而
    # 模型手里的取回路径此时已经发出去了。
    retention_days: int = Field(
        default=7, ge=1,
        json_schema_extra={
            "status": "effective", "ref": "spill/sweeper.py:1",
            "desc_zh": "spill 产物保留天数,超期删除",
            "desc_en": "Days to retain spill artifacts before deletion",
        },
    )
    max_total_mb: int = Field(
        default=512, ge=1,
        json_schema_extra={
            "status": "effective", "ref": "spill/sweeper.py:1",
            "desc_zh": "spill 产物总体积上限(MB),超出按最旧优先删除",
            "desc_en": "Total size cap (MB) for spill artifacts; oldest are deleted first when exceeded",
        },
    )
    # ge=1 与 sweep_forever 里的 max(1, ...) 兜底一致。差别在于这里会明确报错,
    # 而兜底是静默把 0 改成 1 小时——配错的人得不到任何反馈。
    sweep_interval_hours: int = Field(
        default=6, ge=1,
        json_schema_extra={
            "status": "effective", "ref": "spill/sweeper.py:1",
            "desc_zh": "spill 产物清扫间隔(小时)",
            "desc_en": "Interval (hours) between spill artifact sweeps",
        },
    )

# ── User artifact config ─────────────────────────────────────────────────────

class ArtifactConfig(_Base):
    """Session-scoped, user-deliverable documents created by the agent.

    This is deliberately separate from ``spill``.  Spill files are private
    model scratch output; artifacts are durable user-owned results with an
    explicit draft/finalized lifecycle and a much narrower authority than the
    general-purpose ``write_file`` tool.
    """

    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "artifacts/store.py",
            "desc_zh": "启用会话隔离的用户产物工具",
            "desc_en": "Enable session-scoped user artifact tools",
        },
    )
    root_dir: str = Field(
        default="data/artifacts",
        json_schema_extra={
            "status": "effective", "ref": "artifacts/store.py",
            "desc_zh": "用户产物目录（必须是工作区内的专用相对目录）",
            "desc_en": "User artifact directory (a dedicated workspace-relative directory)",
        },
    )
    max_chunk_chars: int = Field(
        # A chunk is itself generated inside one tool-call JSON argument and
        # therefore consumes model output tokens before the tool can run. Keep
        # the default below common 4k output ceilings, especially for CJK text
        # where one character can approach one token.
        default=3000, ge=500, le=100000,
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/artifact.py",
            "desc_zh": "单次追加到产物的最大字符数",
            "desc_en": "Maximum characters accepted by one artifact append",
        },
    )
    max_artifact_mb: int = Field(
        default=50, ge=1, le=1024,
        json_schema_extra={
            "status": "effective", "ref": "artifacts/store.py",
            "desc_zh": "单个产物最大体积（MB）",
            "desc_en": "Maximum size of one artifact in MB",
        },
    )
    text_fallback_max_chars: int = Field(
        default=100000, ge=1000, le=1000000,
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/artifact.py",
            "desc_zh": "通道不支持附件时，允许自动分段发送的最大产物字符数",
            "desc_en": "Largest artifact eligible for segmented text fallback when attachments are unsupported",
        },
    )
    text_fallback_chunk_chars: int = Field(
        default=1700, ge=500, le=1700,
        json_schema_extra={
            "status": "effective", "ref": "agent/tools/artifact.py",
            "desc_zh": "文本降级交付的单段字符数（默认兼容 Discord 2000 字符限制）",
            "desc_en": "Chunk size for text fallback delivery (default fits Discord's 2000-character limit)",
        },
    )
    retention_days: int = Field(
        default=30, ge=1,
        json_schema_extra={
            "status": "effective", "ref": "artifacts/store.py",
            "desc_zh": "已完成用户产物的建议保留天数",
            "desc_en": "Recommended retention period for finalized artifacts",
        },
    )
    max_total_mb: int = Field(
        default=1024, ge=1,
        json_schema_extra={
            "status": "effective", "ref": "artifacts/sweeper.py",
            "desc_zh": "全部用户产物的总体积上限（MB，超出时最旧优先清理）",
            "desc_en": "Total user artifact size cap in MB (oldest artifacts are removed first)",
        },
    )
    sweep_interval_hours: int = Field(
        default=24, ge=1,
        json_schema_extra={
            "status": "effective", "ref": "artifacts/sweeper.py",
            "desc_zh": "用户产物清理周期（小时）",
            "desc_en": "User artifact cleanup interval in hours",
        },
    )
    allowed_extensions: list[str] = Field(
        default_factory=lambda: [".md", ".txt", ".json", ".csv"],
        json_schema_extra={
            "status": "effective", "ref": "artifacts/store.py",
            "desc_zh": "允许模型创建的文本产物扩展名",
            "desc_en": "Text artifact extensions the model may create",
        },
    )

    @field_validator("root_dir")
    @classmethod
    def _artifact_root_must_be_dedicated(cls, v: str) -> str:
        raw = v.strip()
        if not raw:
            raise ValueError("artifacts.rootDir must not be empty")
        p = PurePosixPath(raw.replace("\\", "/"))
        if p.is_absolute() or (len(raw) > 1 and raw[1] == ":"):
            raise ValueError("artifacts.rootDir must be workspace-relative")
        parts = [seg for seg in p.parts if seg != "."]
        if not parts or any(seg == ".." for seg in parts):
            raise ValueError("artifacts.rootDir must be a dedicated subdirectory inside the workspace")
        return raw

    @field_validator("allowed_extensions")
    @classmethod
    def _normalize_artifact_extensions(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for value in values:
            ext = str(value).strip().lower()
            if (
                not ext.startswith(".")
                or not 2 <= len(ext) <= 16
                or not ext[1:].isalnum()
            ):
                raise ValueError(f"invalid artifact extension: {value}")
            if ext not in normalized:
                normalized.append(ext)
        if not normalized:
            raise ValueError("artifacts.allowedExtensions must not be empty")
        return normalized

    @model_validator(mode="after")
    def _artifact_quotas_must_be_consistent(self) -> "ArtifactConfig":
        if self.max_total_mb < self.max_artifact_mb:
            raise ValueError(
                "artifacts.maxTotalMb must be greater than or equal to maxArtifactMb"
            )
        return self

# ── Observability configs ────────────────────────────────────────────────────


class MultiAgentConfig(_Base):
    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:424",
            "desc_zh": "是否启用多代理委派",
            "desc_en": "Enable multi-agent delegation",
        },
    )
    max_depth: int = Field(
        default=3,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:442",
            "desc_zh": "委派嵌套最大深度",
            "desc_en": "Maximum delegation nesting depth",
        },
    )
    max_parallel_workers: int = Field(
        default=4,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:443",
            "desc_zh": "并行子代理数上限",
            "desc_en": "Maximum parallel workers",
        },
    )
    max_iterations: int = Field(
        default=12, ge=1,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:444",
            "desc_zh": "子代理默认最大迭代数",
            "desc_en": "Default maximum iterations per worker",
        },
    )
    audit_path: str = Field(
        default="data/delegation_audit.jsonl",
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:430",
            "desc_zh": "委派审计日志路径",
            "desc_en": "Delegation audit log path",
        },
    )
    worker_profiles: list[WorkerProfileConfig] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "agent/multi_agent/registry.py:19",
            "desc_zh": "子代理画像配置列表",
            "desc_en": "List of worker profile configurations",
        },
    )


# ── Scheduler configs ───────────────────────────────────────────────────────

