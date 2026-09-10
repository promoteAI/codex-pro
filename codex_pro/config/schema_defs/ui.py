"""Codex Pro configuration schema."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

class _Base(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

# ── Channel configs ──────────────────────────────────────────────────────────

class UIConfig(_Base):
    """User interface preferences (CLI / setup wizard)."""

    locale: Literal["en", "zh", "auto"] = Field(
        default="auto",
        json_schema_extra={
            "status": "effective", "ref": "cli/setup/__init__.py:127",
            "desc_zh": "界面语言",
            "desc_en": "Interface language",
        },
    )

class ToolConcurrencyConfig(_Base):
    """Concurrent execution of read-only, non-overlapping tool calls."""

    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/pipeline/inference_stage.py",
            "desc_zh": "是否对只读、路径不冲突的工具并发执行",
            "desc_en": "Run read-only, non-overlapping tool calls concurrently",
        },
    )
    max_concurrent: int = Field(
        default=4,
        ge=1,
        json_schema_extra={
            "status": "effective", "ref": "agent/pipeline/inference_stage.py",
            "desc_zh": "工具并发上限(1 等价关闭并发,退化为串行)",
            "desc_en": "Max concurrent tools (1 disables concurrency = serial)",
        },
    )

class HeartbeatConfig(_Base):
    """Long-running-turn progress heartbeat (level-triggered feedback)."""

    enabled: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/progress_heartbeat.py",
            "desc_zh": "长任务静默时是否定时播报进度心跳",
            "desc_en": "Emit periodic progress heartbeat during long-running turns",
        },
    )
    first_delay_sec: int = Field(
        default=30, ge=0,
        json_schema_extra={
            "status": "effective", "ref": "agent/progress_heartbeat.py",
            "desc_zh": "首条心跳前的静默阈值(秒),短任务不触发",
            "desc_en": "Silence threshold (sec) before the first heartbeat",
        },
    )
    min_interval_sec: int = Field(
        default=60, ge=1,
        json_schema_extra={
            "status": "effective", "ref": "agent/progress_heartbeat.py",
            "desc_zh": "两次可见反馈之间的最小间隔(秒),压制高频里程碑",
            "desc_en": "Minimum interval (sec) between visible feedback",
        },
    )
    verbosity: Literal["key_milestones", "every_tool", "silent"] = Field(
        default="key_milestones",
        json_schema_extra={
            "status": "effective", "ref": "channels/manager.py",
            "desc_zh": "心跳详细度:仅关键里程碑/每个工具/不发文字",
            "desc_en": "Heartbeat verbosity tier",
        },
    )
    template: str = Field(
        default="⏳ {activity}（已用时 {elapsed}）",
        json_schema_extra={
            "status": "effective", "ref": "agent/progress_heartbeat.py",
            "desc_zh": "心跳文案模板,支持 {elapsed} 与 {activity} 占位",
            "desc_en": "Heartbeat text template with {elapsed}/{activity}",
        },
    )

class InspectionConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "app.py",
            "desc_zh": "是否开启主动巡检（默认关；需在 INSPECT.md 声明巡检项）",
            "desc_en": "Enable proactive inspection (default off; declare items in INSPECT.md)",
        },
    )
    tick_interval_sec: int = Field(
        default=300,
        json_schema_extra={
            "status": "effective", "ref": "app.py",
            "desc_zh": "巡检节拍器扫描到期项的间隔（秒），非每项巡检频率",
            "desc_en": "Inspection tick interval (seconds) for scanning due items",
        },
    )
    inspect_file: str = Field(
        default="INSPECT.md",
        json_schema_extra={
            "status": "effective", "ref": "agent/inspection/store.py",
            "desc_zh": "巡检清单文件名（workspace 相对路径）",
            "desc_en": "Inspection checklist filename (workspace-relative)",
        },
    )
    max_items_per_tick: int = Field(
        default=5,
        json_schema_extra={
            "status": "effective", "ref": "agent/inspection/store.py",
            "desc_zh": "单次节拍最多投给 agent 的到期巡检项数",
            "desc_en": "Max due items dispatched to the agent per tick",
        },
    )
    deliver_channel: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "app.py",
            "desc_zh": "巡检告警投递通道（空则用注册时的 session 兜底）",
            "desc_en": "Inspection alert delivery channel (empty falls back to registering session)",
        },
    )
    deliver_chat_id: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "app.py",
            "desc_zh": "巡检告警投递会话 id（空则用注册时的 session 兜底）",
            "desc_en": "Inspection alert delivery chat id (empty falls back to registering session)",
        },
    )

class AgentBehaviorConfig(_Base):
    """High-level agent loop tuning surfaced by the setup wizard.

    These mirror knobs scattered across other configs but give the wizard
    a single, opinionated home so users don't have to know that
    ``max_iterations`` lives elsewhere. ``AgentLoop`` reads from here when
    a value is non-default; otherwise it falls back to its built-in 40.
    """

    max_iterations: int = Field(
        default=40, ge=1,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:236",
            "desc_zh": "agent 主循环最大迭代数",
            "desc_en": "Maximum iterations of the agent main loop",
        },
    )
    max_output_continuations: int = Field(
        default=3, ge=0, le=10,
        json_schema_extra={
            "status": "effective", "ref": "agent/pipeline/inference_stage.py",
            "desc_zh": "模型命中单次输出上限后自动续写的最大次数",
            "desc_en": "Maximum automatic continuations after a model output-length stop",
        },
    )
    continuation_overlap_chars: int = Field(
        default=2000, ge=100, le=10000,
        json_schema_extra={
            "status": "effective", "ref": "agent/pipeline/inference_stage.py",
            "desc_zh": "自动续写时用于检测并去除重复文本的窗口字符数",
            "desc_en": "Character window used to remove overlap between continuation chunks",
        },
    )
    tool_concurrency: ToolConcurrencyConfig = Field(
        default_factory=ToolConcurrencyConfig,
    )
    heartbeat: HeartbeatConfig = Field(default_factory=HeartbeatConfig)
    inspection: InspectionConfig = Field(default_factory=InspectionConfig)

