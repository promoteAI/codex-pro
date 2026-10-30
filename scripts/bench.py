# -*- coding: utf-8 -*-
"""Repeatable performance baselines for codex-pro local hot paths.

Measures the CPU/IO-bound operations the optimization plan tracks before
and after refactoring the large modules (memory/store.py, session/
manager.py, config/loader.py). Model-call latency is deliberately
excluded: it dominates end-to-end time but is unaffected by local
refactors.

Usage:
    uv run python scripts/bench.py                     # run + print table
    uv run python scripts/bench.py --json bench.json   # also save raw results
    uv run python scripts/bench.py --quick             # reduced N (smoke test)

Numbers are machine-specific; compare only runs from the same machine.
"""
from __future__ import annotations

import argparse
import json
import statistics
import tempfile
import time
from pathlib import Path

from loguru import logger

# load_config logs every invocation at DEBUG; silence for clean bench output.
logger.remove()

from codex_pro.config.loader import load_config  # noqa: E402
from codex_pro.memory.store import MemoryStore  # noqa: E402
from codex_pro.memory.types import MemoryEntry, MemoryType  # noqa: E402
from codex_pro.session.manager import SessionManager  # noqa: E402


def _timed(fn, repeats: int) -> dict[str, float]:
    """Run fn repeats times, return min/mean/max wall seconds."""
    times = []
    for _ in range(repeats):
        t0 = time.perf_counter()
        fn()
        times.append(time.perf_counter() - t0)
    return {"min": min(times), "mean": statistics.mean(times), "max": max(times)}


def _fmt(seconds: float) -> str:
    if seconds >= 1.0:
        return f"{seconds*1000:8.1f} ms"
    return f"{seconds*1e6:8.1f} us"


# ── Benchmark scenarios ──────────────────────────────────────────────────────

def bench_config_load(tmp: Path, n: int) -> tuple[str, str, dict[str, float], int]:
    """Full load_config: packaged defaults + user yaml merge + validation."""
    cfg_file = tmp / "bench-config.yaml"
    cfg_file.write_text(
        "workspace: ''\n"
        "memory:\n"
        "  archival_threshold: 0.05\n"
        "channels:\n"
        "  telegram:\n"
        "    enabled: false\n"
        "  slack:\n"
        "    enabled: false\n"
        "models:\n"
        "  default_model: test-model\n",
        encoding="utf-8",
    )

    def run() -> None:
        for _ in range(n):
            load_config(config_path=cfg_file)

    return "config.load_config", f"x{n}", _timed(run, repeats=5), n


def bench_memory_add(tmp: Path, n: int) -> tuple[str, str, dict[str, float], int]:
    """Sequential add(): file lock + dedup scan + JSON save per entry."""
    store = MemoryStore(tmp / "mem-add")

    def run() -> None:
        for i in range(n):
            store.add(MemoryEntry(
                type=MemoryType.USER,
                key=f"fact-{i}",
                content=f"User preference number {i} about topic {i % 20}.",
                importance=0.5,
            ))

    stats = _timed(run, repeats=3)
    return "memory.add (sequential)", f"x{n}", stats, n


def _seed_store(tmp: Path, n: int) -> MemoryStore:
    store = MemoryStore(tmp / f"mem-search-{n}")
    for i in range(n):
        store.add(MemoryEntry(
            type=MemoryType.USER,
            key=f"fact-{i}",
            content=f"Preference {i}: likes topic {i % 50}, dislikes topic {(i + 7) % 50}.",
            importance=0.5,
        ))
    return store


def bench_memory_search(tmp: Path, n: int) -> list[tuple[str, str, dict[str, float], int]]:
    """Keyword + scored search over a seeded store (in-memory index)."""
    store = _seed_store(tmp, n)
    queries = [f"topic {i}" for i in range(20)]
    out = []

    def kw() -> None:
        for q in queries:
            store.search_keyword(q, limit=10)

    def scored() -> None:
        for q in queries:
            store.search_scored(q, limit=10)

    def snapshot() -> None:
        store.get_snapshot(session_key=None)

    out.append(("memory.search_keyword", f"{len(queries)}q@{n}", _timed(kw, repeats=5), len(queries)))
    out.append(("memory.search_scored", f"{len(queries)}q@{n}", _timed(scored, repeats=5), len(queries)))
    out.append(("memory.get_snapshot", f"@{n}", _timed(snapshot, repeats=5), 1))
    return out


def bench_memory_cold_load(tmp: Path, n: int) -> tuple[str, str, dict[str, float], int]:
    """New store over existing files: first access re-reads + parses JSON."""
    _seed_store(tmp, n)  # ensure files exist

    def run() -> None:
        cold = MemoryStore(tmp / f"mem-search-{n}")
        cold.search_keyword("topic 1", limit=10)  # forces _reload_type

    return "memory.cold_load", f"@{n}", _timed(run, repeats=5), 1


def bench_session(tmp: Path, n: int) -> list[tuple[str, str, dict[str, float], int]]:
    """SessionManager get_or_create (create+persist) and save round-trips."""
    import asyncio

    mgr = SessionManager(sessions_dir=tmp / "sessions")
    keys = [f"cli:bench-{i}" for i in range(n)]
    out = []

    async def _create_all() -> list:
        for k in keys:
            mgr._cache.pop(k, None)  # force real create path
        return [await mgr.get_or_create(k) for k in keys]

    def create() -> None:
        asyncio.run(_create_all())

    out.append(("session.get_or_create", f"x{n}", _timed(create, repeats=3), n))

    sessions = asyncio.run(_create_all())

    async def _save_all() -> None:
        for s in sessions:
            await mgr.save(s)

    def save_all() -> None:
        asyncio.run(_save_all())

    out.append(("session.save", f"x{n}", _timed(save_all, repeats=3), n))
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, default=None, help="save raw results JSON")
    parser.add_argument("--quick", action="store_true", help="reduced N for smoke runs")
    args = parser.parse_args()

    scale = 0.2 if args.quick else 1.0
    n_mem = max(20, int(200 * scale))
    n_sess = max(10, int(100 * scale))
    n_cfg = max(10, int(50 * scale))

    results: list[dict[str, object]] = []
    with tempfile.TemporaryDirectory(prefix="codex-pro-bench-") as td:
        tmp = Path(td)
        scenarios: list[tuple[str, str, dict[str, float], int]] = []
        scenarios.append(bench_config_load(tmp, n_cfg))
        scenarios.append(bench_memory_add(tmp, n_mem))
        scenarios.extend(bench_memory_search(tmp, n_mem))
        scenarios.append(bench_memory_cold_load(tmp, n_mem))
        scenarios.extend(bench_session(tmp, n_sess))

        print(f"\n{'benchmark':<28} {'scale':<10} {'min':>12} {'mean':>12} {'max':>12}  per-op(mean)")
        print("-" * 92)
        for name, scale_label, stats, count in scenarios:
            per_op = stats["mean"] / count
            print(f"{name:<28} {scale_label:<10} {_fmt(stats['min'])} {_fmt(stats['mean'])} "
                  f"{_fmt(stats['max'])}  {_fmt(per_op)}")
            results.append({
                "benchmark": name, "scale": scale_label,
                "min_s": stats["min"], "mean_s": stats["mean"], "max_s": stats["max"],
                "ops": count, "per_op_s": per_op,
            })

    if args.json:
        args.json.write_text(json.dumps({"results": results}, indent=2), encoding="utf-8")
        print(f"\nsaved: {args.json}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
