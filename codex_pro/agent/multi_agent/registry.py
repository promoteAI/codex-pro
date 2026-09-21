"""Worker registry — stores worker profile templates for delegation."""

from __future__ import annotations

from collections.abc import Callable, Iterable

from codex_pro.agent.multi_agent.models import WorkerProfile


class WorkerRegistry:
    """Stores worker profile templates that DelegateTool can reference.

    Profiles come from two sources: the static ``multi_agent.worker_profiles``
    config block (baked in at bootstrap via ``from_config``) and, when a
    ``loader`` is supplied, any additional runtime profile the dashboard's
    "Add agent" menu created (see ``codex_pro.agent.multi_agent.store``).

    The ``loader`` is called by ``reload()`` and must return the *complete* set
    of profiles the registry should hold at that moment. This lets profiles
    created at runtime become visible to ``delegate_task`` without a restart.
    """

    def __init__(
        self,
        profiles: Iterable[WorkerProfile],
        loader: Callable[[], Iterable[WorkerProfile]] | None = None,
    ):
        self._profiles = {p.id: p for p in profiles if p.id}
        self._loader = loader

    @classmethod
    def from_config(cls, config) -> "WorkerRegistry":
        return cls(_profiles_from_config(config))

    def reload(self) -> "WorkerRegistry":
        """Re-read the profile set from the loader (config + runtime store).

        No-op when the registry was built without a loader (the pure static
        config case). Returns self for chaining.
        """
        if self._loader is not None:
            self._profiles = {p.id: p for p in self._loader() if p.id}
        return self

    def get(self, profile_id: str) -> WorkerProfile | None:
        return self._profiles.get(profile_id)

    def list(self) -> list[WorkerProfile]:
        return list(self._profiles.values())

    def list_ids(self) -> list[str]:
        return list(self._profiles.keys())


def _profiles_from_config(config) -> list[WorkerProfile]:
    """Map a ``MultiAgentConfig`` object into a list of ``WorkerProfile``."""
    profiles = []
    for cfg in getattr(config, "worker_profiles", []):
        profiles.append(WorkerProfile(
            id=cfg.id,
            name=cfg.name or cfg.id,
            description=cfg.description,
            instructions=cfg.instructions,
            default_tools=tuple(cfg.default_tools),
            model=cfg.model,
            max_iterations=cfg.max_iterations,
            max_tokens=cfg.max_tokens,
            temperature=cfg.temperature,
        ))
    return profiles
