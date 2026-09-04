"""Self-evolving skill harness.

Closed-loop pipeline:
  TrajectoryRecorder  → captures runtime experience via plugin hooks
  TrajectoryStore     → SQLite-backed persistence for trajectories/candidates/runs
  Evolver             → LLM-driven candidate skill proposals
  PromotionGate       → A/B evaluation against a baseline dataset before promotion
  EvolutionScheduler  → manual / threshold / cron triggers
  EvolutionEngine     → orchestrates the full record → propose → gate → promote loop
"""

from __future__ import annotations

from codex_pro.evolution.engine import EvolutionEngine
from codex_pro.evolution.evolver import Evolver
from codex_pro.evolution.gate import PromotionGate
from codex_pro.evolution.recorder import TrajectoryRecorder
from codex_pro.evolution.scheduler import EvolutionScheduler
from codex_pro.evolution.store import TrajectoryStore
from codex_pro.evolution.types import (
    EvolutionRun,
    SkillCandidate,
    ToolCall,
    Trajectory,
)

__all__ = [
    "EvolutionEngine",
    "EvolutionRun",
    "EvolutionScheduler",
    "Evolver",
    "PromotionGate",
    "SkillCandidate",
    "ToolCall",
    "Trajectory",
    "TrajectoryRecorder",
    "TrajectoryStore",
]
