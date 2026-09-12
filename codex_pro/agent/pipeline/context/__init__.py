"""Turn-context helpers extracted from ContextStage orchestration.

Mirrors reference/codex fragment-style separation: pure intent / input /
recall helpers live here; ContextStage remains the thin turn orchestrator.
"""

from __future__ import annotations

from codex_pro.agent.pipeline.context.artifact_intent import (
    ARTIFACT_CONTINUATION_TTL_SECONDS,
    ARTIFACT_CONTINUATION_VERSION,
    artifact_continuation_is_live,
    artifact_output_required,
    expects_artifact,
    wants_artifact_resume,
)
from codex_pro.agent.pipeline.context.memory_snapshot import (
    MemoryContextResult,
    resolve_memory_context,
)
from codex_pro.agent.pipeline.context.recall import filter_recall_by_snapshot
from codex_pro.agent.pipeline.context.retrieval import bounded_retrieve, fetch_knowledge
from codex_pro.agent.pipeline.context.turn_injections import (
    apply_artifact_injection,
    apply_output_continuation,
    apply_plan_injection,
)
from codex_pro.agent.pipeline.context.turn_input import (
    build_user_message_with_reply,
    contextual_retrieval_query,
    planning_context,
    wants_resume,
)

__all__ = [
    "ARTIFACT_CONTINUATION_TTL_SECONDS",
    "ARTIFACT_CONTINUATION_VERSION",
    "MemoryContextResult",
    "apply_artifact_injection",
    "apply_output_continuation",
    "apply_plan_injection",
    "artifact_continuation_is_live",
    "artifact_output_required",
    "bounded_retrieve",
    "build_user_message_with_reply",
    "contextual_retrieval_query",
    "expects_artifact",
    "fetch_knowledge",
    "filter_recall_by_snapshot",
    "planning_context",
    "resolve_memory_context",
    "wants_artifact_resume",
    "wants_resume",
]
