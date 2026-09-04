"""Configuration package."""

from __future__ import annotations

from codex_pro.config.loader import load_config
from codex_pro.config.schema import Config

__all__ = ["Config", "load_config"]
