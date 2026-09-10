"""Codex Pro configuration schema."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

class _Base(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

# ── Channel configs ──────────────────────────────────────────────────────────

class SkillsConfig(_Base):
    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:457",
            "desc_zh": "是否启用技能系统",
            "desc_en": "Enable the skills system",
        },
    )
    skills_dir: str = Field(
        default="skills",
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:458",
            "desc_zh": "技能脚本目录",
            "desc_en": "Skills directory",
        },
    )
    creation_nudge_interval: int = Field(
        default=10,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:470",
            "desc_zh": "提示创建技能的轮次间隔",
            "desc_en": "Turn interval for nudging skill creation",
        },
    )
    disabled: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:463",
            "desc_zh": "禁用的技能列表",
            "desc_en": "List of disabled skills",
        },
    )
    external_dirs: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:462",
            "desc_zh": "额外加载技能的外部目录",
            "desc_en": "External directories from which to load skills",
        },
    )
    allow_lazy_installs: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "dependencies/lazy_deps.py:168",
            "desc_zh": "是否允许技能运行时按需安装依赖",
            "desc_en": "Allow lazy on-demand dependency installs for skills",
        },
    )
    admission_policy: Literal["auto_write", "stage_for_review", "manual_only"] = Field(
        default="stage_for_review",
        json_schema_extra={
            "status": "effective", "ref": "skills/admission.py",
            "desc_zh": "技能自动沉淀准入策略:auto_write 按风险自动写 / stage_for_review 低风险自动高风险暂存 / manual_only 一律暂存",
            "desc_en": "Skill auto-distillation admission policy",
        },
    )
    auto_write_risk: Literal["low", "high"] = Field(
        default="low",
        json_schema_extra={
            "status": "effective", "ref": "skills/admission.py",
            "desc_zh": "auto_write 档下允许自动写盘的最高风险等级",
            "desc_en": "Highest risk level auto-written under the auto_write policy",
        },
    )

# ── Bus configs ─────────────────────────────────────────────────────────────

class BusConfig(_Base):
    max_queue_size: int = Field(
        default=1000,
        json_schema_extra={
            "status": "effective", "ref": "app.py:75",
            "desc_zh": "事件总线队列容量上限",
            "desc_en": "Event bus queue capacity",
        },
    )
    max_concurrency: int = Field(
        default=50,
        json_schema_extra={
            "status": "effective", "ref": "app.py:76",
            "desc_zh": "事件总线并发处理上限",
            "desc_en": "Event bus max concurrent handlers",
        },
    )

# ── Rate limit configs ──────────────────────────────────────────────────────

class RateLimitConfig(_Base):
    session_rpm: int = Field(
        default=20,
        json_schema_extra={
            "status": "effective", "ref": "app.py:81",
            "desc_zh": "单会话每分钟请求上限",
            "desc_en": "Per-session requests-per-minute cap",
        },
    )
    session_burst: int = Field(
        default=5,
        json_schema_extra={
            "status": "effective", "ref": "app.py:82",
            "desc_zh": "单会话突发请求上限",
            "desc_en": "Per-session burst allowance",
        },
    )

# ── Circuit breaker configs ─────────────────────────────────────────────────

class CircuitBreakerConfig(_Base):
    failure_threshold: int = Field(
        default=5,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:253",
            "desc_zh": "触发熔断的连续失败次数",
            "desc_en": "Consecutive failures that trip the breaker",
        },
    )
    recovery_seconds: float = Field(
        default=60.0,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:254",
            "desc_zh": "熔断后尝试恢复的等待时间(秒)",
            "desc_en": "Wait before attempting recovery after tripping (seconds)",
        },
    )
    half_open_max: int = Field(
        default=2,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:255",
            "desc_zh": "半开状态允许的试探请求数",
            "desc_en": "Probe requests allowed in half-open state",
        },
    )

# ── Root config ──────────────────────────────────────────────────────────────

class PlanningConfig(_Base):
    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:189",
            "desc_zh": "是否启用任务规划",
            "desc_en": "Enable task planning",
        },
    )
    default_strategy: str = Field(
        default="auto",
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:193",
            "desc_zh": "默认规划策略",
            "desc_en": "Default planning strategy",
        },
    )
    max_tree_depth: int = Field(
        default=5,
        json_schema_extra={
            "status": "dead", "disposition": "fix",
            "reason": "AgentPlanner 原先只将 max_tree_depth 存入 _max_tree_depth 且从不读取;"
                      "该无效属性已删除,但构造参数仍为兼容现有配置而保留,"
                      "当前不消费该值。"
                      "ToT 策略做的是广度(max_branches 个候选,无递归),LATS 直接委托 "
                      "PlanExecuteStrategy 也无 MCTS 深度,即没有任何'树深度'可限制。"
                      "接线前需先实现深度语义,故标 fix 而非 remove。",
            "desc_zh": "规划树最大深度",
            "desc_en": "Maximum planning tree depth",
        },
    )
    max_branches: int = Field(
        default=3,
        json_schema_extra={
            "status": "effective", "ref": "agent/planning/strategies.py:131",
            "desc_zh": "思维树(ToT)策略探索的候选分支数",
            "desc_en": "Number of candidate branches the Tree-of-Thought strategy explores",
        },
    )
    reflection_enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:195",
            "desc_zh": "是否启用规划反思",
            "desc_en": "Enable planning reflection",
        },
    )

class A2AConfig(_Base):
    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "gateway/server.py:209",
            "desc_zh": "是否启用 A2A(agent-to-agent)接口",
            "desc_en": "Enable the A2A (agent-to-agent) interface",
        },
    )
    agent_name: str = Field(
        default="codex-pro",
        json_schema_extra={
            "status": "effective", "ref": "gateway/server.py:213",
            "desc_zh": "对外暴露的 A2A 代理名",
            "desc_en": "Agent name exposed over A2A",
        },
    )
    agent_description: str = Field(
        default="A modular AI agent framework",
        json_schema_extra={
            "status": "effective", "ref": "gateway/server.py:214",
            "desc_zh": "对外暴露的 A2A 代理描述",
            "desc_en": "Agent description exposed over A2A",
        },
    )
    capabilities: list[str] = Field(
        default_factory=lambda: ["chat", "tool_use"],
        json_schema_extra={
            "status": "effective", "ref": "gateway/server.py:212",
            "desc_zh": "A2A AgentCard 对外声明的能力标签",
            "desc_en": "Capability tags advertised in the A2A AgentCard",
        },
    )
    # Task retention. The store is in-memory only, so these bound how much a
    # long-running server accumulates; operators need them reachable to shrink
    # retention under load.
    task_ttl_seconds: float = Field(
        default=3600.0, gt=0,
        json_schema_extra={
            "status": "effective", "ref": "a2a/server.py:34",
            "desc_zh": "A2A 终态任务保留时长(秒),超时后回收;tasks/get 在此窗口内仍可取回结果",
            "desc_en": "How long terminal A2A tasks are retained (seconds) before reclamation",
        },
    )
    max_tasks: int = Field(
        default=1000, gt=0,
        json_schema_extra={
            "status": "effective", "ref": "a2a/server.py:34",
            "desc_zh": "A2A 任务仓库容量上限,超出时淘汰最老的终态任务",
            "desc_en": "Capacity of the A2A task store; oldest terminal tasks are evicted past it",
        },
    )
    active_task_ttl_seconds: float = Field(
        default=86400.0, gt=0,
        json_schema_extra={
            "status": "effective", "ref": "a2a/task_store.py:52",
            "desc_zh": "未达终态任务的兜底保留时长(秒),防卡住的任务永久占用;非任务超时",
            "desc_en": "Backstop retention for non-terminal A2A tasks (seconds); a leak guard, not a task deadline",
        },
    )

class PluginsConfig(_Base):
    """Plugin system configuration."""

    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "plugins/manager.py:62",
            "desc_zh": "是否启用插件系统",
            "desc_en": "Enable the plugin system",
        },
    )
    allow: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "plugins/manager.py:103",
            "desc_zh": "允许加载的插件白名单",
            "desc_en": "Allowlist of plugins permitted to load",
        },
    )
    deny: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "plugins/manager.py:102",
            "desc_zh": "禁止加载的插件黑名单",
            "desc_en": "Blocklist of plugins forbidden from loading",
        },
    )
    extra_dirs: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "plugins/manager.py:67",
            "desc_zh": "额外的插件搜索目录",
            "desc_en": "Additional plugin search directories",
        },
    )
    config: dict[str, dict[str, Any]] = Field(
        default_factory=dict,
        json_schema_extra={
            "status": "effective", "ref": "plugins/manager.py:140",
            "desc_zh": "各插件的自定义配置(键为插件名)",
            "desc_en": "Per-plugin custom configuration keyed by plugin",
        },
    )
    trusted_plugins: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "plugins/manager.py:144",
            "desc_zh": "免权限校验的可信插件列表",
            "desc_en": "Trusted plugins exempt from permission checks",
        },
    )
    permission_mode: Literal["compat", "strict"] = Field(
        default="compat",
        json_schema_extra={
            "status": "effective", "ref": "plugins/manager.py:146",
            "desc_zh": "插件权限模式",
            "desc_en": "Plugin permission mode",
        },
    )

class EvalConfig(_Base):
    dataset_path: str = Field(
        default="data/eval",
        json_schema_extra={
            "status": "effective", "ref": "__main__.py:31",
            "desc_zh": "评测数据集路径",
            "desc_en": "Evaluation dataset path",
        },
    )
    timeout_per_case: int = Field(
        default=120,
        json_schema_extra={
            "status": "effective", "ref": "__main__.py:61",
            "desc_zh": "单条评测用例超时(秒)",
            "desc_en": "Timeout per evaluation case (seconds)",
        },
    )

class EvolutionConfig(_Base):
    """Self-evolving skill harness — see codex_pro/evolution/."""

    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "app.py:151",
            "desc_zh": "是否启用自进化技能引擎",
            "desc_en": "Enable the self-evolving skill engine",
        },
    )
    trigger_mode: Literal["manual", "threshold", "scheduled"] = Field(
        default="manual",
        json_schema_extra={
            "status": "effective", "ref": "evolution/engine.py:101",
            "desc_zh": "进化触发模式",
            "desc_en": "Evolution trigger mode",
        },
    )
    threshold_trajectories: int = Field(
        default=50,
        json_schema_extra={
            "status": "effective", "ref": "evolution/engine.py:102",
            "desc_zh": "threshold 模式触发所需轨迹数",
            "desc_en": "Trajectory count triggering threshold mode",
        },
    )
    cron_expression: str = Field(
        default="0 4 * * *",
        json_schema_extra={
            "status": "effective", "ref": "evolution/engine.py:103",
            "desc_zh": "scheduled 模式的 cron 表达式",
            "desc_en": "Cron expression for scheduled mode",
        },
    )
    max_candidates_per_run: int = Field(
        default=3,
        json_schema_extra={
            "status": "effective", "ref": "evolution/engine.py:80",
            "desc_zh": "单次进化生成的候选上限",
            "desc_en": "Maximum candidates generated per run",
        },
    )
    max_trajectories_per_run: int = Field(
        default=200,
        json_schema_extra={
            "status": "effective", "ref": "evolution/engine.py:347",
            "desc_zh": "单次进化处理的轨迹上限",
            "desc_en": "Maximum trajectories processed per run",
        },
    )
    eval_dataset_path: str = Field(
        default="data/eval/baseline.yaml",
        json_schema_extra={
            "status": "effective", "ref": "app.py:157",
            "desc_zh": "进化评测基线数据集路径",
            "desc_en": "Evolution evaluation baseline dataset path",
        },
    )
    regression_threshold: float = Field(
        default=0.05,
        json_schema_extra={
            "status": "effective", "ref": "evolution/engine.py:91",
            "desc_zh": "判定回归的分数下降阈值",
            "desc_en": "Score-drop threshold that flags a regression",
        },
    )
    require_strict_improvement: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "evolution/engine.py:92",
            "desc_zh": "是否要求严格改进才晋升",
            "desc_en": "Require strict improvement before promotion",
        },
    )
    min_eval_cases: int = Field(
        default=3,
        json_schema_extra={
            "status": "effective", "ref": "evolution/gate.py:490",
            "desc_zh": "晋升所需的最小评测用例数,样本不足则判定不确定不晋升",
            "desc_en": "Minimum eval cases required to promote; fewer is inconclusive",
        },
    )
    record_trajectories: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "evolution/engine.py:126",
            "desc_zh": "是否记录执行轨迹用于进化",
            "desc_en": "Record execution trajectories for evolution",
        },
    )
    trajectory_retention_days: int = Field(
        default=30,
        json_schema_extra={
            "status": "effective", "ref": "evolution/engine.py:128",
            "desc_zh": "轨迹保留天数",
            "desc_en": "Trajectory retention period (days)",
        },
    )
    evolver_model: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "evolution/engine.py:81",
            "desc_zh": "执行进化所用模型",
            "desc_en": "Model used to perform evolution",
        },
    )
    skill_size_limit_bytes: int = Field(
        default=50_000,
        json_schema_extra={
            "status": "effective", "ref": "evolution/engine.py:82",
            "desc_zh": "进化产出技能的大小上限(字节)",
            "desc_en": "Size limit for evolved skills (bytes)",
        },
    )
    redact_args: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "evolution/engine.py:72",
            "desc_zh": "记录轨迹时是否脱敏工具参数",
            "desc_en": "Redact tool arguments when recording trajectories",
        },
    )
    eval_parallel: int = Field(
        default=2,
        json_schema_extra={
            "status": "effective", "ref": "app.py:167",
            "desc_zh": "进化评测并发度",
            "desc_en": "Evolution evaluation parallelism",
        },
    )
    eval_timeout_seconds: int = Field(
        default=60,
        json_schema_extra={
            "status": "effective", "ref": "app.py:168",
            "desc_zh": "进化评测单用例超时(秒)",
            "desc_en": "Evolution evaluation per-case timeout (seconds)",
        },
    )
    cooldown_seconds_after_promote: int = Field(
        default=86_400,
        json_schema_extra={
            "status": "effective", "ref": "evolution/engine.py:93",
            "desc_zh": "晋升后再次进化的冷却时间(秒)",
            "desc_en": "Cooldown after a promotion before evolving again (seconds)",
        },
    )
    auto_promote: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "evolution/engine.py:94",
            "desc_zh": "是否自动晋升通过评测的候选",
            "desc_en": "Auto-promote candidates that pass evaluation",
        },
    )
    candidate_review_required: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "evolution/engine.py:95",
            "desc_zh": "晋升前是否需要人工审查候选",
            "desc_en": "Require human review of candidates before promotion",
        },
    )


class SchedulerConfig(_Base):
    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "app.py:118",
            "desc_zh": "是否启用任务调度器",
            "desc_en": "Enable the task scheduler",
        },
    )
    max_concurrent_jobs: int = Field(
        default=10,
        json_schema_extra={
            "status": "effective", "ref": "app.py:122",
            "desc_zh": "并发任务数上限",
            "desc_en": "Maximum concurrent scheduled jobs",
        },
    )


# ── Checkpoint configs ───────────────────────────────────────────────────────

class CheckpointConfig(_Base):
    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "checkpoint/manager.py",
            "desc_zh": "是否开启编辑前影子git快照安全网（探测不到git时自动降级）",
            "desc_en": "Enable pre-edit shadow-git checkpoint safety net (auto-degrades if git missing)",
        },
    )
    store_path: str = Field(
        default="~/.codex-pro/checkpoints/store",
        json_schema_extra={
            "status": "effective", "ref": "checkpoint/store.py",
            "desc_zh": "影子git仓库存放路径",
            "desc_en": "Path to the shadow git store",
        },
    )
    max_snapshots_per_workspace: int = Field(
        default=20,
        json_schema_extra={
            "status": "effective", "ref": "checkpoint/manager.py",
            "desc_zh": "每个工作区保留的最大快照数量",
            "desc_en": "Max snapshots retained per workspace",
        },
    )
    max_total_size_mb: int = Field(
        default=500,
        json_schema_extra={
            "status": "effective", "ref": "checkpoint/manager.py",
            "desc_zh": "整个store的总大小上限（MB），超出触发gc",
            "desc_en": "Total store size cap in MB; exceeding triggers gc",
        },
    )
    max_file_size_mb: int = Field(
        default=10,
        json_schema_extra={
            "status": "effective", "ref": "checkpoint/store.py",
            "desc_zh": "单文件超过此大小（MB）不纳入快照",
            "desc_en": "Files larger than this (MB) are excluded from snapshots",
        },
    )


# ── Validation configs ───────────────────────────────────────────────────────

class ValidationConfig(_Base):
    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "validation/__init__.py",
            "desc_zh": "是否开启写后增量校验反馈（检查器探测不到时自动降级）",
            "desc_en": "Enable post-write incremental validation feedback (auto-degrades if checkers missing)",
        },
    )
    timeout_sec: float = Field(
        default=5.0,
        json_schema_extra={
            "status": "effective", "ref": "validation/validator.py",
            "desc_zh": "单个文件校验的超时上限（秒），超时静默跳过",
            "desc_en": "Per-file validation timeout in seconds; times out silently",
        },
    )
    max_diagnostics: int = Field(
        default=10,
        json_schema_extra={
            "status": "effective", "ref": "validation/validator.py",
            "desc_zh": "追加到工具结果的诊断条数上限",
            "desc_en": "Max diagnostics appended to the tool result",
        },
    )
    max_file_size_kb: int = Field(
        default=512,
        json_schema_extra={
            "status": "effective", "ref": "validation/validator.py",
            "desc_zh": "超过此大小（KB）的文件跳过校验",
            "desc_en": "Files larger than this (KB) skip validation",
        },
    )


# ── Media understanding configs ──────────────────────────────────────────────

class MediaUnderstandingConfig(_Base):
    audio_enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/media/understanding/registry.py",
            "desc_zh": "是否开启入站音频/语音转写（provider 探测不到时自动降级）",
            "desc_en": "Enable inbound audio/voice transcription (auto-degrades if no provider)",
        },
    )
    audio_provider: str = Field(
        default="auto",
        json_schema_extra={
            "status": "effective", "ref": "agent/media/understanding/registry.py",
            "desc_zh": "转写后端：auto(探测) / cloud(云) / local(本地 faster-whisper)",
            "desc_en": "Transcribe backend: auto (probe) / cloud / local (faster-whisper)",
        },
    )
    min_audio_size_kb: float = Field(
        default=1.0,
        json_schema_extra={
            "status": "effective", "ref": "agent/media/understanding/audio.py",
            "desc_zh": "小于此大小(KB)的音频跳过转写（噪音/误触）",
            "desc_en": "Audio smaller than this (KB) skips transcription",
        },
    )
    max_audio_size_kb: int = Field(
        default=25000,
        json_schema_extra={
            "status": "effective", "ref": "agent/media/understanding/audio.py",
            "desc_zh": "大于此大小(KB)的音频跳过转写（控成本）",
            "desc_en": "Audio larger than this (KB) skips transcription",
        },
    )
    local_model_size: str = Field(
        default="base",
        json_schema_extra={
            "status": "effective", "ref": "agent/media/understanding/audio.py",
            "desc_zh": "本地 faster-whisper 模型规格（tiny/base/small/...）",
            "desc_en": "Local faster-whisper model size (tiny/base/small/...)",
        },
    )
    video_enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/media/understanding/registry.py",
            "desc_zh": "是否开启入站视频理解（抽帧+音轨；provider/ffmpeg 探测不到自动降级）",
            "desc_en": "Enable inbound video understanding (frames + audio; auto-degrades)",
        },
    )
    video_frame_count: int = Field(
        default=4,
        json_schema_extra={
            "status": "effective", "ref": "agent/media/understanding/video.py",
            "desc_zh": "视频均匀抽帧数（喂 vision 模型）",
            "desc_en": "Number of frames uniformly sampled from a video",
        },
    )
    video_vision_model: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/media/understanding/video.py",
            "desc_zh": "视频画面描述的 vision 模型覆盖（空=用 provider 默认模型）",
            "desc_en": "Vision model override for video captioning (empty = provider default)",
        },
    )
    video_vision_prompt: str = Field(
        default="简要描述这段视频的画面内容。",
        json_schema_extra={
            "status": "effective", "ref": "agent/media/understanding/video.py",
            "desc_zh": "视频抽帧描述的提示词",
            "desc_en": "Prompt for video frame captioning",
        },
    )
    min_video_size_kb: float = Field(
        default=1.0,
        json_schema_extra={
            "status": "effective", "ref": "agent/media/understanding/video.py",
            "desc_zh": "小于此大小(KB)的视频跳过理解",
            "desc_en": "Video smaller than this (KB) skips understanding",
        },
    )
    max_video_size_kb: int = Field(
        default=204800,
        json_schema_extra={
            "status": "effective", "ref": "agent/media/understanding/video.py",
            "desc_zh": "大于此大小(KB)的视频跳过理解（≈200MB，成本护栏）",
            "desc_en": "Video larger than this (KB) skips understanding (~200MB cost guard)",
        },
    )
    video_ffmpeg_concurrency: int = Field(
        default=2,
        json_schema_extra={
            "status": "effective", "ref": "agent/media/understanding/video.py",
            "desc_zh": "同时运行的 ffmpeg 抽帧/抽音轨进程数上限（防多视频打爆 CPU）",
            "desc_en": "Max concurrent ffmpeg processes for video frame/audio extraction",
        },
    )
    transcription_base_url: str = Field(
        default="https://api.groq.com/openai/v1",
        json_schema_extra={
            "status": "effective", "ref": "agent/media/understanding/registry.py",
            "desc_zh": "云转写端点 base_url（OpenAI 兼容 /audio/transcriptions）",
            "desc_en": "Cloud transcription endpoint base_url (OpenAI-compatible)",
        },
    )
    transcription_model: str = Field(
        default="whisper-large-v3",
        json_schema_extra={
            "status": "effective", "ref": "agent/media/understanding/registry.py",
            "desc_zh": "云转写模型名",
            "desc_en": "Cloud transcription model name",
        },
    )


# ── Storage configs ──────────────────────────────────────────────────────────

class RuntimeConfig(_Base):
    single_instance: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "app.py:AppRuntime.start",
            "desc_zh": "同一 workspace 是否只允许运行一个消费通道的实例（防止后台服务与前台 run 重复消费、重复回复）；用 --force 可临时越过",
            "desc_en": "Allow only one channel-consuming instance per workspace (prevents duplicate consumption/replies when a background service and a foreground run coexist); --force overrides it",
        },
    )


