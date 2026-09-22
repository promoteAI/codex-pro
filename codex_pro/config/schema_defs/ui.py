"""Codex Pro configuration schema."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

class _Base(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

# ── Channel configs ──────────────────────────────────────────────────────────

class UIPreferences(_Base):
    """Web UI preferences persisted through /config.

    These are client-side prefs (theme, terminal layout, git/worktree knobs,
    instructions) that the settings pages read on mount and write on change.
    They live under ``ui.preferences`` so they round-trip through the generic
    /config GET/PATCH API without colliding with the backend-driven ``ui``
    fields such as ``locale``.
    """

    # ── Appearance ────────────────────────────────────────────────────────────
    theme: Literal["system", "light", "dark"] = Field(
        default="dark",
        json_schema_extra={"desc_zh": "界面主题", "desc_en": "UI theme"},
    )
    contrast: int = Field(
        default=45, ge=0, le=100,
        json_schema_extra={"desc_zh": "界面对比度", "desc_en": "UI contrast"},
    )
    translucent_sidebar: bool = Field(
        default=True,
        json_schema_extra={"desc_zh": "半透明侧边栏", "desc_en": "Translucent sidebar"},
    )

    # ── General / editor ─────────────────────────────────────────────────────
    no_project_folder: str = Field(
        default="C:/Users/cheris/Documents/Codex",
        json_schema_extra={"desc_zh": "无项目任务文件夹", "desc_en": "Default no-project task folder"},
    )
    agent_env: Literal["windows_native", "wsl"] = Field(
        default="windows_native",
        json_schema_extra={"desc_zh": "Agent 运行环境", "desc_en": "Agent runtime environment"},
    )
    open_in: str = Field(
        default="vscode",
        json_schema_extra={"desc_zh": "默认文件打开位置", "desc_en": "Default open-in editor"},
    )
    integrated_shell: str = Field(
        default="PowerShell",
        json_schema_extra={"desc_zh": "集成终端 Shell", "desc_en": "Integrated terminal shell"},
    )
    terminal_position: Literal["bottom", "right"] = Field(
        default="bottom",
        json_schema_extra={"desc_zh": "默认终端位置", "desc_en": "Default terminal position"},
    )
    bottom_panel: bool = Field(
        default=True,
        json_schema_extra={"desc_zh": "底部面板", "desc_en": "Bottom panel controls"},
    )
    plugins_enabled: bool = Field(
        default=True,
        json_schema_extra={"desc_zh": "启用插件", "desc_en": "Enable plugins"},
    )
    plain_editor: bool = Field(
        default=False,
        json_schema_extra={"desc_zh": "纯文本编辑器", "desc_en": "Plain text editor"},
    )
    show_context_usage: bool = Field(
        default=False,
        json_schema_extra={"desc_zh": "显示上下文窗口使用情况", "desc_en": "Show context window usage"},
    )
    follow_up_mode: Literal["queue", "steer"] = Field(
        default="queue",
        json_schema_extra={"desc_zh": "跟进处理方式", "desc_en": "Follow-up mode"},
    )
    standalone_chat: bool = Field(
        default=False,
        json_schema_extra={"desc_zh": "默认使用独立聊天", "desc_en": "Default to standalone chat"},
    )
    default_permissions: bool = Field(
        default=True,
        json_schema_extra={"desc_zh": "默认权限", "desc_en": "Default permissions"},
    )
    full_access: bool = Field(
        default=True,
        json_schema_extra={"desc_zh": "完整访问权限", "desc_en": "Full access permission"},
    )
    permission_notify: bool = Field(
        default=True,
        json_schema_extra={"desc_zh": "启用权限通知", "desc_en": "Enable permission notifications"},
    )
    question_notify: bool = Field(
        default=True,
        json_schema_extra={"desc_zh": "启用问题通知", "desc_en": "Enable question notifications"},
    )
    turn_notify_mode: Literal["unfocused", "never", "always"] = Field(
        default="unfocused",
        json_schema_extra={
            "desc_zh": "轮次完成通知时机",
            "desc_en": "When to notify after a turn completes",
        },
    )

    # ── Agent ────────────────────────────────────────────────────────────────
    web_search: bool = Field(
        default=True,
        json_schema_extra={"desc_zh": "允许网页搜索", "desc_en": "Allow web search"},
    )
    ultra_in_picker: bool = Field(
        default=False,
        json_schema_extra={"desc_zh": "模型选择器中的 Ultra", "desc_en": "Ultra in model picker"},
    )
    workspace_deps: bool = Field(
        default=True,
        json_schema_extra={"desc_zh": "Codex 依赖项", "desc_en": "Workspace dependencies"},
    )

    # ── Personalization ──────────────────────────────────────────────────────
    codex_instructions: str = Field(
        default="",
        json_schema_extra={"desc_zh": "Codex 自定义说明", "desc_en": "Codex custom instructions"},
    )
    local_memory: bool = Field(
        default=False,
        json_schema_extra={"desc_zh": "启用本地记忆", "desc_en": "Enable local memory"},
    )
    tool_memory: bool = Field(
        default=True,
        json_schema_extra={"desc_zh": "允许工具辅助记忆", "desc_en": "Enable tool-assisted memory"},
    )

    # ── Computer control ─────────────────────────────────────────────────────
    allow_any_screen: bool = Field(
        default=True,
        json_schema_extra={"desc_zh": "允许任意屏幕", "desc_en": "Allow any screen"},
    )
    chrome_enabled: bool = Field(
        default=True,
        json_schema_extra={"desc_zh": "启用 Chrome 连接", "desc_en": "Enable Chrome connection"},
    )
    excel_enabled: bool = Field(
        default=True,
        json_schema_extra={"desc_zh": "启用 Excel 加载项", "desc_en": "Enable Excel add-in"},
    )

    # ── Browser ──────────────────────────────────────────────────────────────
    embedded_browser: bool = Field(
        default=True,
        json_schema_extra={"desc_zh": "嵌入式浏览器", "desc_en": "Embedded browser"},
    )
    ignore_cert: bool = Field(
        default=True,
        json_schema_extra={"desc_zh": "忽略证书校验", "desc_en": "Ignore certificate validation"},
    )

    # ── Git ──────────────────────────────────────────────────────────────────
    git_branch_prefix: str = Field(
        default="codex_pro",
        json_schema_extra={"desc_zh": "分支前缀", "desc_en": "Branch prefix"},
    )
    git_merge_method: Literal["merge", "squash"] = Field(
        default="merge",
        json_schema_extra={"desc_zh": "PR 合并方法", "desc_en": "PR merge method"},
    )
    git_force_push: bool = Field(
        default=False,
        json_schema_extra={"desc_zh": "强制推送", "desc_en": "Force push"},
    )
    git_draft_pr: bool = Field(
        default=True,
        json_schema_extra={"desc_zh": "创建草稿 PR", "desc_en": "Draft PR"},
    )
    git_review_presentation: Literal["inline", "separate"] = Field(
        default="separate",
        json_schema_extra={"desc_zh": "审查请求呈现方式", "desc_en": "Review presentation"},
    )
    git_auto_merge: bool = Field(
        default=False,
        json_schema_extra={"desc_zh": "准备就绪时自动合并", "desc_en": "Auto-merge when ready"},
    )
    git_monitor_instr: str = Field(
        default="",
        json_schema_extra={"desc_zh": "监控 PR 说明", "desc_en": "Monitor PR instructions"},
    )
    git_commit_instr: str = Field(
        default="",
        json_schema_extra={"desc_zh": "提交说明", "desc_en": "Commit instructions"},
    )
    git_pr_instr: str = Field(
        default="",
        json_schema_extra={"desc_zh": "PR 说明", "desc_en": "PR instructions"},
    )

    # ── Worktrees ────────────────────────────────────────────────────────────
    worktree_root: str = Field(
        default="C:/Users/cheris/.codex/worktrees",
        json_schema_extra={"desc_zh": "工作树根目录", "desc_en": "Worktree root"},
    )
    worktree_pull_upstream: bool = Field(
        default=False,
        json_schema_extra={"desc_zh": "创建工作树时拉取上游", "desc_en": "Pull upstream on create"},
    )
    worktree_auto_delete: bool = Field(
        default=True,
        json_schema_extra={"desc_zh": "自动删除已完成工作树", "desc_en": "Auto-delete completed worktrees"},
    )
    worktree_delete_limit: int = Field(
        default=15, ge=1, le=999,
        json_schema_extra={"desc_zh": "自动删除限制", "desc_en": "Auto-delete limit"},
    )


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
    preferences: UIPreferences = Field(default_factory=UIPreferences)

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

