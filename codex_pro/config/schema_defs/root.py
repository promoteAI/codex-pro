"""Codex Pro configuration schema - root Config class."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from codex_pro.config.schema_defs.channels import ChannelsConfig
from codex_pro.config.schema_defs.models import ModelsConfig
from codex_pro.config.schema_defs.tools import ToolsConfig
from codex_pro.config.schema_defs.security import (
    ExecutionConfig, PermissionsConfig, SecurityConfig, CredentialSecurityConfig,
)
from codex_pro.config.schema_defs.storage import (
    SessionConfig, MemoryConfig, KnowledgeConfig, StorageConfig, SpillConfig, ArtifactConfig,
    MultiAgentConfig,
)
from codex_pro.config.schema_defs.gateway import ObservabilityConfig, CompressionConfig, GatewayConfig
from codex_pro.config.schema_defs.system import (
    SkillsConfig, BusConfig, RateLimitConfig, CircuitBreakerConfig,
    PlanningConfig, A2AConfig, PluginsConfig, EvalConfig, EvolutionConfig,
    SchedulerConfig, CheckpointConfig, ValidationConfig,
    MediaUnderstandingConfig, RuntimeConfig,
)
from codex_pro.config.schema_defs.ui import UIConfig, AgentBehaviorConfig
from codex_pro.config.schema_defs.budget import CostConfig


class _Base(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Config(_Base):
    security: SecurityConfig = Field(default_factory=SecurityConfig)
    channels: ChannelsConfig = Field(default_factory=ChannelsConfig)
    models: ModelsConfig = Field(default_factory=ModelsConfig)
    tools: ToolsConfig = Field(default_factory=ToolsConfig)
    execution: ExecutionConfig = Field(default_factory=ExecutionConfig)
    permissions: PermissionsConfig = Field(default_factory=PermissionsConfig)
    credentials: CredentialSecurityConfig = Field(default_factory=CredentialSecurityConfig)
    session: SessionConfig = Field(default_factory=SessionConfig)
    memory: MemoryConfig = Field(default_factory=MemoryConfig)
    knowledge: KnowledgeConfig = Field(default_factory=KnowledgeConfig)
    multi_agent: MultiAgentConfig = Field(default_factory=MultiAgentConfig)
    scheduler: SchedulerConfig = Field(default_factory=SchedulerConfig)
    checkpoint: CheckpointConfig = Field(default_factory=CheckpointConfig)
    validation: ValidationConfig = Field(default_factory=ValidationConfig)
    media_understanding: MediaUnderstandingConfig = Field(default_factory=MediaUnderstandingConfig)
    runtime: RuntimeConfig = Field(default_factory=RuntimeConfig)
    storage: StorageConfig = Field(default_factory=StorageConfig)
    spill: SpillConfig = Field(default_factory=SpillConfig)
    artifacts: ArtifactConfig = Field(default_factory=ArtifactConfig)
    observability: ObservabilityConfig = Field(default_factory=ObservabilityConfig)
    skills: SkillsConfig = Field(default_factory=SkillsConfig)
    compression: CompressionConfig = Field(default_factory=CompressionConfig)
    gateway: GatewayConfig = Field(default_factory=GatewayConfig)
    planning: PlanningConfig = Field(default_factory=PlanningConfig)
    a2a: A2AConfig = Field(default_factory=A2AConfig)
    evaluation: EvalConfig = Field(default_factory=EvalConfig)
    bus: BusConfig = Field(default_factory=BusConfig)
    rate_limit: RateLimitConfig = Field(default_factory=RateLimitConfig)
    circuit_breaker: CircuitBreakerConfig = Field(default_factory=CircuitBreakerConfig)
    plugins: PluginsConfig = Field(default_factory=PluginsConfig)
    ui: UIConfig = Field(default_factory=UIConfig)
    agent: AgentBehaviorConfig = Field(default_factory=AgentBehaviorConfig)
    evolution: EvolutionConfig = Field(default_factory=EvolutionConfig)
    cost: CostConfig = Field(default_factory=CostConfig)
    workspace: str = Field(
        default="~/.codex-pro",
        json_schema_extra={
            "status": "effective", "ref": "app.py:64",
            "desc_zh": "agent 工作区根目录",
            "desc_en": "Agent workspace root directory",
        },
    )
