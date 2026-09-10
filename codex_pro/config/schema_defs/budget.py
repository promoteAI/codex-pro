"""Codex Pro configuration schema."""

from __future__ import annotations


from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

class _Base(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

# ── Channel configs ──────────────────────────────────────────────────────────

class CostConfig(_Base):
    enabled: bool = Field(
        default=False,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:283",
            "desc_zh": "是否启用成本追踪与预算控制",
            "desc_en": "Enable cost tracking and budget control",
        },
    )
    daily_budget_usd: float = Field(
        default=0.0,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:284",
            "desc_zh": "每日成本预算(美元,0 为不限)",
            "desc_en": "Daily cost budget in USD (0 = unlimited)",
        },
    )
    soft_threshold_ratio: float = Field(
        default=0.8,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:285",
            "desc_zh": "达到预算该比例时发出软告警",
            "desc_en": "Budget ratio at which a soft warning is raised",
        },
    )
    pricing_overrides: dict = Field(
        default_factory=dict,
        json_schema_extra={
            "status": "effective", "ref": "agent/loop.py:286",
            "desc_zh": "模型定价覆盖表",
            "desc_en": "Model pricing override table",
        },
    )

