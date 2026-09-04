"""Pipeline package — decomposes AgentLoop into discrete stages."""

from codex_pro.agent.pipeline.types import PipelineContext, InferenceResult
from codex_pro.agent.pipeline.context_stage import ContextStage
from codex_pro.agent.pipeline.inference_stage import InferenceStage
from codex_pro.agent.pipeline.response_stage import ResponseStage

__all__ = [
    "PipelineContext",
    "InferenceResult",
    "ContextStage",
    "InferenceStage",
    "ResponseStage",
]
