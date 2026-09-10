"""Codex Pro configuration schema."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

class _Base(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

# ── Channel configs ──────────────────────────────────────────────────────────

class ExecutionConfig(_Base):
    default_executor: Literal["local", "sandbox", "container", "remote"] = Field(
        default="sandbox",
        json_schema_extra={
            "status": "effective", "ref": "agent/executors/factory.py:18",
            "desc_zh": "默认命令执行器类型",
            "desc_en": "Default command executor type",
        },
    )
    sandbox_root: str = Field(
        default="/tmp/codex-pro-sandbox",
        json_schema_extra={
            "status": "effective", "ref": "agent/executors/factory.py:22",
            "desc_zh": "sandbox 执行器的根目录",
            "desc_en": "Root directory for the sandbox executor",
        },
    )
    container_image: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/executors/factory.py:24",
            "desc_zh": "container 执行器使用的镜像",
            "desc_en": "Image used by the container executor",
        },
    )
    remote_host: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/executors/factory.py:27",
            "desc_zh": "remote 执行器的目标主机",
            "desc_en": "Target host for the remote executor",
        },
    )
    remote_user: str = Field(
        default="root",
        json_schema_extra={
            "status": "effective", "ref": "agent/executors/factory.py:28",
            "desc_zh": "remote 执行器登录用户名",
            "desc_en": "Login user for the remote executor",
        },
    )
    remote_key_path: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/executors/factory.py:29",
            "desc_zh": "remote 执行器 SSH 私钥路径",
            "desc_en": "SSH private key path for the remote executor",
        },
    )
    remote_strict_host_key: Literal["no", "accept-new", "yes"] = Field(
        default="accept-new",
        json_schema_extra={
            "status": "effective", "ref": "agent/executors/factory.py:30",
            "desc_zh": "SSH 主机密钥严格校验策略",
            "desc_en": "SSH strict host key checking policy",
        },
    )
    remote_connect_timeout: int = Field(
        default=10,
        json_schema_extra={
            "status": "effective", "ref": "agent/executors/factory.py:31",
            "desc_zh": "remote 执行器连接超时(秒)",
            "desc_en": "Remote executor connection timeout (seconds)",
        },
    )
    network_policy: Literal["allow", "deny", "restricted"] = Field(
        default="deny",
        json_schema_extra={
            "status": "effective", "ref": "security/tool_policy.py:141",
            "desc_zh": "执行环境的网络访问策略",
            "desc_en": "Network access policy for the execution environment",
        },
    )
    max_background_tasks: int = Field(
        default=64,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:259",
            "desc_zh": "后台任务并发上限,超限时可丢弃任务被丢、不可丢任务排队",
            "desc_en": "Max concurrent background tasks; over limit discardable dropped, durable queued",
        },
    )

# ── Permission configs ───────────────────────────────────────────────────────

class ApprovalConfig(_Base):
    require_approval: list[str] = Field(
        default_factory=lambda: [
            "cronjob",
            "delegate_task",
            "dep_install",
            "exec",
            "execute_code",
            "process",
            "skill_install",
            "skill_manage",
            "spawn_task",
        ],
        json_schema_extra={
            "status": "effective", "ref": "agent/approval_gate.py:291",
            "desc_zh": "执行前必须审批的工具/动作列表。风险等级(EXEC/DANGEROUS)本身即要求审批，本列表用于额外追加，不能反向豁免；delegate_task/spawn_task 在列是因为它们派发的 worker 可以调用 exec，派发处是调用方权限仍然已知的最后一环",
            "desc_en": (
                "Tools/actions that require approval before running. The risk tier "
                "(EXEC/DANGEROUS) already requires approval on its own; this list only "
                "adds tools and can never exempt one. delegate_task/spawn_task are listed "
                "because a worker they dispatch can call exec, and the dispatch is the "
                "last point where the caller's own authority is still known"
            ),
        },
    )
    auto_approve: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "agent/approval_gate.py:116",
            "desc_zh": "自动批准的工具/动作列表",
            "desc_en": "Tools/actions auto-approved without prompting",
        },
    )
    auto_deny: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "agent/approval_gate.py:285",
            "desc_zh": "自动拒绝的工具/动作列表",
            "desc_en": "Tools/actions auto-denied",
        },
    )
    default_policy: Literal["approve", "deny", "ask"] = Field(
        default="approve",
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:143",
            "desc_zh": "未命中规则时的默认审批策略",
            "desc_en": "Default approval policy when no rule matches",
        },
    )
    wait_timeout_seconds: int = Field(
        default=300,
        json_schema_extra={
            "status": "effective", "ref": "agent/approval_gate.py:226",
            "desc_zh": "等待人工审批的超时(秒)",
            "desc_en": "Timeout while waiting for human approval (seconds)",
        },
    )
    cli_auto_approve: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/approval_gate.py:301",
            "desc_zh": "CLI 通道是否自动批准",
            "desc_en": "Auto-approve actions on the CLI channel",
        },
    )
    trusted_channels: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "agent/approval_gate.py:306",
            "desc_zh": "免审批的可信通道列表",
            "desc_en": "Trusted channels exempt from approval",
        },
    )
    mode: Literal["manual", "smart", "off"] = Field(
        default="smart",
        json_schema_extra={
            "status": "effective", "ref": "agent/approval_gate.py:128",
            "desc_zh": "审批模式:manual 全人工,smart 智能判定,off 关闭",
            "desc_en": "Approval mode: manual, smart, or off",
        },
    )
    smart_model: str = Field(
        default="",
        json_schema_extra={
            "status": "effective", "ref": "agent/approval_gate.py:184",
            "desc_zh": "smart 模式判定审批所用模型",
            "desc_en": "Model used to judge approvals in smart mode",
        },
    )
    unattended_policy: Literal["deny", "allow_safe"] = Field(
        default="deny",
        json_schema_extra={
            "status": "effective", "ref": "agent/approval_gate.py:316",
            "desc_zh": "无人值守时的审批策略",
            "desc_en": "Approval policy when running unattended",
        },
    )

class ElevatedConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "agent/approval_gate.py:357",
            "desc_zh": "是否启用提权操作机制",
            "desc_en": "Enable the elevated-permission mechanism",
        },
    )
    allow_from: dict[str, list[str]] = Field(
        default_factory=dict,
        json_schema_extra={
            "status": "effective", "ref": "agent/approval_gate.py:359",
            "desc_zh": "各通道允许提权的用户映射",
            "desc_en": "Per-channel mapping of users allowed to elevate",
        },
    )

class PermissionsConfig(_Base):
    admin_users: list[str] = Field(
        default_factory=list,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:783",
            "desc_zh": "全局管理员用户列表",
            "desc_en": "Global administrator users",
        },
    )
    approval: ApprovalConfig = Field(default_factory=ApprovalConfig)
    elevated: ElevatedConfig = Field(default_factory=ElevatedConfig)

class SecurityConfig(_Base):
    profile: Literal["personal_cli", "daemon", "public_gateway"] = Field(
        default="personal_cli",
        json_schema_extra={
            "status": "effective", "ref": "security/tool_policy.py:127",
            "desc_zh": "整体安全档位预设",
            "desc_en": "Overall security profile preset",
        },
    )

class CredentialSecurityConfig(_Base):
    encryption_key_env: str = Field(
        default="CODEX_PRO_CREDENTIAL_KEY",
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:167",
            "desc_zh": "存放凭据加密密钥的环境变量名",
            "desc_en": "Environment variable holding the credential encryption key",
        },
    )
    require_encryption: bool = Field(
        default=True,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:168",
            "desc_zh": "是否强制要求凭据加密",
            "desc_en": "Require credential encryption",
        },
    )

# ── Session configs ──────────────────────────────────────────────────────────

