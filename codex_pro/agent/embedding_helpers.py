"""Embedding helpers shared across the agent loop.

Extracted from codex_pro.agent.loop to reduce its size while keeping the
public API stable (AgentLoop still lives in loop.py).
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from loguru import logger

from codex_pro.runtime_paths import bundled_skills_dir


def _resolve_builtin_skills_dir(workspace: Path, configured_path: str) -> Path | None:
    raw_path = Path(configured_path).expanduser()
    candidates: list[Path] = []
    if raw_path.is_absolute():
        candidates.append(raw_path)
    else:
        candidates.append(workspace / raw_path)
        bundled = bundled_skills_dir()
        if bundled:
            candidates.append(bundled)
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


_EMBED_CIRCUIT_THRESHOLD = 3


def _embed_model_identity(provider: Any, emb_model: str | None) -> str:
    """Stable embedding-model id: unwrap transport wrappers (rate-limit /
    credential-pool) to the concrete provider class, then append the model.

    The id is persisted in the vectors table and compared on startup to detect
    a genuine embedding-model change. Deriving it from the OUTER wrapper class
    (e.g. RateLimitedProvider) would flip the id whenever rate-limiting or
    credential pooling is toggled between runs, wrongly marking every stored
    vector stale and forcing a full re-embed even though the model never
    changed. Unwrapping to the real provider keeps the id tied to what actually
    determines the embedding space."""
    inner = provider
    # Wrappers expose the delegate as `_inner`; follow the chain to the bottom.
    for _ in range(8):  # bounded guard against accidental cycles
        nxt = getattr(inner, "_inner", None)
        if nxt is None or nxt is inner:
            break
        inner = nxt
    return f"{type(inner).__name__.lower()}:{emb_model or 'default'}"


class _ProviderEmbedFn:
    """provider embedding 入口的熔断包装。连续失败达阈值后停止调用底层、
    返回 []（对检索与 flush 两条路径都安全），并只告警一次。止损后由重启
    重新决策 backend（不做运行时热切换，避免维度污染）。"""

    def __init__(self, provider: Any, model: str | None):
        self._provider = provider
        self._model = model
        self._consecutive_failures = 0
        self.tripped = False

    async def __call__(self, text: str) -> list[float]:
        if self.tripped:
            return []
        try:
            result = await self._provider.embed(text, model=self._model)
        except Exception as e:
            logger.debug("Provider embedding raised: {}", e)
            result = None
        if result:
            self._consecutive_failures = 0
            return result
        self._consecutive_failures += 1
        if self._consecutive_failures >= _EMBED_CIRCUIT_THRESHOLD and not self.tripped:
            self.tripped = True
            logger.warning(
                "Provider embedding failed {} times consecutively; embedding backfill "
                "paused. Fix the endpoint or set memory.embedding_backend=local and "
                "restart. Vector search degrades to keyword-only until then.",
                _EMBED_CIRCUIT_THRESHOLD,
            )
        return []


def resolve_embed_fallback(
    embed_provider,
    emb_model,
    local_model_name,
    local_load_timeout=60.0,
    hf_endpoint="",
    cache_dir="",
    max_load_attempts=5,
    retry_backoff=30.0,
):
    """Resolve the embedding tier: provider-backed when available, else the
    local fastembed fallback (zero-config vector search), else nothing.

    Returns (embed_fn | None, embed_model_id, local_embedder | None)."""
    if embed_provider is not None:

        async def _embed(text: str, _p=embed_provider, _model=emb_model) -> list[float]:
            result = await _p.embed(text, model=_model)
            return result or []

        model_id = _embed_model_identity(embed_provider, emb_model)
        return _embed, model_id, None

    if local_model_name:
        from codex_pro.memory.local_embed import LocalEmbedder

        resolved_cache = str(Path(cache_dir).expanduser()) if cache_dir else ""
        local = LocalEmbedder(
            local_model_name,
            load_timeout_seconds=local_load_timeout,
            hf_endpoint=hf_endpoint,
            cache_dir=resolved_cache,
            max_load_attempts=max_load_attempts,
            retry_backoff_seconds=retry_backoff,
        )
        if local.available:
            logger.info(
                "No embed-capable provider; using local embedding fallback '{}'",
                local_model_name,
            )
            return local.embed, local.model_id, local
        logger.warning(
            "fastembed not importable; vector search degrades to keyword mode",
        )
        return None, "", None

    logger.warning(
        "No embedding-capable provider registered and local fallback disabled; "
        "vector search and hybrid retrieval will degrade to keyword mode"
    )
    return None, "", None


def pick_embed_candidate(backend, provider, router, emb_model):
    """挑候选 embed provider（不发网络）。local 模式恒不挑 provider。
    返回 (candidate_provider | None, resolved_model)。"""
    if backend == "local":
        return None, emb_model
    if provider.supports_embed():
        return provider, emb_model
    if router is not None:
        cand, routed_model = router.find_embed_provider(emb_model or "")
        if cand is not None:
            return cand, (routed_model or emb_model)
    return None, emb_model


async def probe_embed_provider(provider, model, timeout) -> int:
    """发一次探针 embedding。成功且非空返回维度(>0)，否则返回 0。"""
    try:
        vec = await asyncio.wait_for(provider.embed("ping", model=model), timeout=timeout)
    except Exception as e:
        logger.info("Embedding probe failed, will fall back to local: {}", e)
        return 0
    return len(vec) if vec else 0


def _should_publish_reply(event: Any, final_text: str) -> bool:
    """Reply convergence gate. Normal rounds always publish (behaviour unchanged).

    Inspection rounds (metadata _inspection=True) are silenced when the agent's
    final reply is empty or carries the INSPECT_OK sentinel — honouring the
    "no news, stay silent" contract. The sentinel check only applies to
    inspection rounds, so ordinary replies that happen to contain the literal
    "INSPECT_OK" are never suppressed.
    """
    if not event.metadata.get("_inspection"):
        return True
    from codex_pro.agent.inspection.policy import should_deliver

    return should_deliver(final_text)
